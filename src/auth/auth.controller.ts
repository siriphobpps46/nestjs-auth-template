import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: any) {
    return this.authService.refresh(user.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: any, @Body() body: { refresh_token: string }) {
    if (!body.refresh_token) {
      throw new UnauthorizedException('Refresh token is required to log out');
    }
    return this.authService.logout(user.id, body.refresh_token);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('user:update')
  @Post('force-logout/:userId')
  @HttpCode(HttpStatus.OK)
  forceLogout(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.authService.forceLogout(userId);
  }
}

// Inline class exception fallback import to ensure clean compilation
import { UnauthorizedException } from '@nestjs/common';
