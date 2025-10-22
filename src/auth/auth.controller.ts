import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { ttl: 60, limit: 5 } })
  @Post('admin/auth/google/verify')
  async googleVerify(@Body() body: { idToken: string }) {
    return this.auth.verifyGoogleAndLogin(body.idToken);
  }

  @Throttle({ default: { ttl: 60, limit: 10 } })
  @Post('auth/guest')
  async guest(@Body() body: { deviceId: string }) {
    return this.auth.guestLogin(body.deviceId);
  }
}
