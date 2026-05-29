import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../shared/redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User session not found');
    }

    const userId = user.id;
    const redisKey = `auth:${userId}:permissions`;

    // 1. Attempt to fetch permissions from Redis
    let userPermissions = await this.redis.getJson<string[]>(redisKey);

    // 2. Fallback: query DB and repopulate Redis cache if missing
    if (!userPermissions) {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          user_roles: {
            include: {
              role: {
                include: {
                  role_permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!dbUser || !dbUser.is_active || dbUser.deleted_at) {
        throw new ForbiddenException('User is inactive or deleted');
      }

      const permissionsSet = new Set<string>();
      for (const ur of dbUser.user_roles) {
        if (!ur.role.is_active) continue;
        for (const rp of ur.role.role_permissions) {
          permissionsSet.add(rp.permission.name);
        }
      }

      userPermissions = Array.from(permissionsSet);
      // Cache permissions in Redis (e.g. 1 hour)
      await this.redis.setJson(redisKey, userPermissions, 3600);
    }

    // 3. Verify user has at least one of the required permissions (OR logic)
    const hasPermission = requiredPermissions.some((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
