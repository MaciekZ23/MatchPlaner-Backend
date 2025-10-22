import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { MatchDto } from './dto/match.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { GenerateRoundRobinDto } from './dto/generate-round-robin.dto';
import { Public } from 'src/auth/public.decorator';
import { Roles } from 'src/auth/roles.decorator';

@Controller('matches')
export class MatchesController {
  constructor(private readonly svc: MatchesService) {}

  @Public()
  @Get('stage/:stageId')
  @ApiOkResponse({ type: [MatchDto] })
  listByStage(@Param('stageId') stageId: string): Promise<MatchDto[]> {
    return this.svc.listByStage(stageId);
  }

  @Roles('ADMIN')
  @Post('create-match')
  @ApiOkResponse({ type: MatchDto })
  create(@Body() dto: CreateMatchDto): Promise<MatchDto> {
    return this.svc.create(dto);
  }

  @Roles('ADMIN')
  @Patch('edit-match/:id')
  @ApiOkResponse({ type: MatchDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMatchDto,
  ): Promise<MatchDto> {
    return this.svc.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete('delete-match/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async deleteOne(@Param('id') id: string): Promise<void> {
    await this.svc.deleteOne(id);
  }

  @Roles('ADMIN')
  @Delete('delete-all-matches/:tournamentId')
  @ApiOkResponse({ schema: { properties: { count: { type: 'number' } } } })
  deleteAllByTournament(@Param('tournamentId') tournamentId: string) {
    return this.svc.deleteAllByTournament(tournamentId);
  }

  @Roles('ADMIN')
  @Delete('delete-all-matches-by-stage/:stageId')
  @ApiOkResponse({ schema: { properties: { count: { type: 'number' } } } })
  deleteAllByStage(@Param('stageId') stageId: string) {
    return this.svc.deleteAllByStage(stageId);
  }

  @Roles('ADMIN')
  @Post('generate-round-robin/:tournamentId')
  @ApiOkResponse({ schema: { properties: { created: { type: 'number' } } } })
  generateRoundRobin(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: GenerateRoundRobinDto,
  ) {
    return this.svc.generateRoundRobin(tournamentId, dto);
  }
}
