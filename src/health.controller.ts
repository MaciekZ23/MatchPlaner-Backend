import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller('api')
export class HealthController {
  @Public()
  @Get('health')
  getHealth(@Query('key') key: string) {
    if (process.env.HEALTH_KEY && key !== process.env.HEALTH_KEY) {
      throw new UnauthorizedException('Invalid health key');
    }
    return { status: 'ok', time: new Date().toISOString() };
  }
}
