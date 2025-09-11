import { Module } from '@nestjs/common';
import { VotingService } from './voting.service';
import { VotingController } from './voting.controller';
import { PrismaService } from 'src/database/prisma.service';

@Module({
  controllers: [VotingController],
  providers: [VotingService, PrismaService],
  exports: [VotingService],
})
export class VotingModule {}
