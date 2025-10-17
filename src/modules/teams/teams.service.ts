import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TeamDto } from './dto/team.dto';
import { PlayerDto } from './dto/player.dto';
import { toPlayerDto, toTeamDto } from './mapper';
import { CreateTeamDto } from './dto/create-team.dto';
import { Prisma } from '@prisma/client';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listByTournament(tournamentId: string): Promise<TeamDto[]> {
    const exists = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!exists) throw new NotFoundException('Turniej nie znaleziony');

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
    if (!exists) throw new NotFoundException('Turniej nie znaleziony');

    const players = await this.prisma.player.findMany({
      where: { team: { tournamentId } }, // join po relacji
      orderBy: [{ teamId: 'asc' }, { shirtNumber: 'asc' }, { name: 'asc' }],
    });

    return players.map(toPlayerDto);
  }

  private async nextTeamIdTx(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.idCounter.findUnique({ where: { key: 'team' } });
    if (existing) {
      const updated = await tx.idCounter.update({
        where: { key: 'team' },
        data: { value: { increment: 1 } },
      });
      return `T${updated.value}`;
    }

    const all = await tx.team.findMany({ select: { id: true } });
    const max = all.reduce((m, t) => {
      const mth = /^T(\d+)$/i.exec(t.id);
      const n = mth ? parseInt(mth[1], 10) : NaN;
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);

    const created = await tx.idCounter.create({
      data: { key: 'team', value: max + 1 },
    });
    return `T${created.value}`;
  }

  async createForTournament(
    tournamentId: string,
    body: CreateTeamDto,
  ): Promise<TeamDto> {
    const exists = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Turniej nie znaleziony');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const newId = await this.nextTeamIdTx(tx);

      return tx.team.create({
        data: {
          id: newId,
          name: body.name.trim(),
          logo: body.logo && body.logo.trim() ? body.logo.trim() : null,
          tournamentId,
        },
        include: { players: { select: { id: true } } },
      });
    });

    return toTeamDto(created as any);
  }

  private async nextPlayerIdTx(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.idCounter.findUnique({
      where: { key: 'player' },
    });
    if (existing) {
      const updated = await tx.idCounter.update({
        where: { key: 'player' },
        data: { value: { increment: 1 } },
      });
      return `P${updated.value}`;
    }

    const all = await tx.player.findMany({ select: { id: true } });
    const max = all.reduce((m, pl) => {
      const mth = /^P(\d+)$/i.exec(pl.id);
      const n = mth ? parseInt(mth[1], 10) : NaN;
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);

    const created = await tx.idCounter.create({
      data: { key: 'player', value: max + 1 },
    });
    return `P${created.value}`;
  }

  async createPlayer(
    teamId: string,
    body: CreatePlayerDto,
  ): Promise<PlayerDto> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException('Drużyna nie znaleziona');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const newId = await this.nextPlayerIdTx(tx);
      return tx.player.create({
        data: {
          id: newId,
          teamId,
          name: body.name.trim(),
          position: body.position,
          shirtNumber: body.shirtNumber ?? null,
          healthStatus: body.healthStatus,
        },
      });
    });

    return toPlayerDto(created);
  }

  async updateTeam(teamId: string, body: UpdateTeamDto): Promise<TeamDto> {
    const exists = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { players: { select: { id: true } } },
    });
    if (!exists) {
      throw new NotFoundException('Druzyna nie znaleziona');
    }

    const data: Prisma.TeamUpdateInput = {};
    if (body.name !== undefined) {
      data.name = body.name;
    }
    if (body.logo !== undefined) {
      const val = typeof body.logo === 'string' ? body.logo.trim() : body.logo;
      data.logo = val ? val : null;
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data,
      include: { players: { select: { id: true } } },
    });

    return toTeamDto(updated as any);
  }

  async deleteTeam(teamId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Drużyna nie znaleziona');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.player.deleteMany({ where: { teamId } });
      await tx.team.delete({ where: { id: teamId } });
    });
  }

  async updatePlayer(
    playerId: string,
    body: UpdatePlayerDto,
  ): Promise<PlayerDto> {
    const exists = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!exists) {
      throw new NotFoundException('Zawodnik nie znaleziony');
    }

    const data: Prisma.PlayerUpdateInput = {};
    if (body.name !== undefined) {
      data.name = body.name.trim();
    }
    if (body.position !== undefined) {
      data.position = body.position;
    }
    if (body.shirtNumber !== undefined) {
      data.shirtNumber = body.shirtNumber ?? null;
    }
    if (body.healthStatus !== undefined) {
      data.healthStatus = body.healthStatus;
    }

    const updated = await this.prisma.player.update({
      where: { id: playerId },
      data,
    });

    return toPlayerDto(updated);
  }

  async deletePlayer(playerId: string): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) {
      throw new NotFoundException('Zawodnik nie znaleziony');
    }

    await this.prisma.player.delete({ where: { id: playerId } });
  }
}
