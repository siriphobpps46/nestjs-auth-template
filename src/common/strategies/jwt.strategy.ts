import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-access-token-secret',
    });
  }

  async validate(payload: any) {
    // 1. Validate token type
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const userId = payload.sub;

    // 2. Check token version from Redis cache
    const redisKey = `auth:${userId}:token_version`;
    const cachedVersionStr = await this.redis.get(redisKey);
    let tokenVersion: number;

    if (cachedVersionStr !== null) {
      tokenVersion = parseInt(cachedVersionStr, 10);
    } else {
      // Fallback: Fetch user from Database to verify and warm up cache
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.is_active || user.deleted_at) {
        throw new UnauthorizedException('User is inactive or has been deleted');
      }

      tokenVersion = user.token_version;
      // Cache the version in Redis (default to 3600 seconds/1 hour TTL if not set)
      await this.redis.set(redisKey, tokenVersion.toString(), 3600);
    }

    // 3. Compare payload version with active token version
    if (payload.token_version !== tokenVersion) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    // 4. Double check database active & soft-delete state (to instantly ban user if DB status changed)
    const activeUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        is_active: true,
        deleted_at: true,
      },
    });

    if (!activeUser || !activeUser.is_active || activeUser.deleted_at) {
      throw new UnauthorizedException('User is inactive or has been deleted');
    }

    // Return request.user payload
    return {
      id: activeUser.id,
      username: activeUser.username,
      email: activeUser.email,
      roles: payload.roles,
      menus: payload.menus,
    };
  }
}
