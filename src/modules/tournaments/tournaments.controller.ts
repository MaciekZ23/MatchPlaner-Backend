import { Controller, Get, Param, Version } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly service: TournamentsService) {}

  @Version('1')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
