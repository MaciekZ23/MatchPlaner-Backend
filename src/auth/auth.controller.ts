import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('admin/auth/google/verify')
  async googleVerify(@Body() body: { idToken: string }) {
    return this.auth.verifyGoogleAndLogin(body.idToken);
  }

  @Post('auth/guest')
  async guest(@Body() body: { deviceId: string }) {
    return this.auth.guestLogin(body.deviceId);
  }
}
