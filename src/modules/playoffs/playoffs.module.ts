import { Module } from '@nestjs/common';
import { PlayoffsService } from './playoffs.service';
import { PlayoffsController } from './playoffs.controller';
import { PrismaService } from '../../database/prisma.service';
import { StandingsService } from './standings.service';

@Module({
  controllers: [PlayoffsController],
  providers: [PlayoffsService, PrismaService, StandingsService],
  exports: [PlayoffsService],
})
export class PlayoffsModule {}
