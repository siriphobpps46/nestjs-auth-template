import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') || 'your-refresh-token-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const authHeader = req.get('Authorization');
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const refreshToken = authHeader.replace('Bearer ', '').trim();

    return {
      id: payload.sub,
      username: payload.username,
      refreshToken,
    };
  }
}
