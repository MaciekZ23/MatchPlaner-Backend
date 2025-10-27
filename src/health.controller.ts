import {
  Controller,
  Get,
  Head,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth(@Query('key') key: string) {
    if (process.env.HEALTH_KEY && key !== process.env.HEALTH_KEY) {
      throw new UnauthorizedException('Invalid health key');
    }
    return { status: 'ok', time: new Date().toISOString() };
  }

  @Public()
  @Head()
  headHealth(@Query('key') key: string) {
    if (process.env.HEALTH_KEY && key !== process.env.HEALTH_KEY) {
      throw new UnauthorizedException('Invalid health key');
    }
    return;
  }
}
