import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlayoffsService } from './playoffs.service';
import { GeneratePlayoffsDto } from './dto/generate-playoffs.dto';
import { PrismaService } from 'src/database/prisma.service';

@Controller('playoffs')
export class PlayoffsController {
  constructor(
    private readonly service: PlayoffsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':tournamentId')
  async getBracket(@Param('tournamentId') tournamentId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { tournamentId, kind: 'PLAYOFF' },
    });
    if (!stage) {
      return { matches: [] };
    }
    const matches = await this.prisma.match.findMany({
      where: { stageId: stage.id },
      include: { events: true },
      orderBy: [{ round: 'desc' }, { index: 'asc' }],
    });
    return { matches };
  }

  @Post('generate/:tournamentId')
  async generate(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: GeneratePlayoffsDto,
  ) {
    const created = await this.service.generateForTournament(tournamentId, dto);
    return { ok: true, count: created.length, matches: created };
  }
}
