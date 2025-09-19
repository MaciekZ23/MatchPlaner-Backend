import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { VotingService } from './voting.service';
import { VoteRequestDto } from './dto/vote.dto';
import { OptionalJwtAuthGuard } from 'src/auth/optional-jwt.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('voting')
export class VotingController {
  constructor(private service: VotingService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':matchId')
  getState(@Param('matchId') matchId: string, @Req() req: any) {
    return this.service.getState(matchId, req.user ?? null);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('vote/:matchId')
  vote(
    @Param('matchId') matchId: string,
    @Body() body: { playerId: string },
    @Req() req: any,
  ) {
    const payload: VoteRequestDto = { matchId, playerId: body.playerId };
    return this.service.vote(payload, req.user);
  }

  @Patch('status/:matchId')
  setStatus(
    @Param('matchId') matchId: string,
    @Body() body: { status: 'NOT_STARTED' | 'OPEN' | 'CLOSED' },
  ) {
    return this.service.setStatus(matchId, body.status);
  }
}
