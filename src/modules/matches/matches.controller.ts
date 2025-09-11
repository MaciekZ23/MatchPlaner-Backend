import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { MatchDto } from './dto/match.dto';

@Controller('matches')
export class MatchesController {
  constructor(private readonly svc: MatchesService) {}

  @Get('stage/:stageId')
  @ApiOkResponse({ type: [MatchDto] })
  listByStage(@Param('stageId') stageId: string): Promise<MatchDto[]> {
    return this.svc.listByStage(stageId);
  }
}
