import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { TeamDto } from './dto/team.dto';
import { PlayerDto } from './dto/player.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: TeamDto })
  createAddTeam(
    @Param('tournamentId') tournamentId: string,
    @Body() body: CreateTeamDto,
  ): Promise<TeamDto> {
    return this.teamsService.createForTournament(tournamentId, body);
  }

  @Post('tournament/:teamId/add-player')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiBody({ type: CreatePlayerDto })
  @ApiCreatedResponse({ type: PlayerDto })
  createAddPlayer(
    @Param('teamId') teamId: string,
    @Body() body: CreatePlayerDto,
  ): Promise<PlayerDto> {
    return this.teamsService.createPlayer(teamId, body);
  }

  @Patch('tournament/:teamId/modify-team')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOkResponse({ type: TeamDto })
  updateTeam(
    @Param('teamId') teamId: string,
    @Body() body: UpdateTeamDto,
  ): Promise<TeamDto> {
    return this.teamsService.updateTeam(teamId, body);
  }

  @Delete('tournament/:teamId/delete-team')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiNoContentResponse()
  @HttpCode(204)
  async deleteTeam(@Param('teamId') teamId: string): Promise<void> {
    await this.teamsService.deleteTeam(teamId);
  }

  @Patch('tournament/:playerId/modify-player')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOkResponse({ type: PlayerDto })
  updatePlayer(
    @Param('playerId') playerId: string,
    @Body() body: UpdatePlayerDto,
  ): Promise<PlayerDto> {
    return this.teamsService.updatePlayer(playerId, body);
  }

  @Delete('tournament/:playerId/delete-player')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiNoContentResponse()
  @HttpCode(204)
  async deletePlayer(@Param('playerId') playerId: string): Promise<void> {
    await this.teamsService.deletePlayer(playerId);
  }
}
