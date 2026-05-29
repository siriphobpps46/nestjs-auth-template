import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private async generateTokens(user: any) {
    // 1. Gather all roles and permissions
    const rolesList = user.user_roles.filter((ur: any) => ur.role.is_active).map((ur: any) => ur.role.name);
    
    const permissionsSet = new Set<string>();
    const menusSet = new Set<string>();
    
    for (const ur of user.user_roles) {
      if (!ur.role.is_active) continue;
      for (const rp of ur.role.role_permissions) {
        permissionsSet.add(rp.permission.name);
        if (rp.permission.action === 'read') {
          menusSet.add(rp.permission.resource);
        }
      }
    }
    
    const permissionsList = Array.from(permissionsSet);
    const menusList = Array.from(menusSet);

    const accessSecret = this.configService.get<string>('JWT_SECRET') || 'your-access-token-secret';
    const accessExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
    
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'your-refresh-token-secret';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '15d';

    // 2. Access Token payload
    const accessPayload = {
      sub: user.id,
      username: user.username,
      type: 'access',
      iss: user.id,
      roles: rolesList,
      menus: menusList,
      name: user.username,
      token_version: user.token_version,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn as any,
    });

    // 3. Refresh Token payload
    const refreshPayload = {
      sub: user.id,
      username: user.username,
      type: 'refresh',
      iss: user.id,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as any,
    });

    // Decode payloads to calculate exact expiry times for DB & Redis
    const decodedAccess = this.jwtService.decode(accessToken) as any;
    const decodedRefresh = this.jwtService.decode(refreshToken) as any;

    const accessTtlSeconds = Math.max(decodedAccess.exp - Math.floor(Date.now() / 1000), 60);
    const expiresAt = new Date(decodedRefresh.exp * 1000);

    // 4. Save Refresh Token in Database
    await this.prisma.refreshToken.create({
      data: {
        user_id: user.id,
        token: refreshToken,
        expires_at: expiresAt,
      },
    });

    // 5. Cache permissions and token version in Redis
    const permissionsKey = `auth:${user.id}:permissions`;
    const tokenVersionKey = `auth:${user.id}:token_version`;

    await this.redis.setJson(permissionsKey, permissionsList, accessTtlSeconds);
    await this.redis.set(tokenVersionKey, user.token_version.toString(), accessTtlSeconds);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      roles: rolesList,
      menus: menusList,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
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

    if (!user || user.deleted_at) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const tokens = await this.generateTokens(user);

    // Clean up password
    const { password, ...userInfo } = user;

    return {
      ...tokens,
      user: userInfo,
    };
  }

  async refresh(refreshTokenString: string) {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'your-refresh-token-secret';
    
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshTokenString, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const dbToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshTokenString },
      include: {
        user: {
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
        },
      },
    });

    if (!dbToken || dbToken.is_revoked || dbToken.expires_at < new Date() || dbToken.user.deleted_at || !dbToken.user.is_active) {
      throw new UnauthorizedException('Invalid, revoked, or expired refresh token session');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { is_revoked: true },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(dbToken.user);

    const { password, ...userInfo } = dbToken.user;

    return {
      ...tokens,
      user: userInfo,
    };
  }

  async logout(userId: string, refreshTokenString: string) {
    // 1. Revoke the token session in database
    await this.prisma.refreshToken.updateMany({
      where: {
        user_id: userId,
        token: refreshTokenString,
      },
      data: {
        is_revoked: true,
      },
    });

    // 2. Clean up expired tokens for this user to save space
    await this.prisma.refreshToken.deleteMany({
      where: {
        user_id: userId,
        OR: [
          { is_revoked: true },
          { expires_at: { lt: new Date() } },
        ],
      },
    });

    // 3. Clear Redis cache
    const permissionsKey = `auth:${userId}:permissions`;
    const tokenVersionKey = `auth:${userId}:token_version`;

    await this.redis.del(permissionsKey);
    await this.redis.del(tokenVersionKey);

    return { success: true, message: 'Successfully logged out' };
  }

  async forceLogout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deleted_at) {
      throw new BadRequestException('User not found');
    }

    // 1. Increment token version in database
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        token_version: { increment: 1 },
      },
    });

    // 2. Revoke all active refresh tokens in database
    await this.prisma.refreshToken.updateMany({
      where: { user_id: userId },
      data: { is_revoked: true },
    });

    // 3. Delete keys in Redis to force invalidation
    const permissionsKey = `auth:${userId}:permissions`;
    const tokenVersionKey = `auth:${userId}:token_version`;

    await this.redis.del(permissionsKey);
    await this.redis.del(tokenVersionKey);

    return {
      success: true,
      message: `User session has been forced invalidated. Token version incremented to ${updatedUser.token_version}`,
    };
  }
}
