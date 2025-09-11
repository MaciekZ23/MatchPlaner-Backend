import { Controller, Get, Param, Post, Body, Patch } from '@nestjs/common';
import { VotingService } from './voting.service';
import { VoteRequestDto } from './dto/vote.dto';

@Controller('voting')
export class VotingController {
  constructor(private service: VotingService) {}

  @Get(':matchId')
  getState(@Param('matchId') matchId: string) {
    return this.service.getState(matchId);
  }

  @Post('vote/:matchId')
  vote(@Param('matchId') matchId: string, @Body() body: { playerId: string }) {
    const payload: VoteRequestDto = { matchId, playerId: body.playerId };
    return this.service.vote(payload);
  }

  @Patch('status/:matchId')
  setStatus(
    @Param('matchId') matchId: string,
    @Body() body: { status: 'NOT_STARTED' | 'OPEN' | 'CLOSED' },
  ) {
    return this.service.setStatus(matchId, body.status);
  }
}
