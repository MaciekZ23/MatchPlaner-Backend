import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MatchDto } from './dto/match.dto';
import { toMatchDto } from './mapper';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listByStage(stageId: string): Promise<MatchDto[]> {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
    });
    if (!stage) throw new NotFoundException('Stage not found');

    const matches = await this.prisma.match.findMany({
      where: { stageId },
      include: { events: true },
      orderBy: [{ date: 'asc' }, { round: 'asc' }],
    });

    return matches.map(toMatchDto);
  }
}
