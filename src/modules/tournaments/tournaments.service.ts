import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { toTournamentDto } from './mapper';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: { groups: true, stages: true },
    });

    if (!t) {
      throw new NotFoundException('Tournament not found');
    }
    return toTournamentDto(t);
  }
}
