import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { TeamDto } from './dto/team.dto';
import { PlayerDto } from './dto/player.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('tournament/:tournamentId')
  @ApiOkResponse({ type: [TeamDto] })
  list(@Param('tournamentId') tournamentId: string): Promise<TeamDto[]> {
    return this.teamsService.listByTournament(tournamentId);
  }

  @Get('tournament/:tournamentId/players')
  @ApiOkResponse({ type: [PlayerDto] })
  getPlayersByTournament(
    @Param('tournamentId') tournamentId: string,
  ): Promise<PlayerDto[]> {
    return this.teamsService.getPlayersByTournament(tournamentId);
  }
}
