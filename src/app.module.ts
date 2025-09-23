import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { MatchesModule } from './modules/matches/matches.module';
import { VotingModule } from './modules/voting/voting.module';
import { AuthModule } from './auth/auth.module';
import { PlayoffsModule } from './modules/playoffs/playoffs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TournamentsModule,
    TeamsModule,
    MatchesModule,
    AuthModule,
    VotingModule,
    PlayoffsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
