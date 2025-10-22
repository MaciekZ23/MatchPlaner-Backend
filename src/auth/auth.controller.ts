import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';
import { Public } from './public.decorator';

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60, limit: 5 } })
  @Post('admin/auth/google/verify')
  async googleVerify(@Body() body: { idToken: string }) {
    return this.auth.verifyGoogleAndLogin(body.idToken);
  }

  @Public()
  @Throttle({ default: { ttl: 60, limit: 10 } })
  @Post('auth/guest')
  async guest(@Body() body: { deviceId: string }) {
    return this.auth.guestLogin(body.deviceId);
  }

  @Public()
  @Throttle({ default: { ttl: 60, limit: 30 } })
  @Post('auth/refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refreshToken(refreshToken);
  }
}
