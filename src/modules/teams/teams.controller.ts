import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { TeamDto } from './dto/team.dto';
import { PlayerDto } from './dto/player.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreatePlayerDto } from './dto/create-player.dto';

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

  @Post('tournament/:tournamentId/add-team')
  @ApiCreatedResponse({ type: TeamDto })
  createAddTeam(
    @Param('tournamentId') tournamentId: string,
    @Body() body: CreateTeamDto,
  ): Promise<TeamDto> {
    return this.teamsService.createForTournament(tournamentId, body);
  }

  @Post('tournament/:teamId/add-player')
  @ApiBody({ type: CreatePlayerDto })
  @ApiCreatedResponse({ type: PlayerDto })
  createAddPlayer(
    @Param('teamId') teamId: string,
    @Body() body: CreatePlayerDto,
  ): Promise<PlayerDto> {
    return this.teamsService.createPlayer(teamId, body);
  }
}
