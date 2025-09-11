import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TeamDto } from './dto/team.dto';
import { PlayerDto } from './dto/player.dto';
import { toPlayerDto, toTeamDto } from './mapper';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listByTournament(tournamentId: string): Promise<TeamDto[]> {
    const exists = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!exists) throw new NotFoundException('Tournament not found');

    const teams = await this.prisma.team.findMany({
      where: { tournamentId },
      include: { players: { select: { id: true } } },
      orderBy: { name: 'asc' },
    });

    return teams.map((t) => toTeamDto(t as any));
  }

  async getPlayersByTournament(tournamentId: string): Promise<PlayerDto[]> {
    const exists = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!exists) throw new NotFoundException('Tournament not found');

    const players = await this.prisma.player.findMany({
      where: { team: { tournamentId } }, // join po relacji
      orderBy: [{ teamId: 'asc' }, { shirtNumber: 'asc' }, { name: 'asc' }],
    });

    return players.map(toPlayerDto);
  }
}
