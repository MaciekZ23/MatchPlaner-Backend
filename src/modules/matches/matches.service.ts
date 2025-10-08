import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MatchDto } from './dto/match.dto';
import { toMatchDto } from './mapper';
import { CreateMatchDto } from './dto/create-match.dto';
import { GenerateRoundRobinDto } from './dto/generate-round-robin.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { Prisma, MatchEventType, CardKind } from '@prisma/client';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextMatchIdTx(tx: Prisma.TransactionClient): Promise<string> {
    const existing = await tx.idCounter.findUnique({ where: { key: 'match' } });

    if (existing) {
      const updated = await tx.idCounter.update({
        where: { key: 'match' },
        data: { value: { increment: 1 } },
      });
      return `M${updated.value}`;
    }

    const all = await tx.match.findMany({ select: { id: true } });
    let max = 0;

    for (const m of all) {
      const re = /^M(\d+)$/i.exec(m.id);
      const n = re ? parseInt(re[1], 10) : NaN;
      if (Number.isFinite(n) && n > max) {
        max = n;
      }
    }

    const created = await tx.idCounter.create({
      data: { key: 'match', value: max + 1 },
    });

    return `M${created.value}`;
  }

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

  async create(dto: CreateMatchDto): Promise<MatchDto> {
    await this.ensureStageExists(dto.stageId);

    const created = await this.prisma.$transaction(async (tx) => {
      const id = await this.nextMatchIdTx(tx);

      const match = await tx.match.create({
        data: {
          id,
          stageId: dto.stageId,
          groupId: dto.groupId ?? null,
          round: dto.round ?? null,
          index: dto.index ?? null,
          date: new Date(dto.date),
          status: (dto.status ?? 'SCHEDULED') as any,
          homeTeamId: dto.homeTeamId ?? null,
          awayTeamId: dto.awayTeamId ?? null,
          homeScore: dto.score?.home ?? null,
          awayScore: dto.score?.away ?? null,
          homeGKIds: dto.homeGKIds ?? [],
          awayGKIds: dto.awayGKIds ?? [],
        },
      });

      if (dto.events && dto.events.length > 0) {
        await tx.matchEvent.createMany({
          data: dto.events.map((e) => ({
            matchId: match.id,
            minute: e.minute,
            type: e.type as MatchEventType,
            playerId: e.playerId,
            teamId: e.teamId,
            card:
              e.type === 'CARD' ? ((e.card ?? null) as CardKind | null) : null,
          })),
        });
      }

      return tx.match.findUnique({
        where: { id: match.id },
        include: { events: true },
      });
    });

    return toMatchDto(created!);
  }

  async update(id: string, dto: UpdateMatchDto): Promise<MatchDto> {
    const existing = await this.prisma.match.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Match not found');
    }

    if (dto.stageId) {
      await this.ensureStageExists(dto.stageId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.MatchUpdateInput = {};

      if (dto.stageId !== undefined) {
        data.stage = { connect: { id: dto.stageId } };
      }
      if (dto.groupId !== undefined) {
        data.group = dto.groupId
          ? { connect: { id: dto.groupId } }
          : { disconnect: true };
      }
      if (dto.round !== undefined) {
        data.round = dto.round ?? null;
      }
      if (dto.index !== undefined) {
        data.index = dto.index ?? null;
      }
      if (dto.date !== undefined) {
        data.date = new Date(dto.date);
      }
      if (dto.status !== undefined) {
        data.status = dto.status as any;
      }
      if (dto.homeTeamId !== undefined) {
        data.homeTeam = dto.homeTeamId
          ? { connect: { id: dto.homeTeamId } }
          : { disconnect: true };
      }
      if (dto.awayTeamId !== undefined) {
        data.awayTeam = dto.awayTeamId
          ? { connect: { id: dto.awayTeamId } }
          : { disconnect: true };
      }
      if (dto.score !== undefined) {
        data.homeScore = dto.score ? (dto.score.home ?? null) : null;
        data.awayScore = dto.score ? (dto.score.away ?? null) : null;
      }
      if (dto.homeGKIds !== undefined) {
        data.homeGKIds = dto.homeGKIds ?? []; // null => wyczyść
      }
      if (dto.awayGKIds !== undefined) {
        data.awayGKIds = dto.awayGKIds ?? []; // null => wyczyść
      }

      if (Object.keys(data).length > 0) {
        await tx.match.update({ where: { id }, data });
      }

      if (dto.eventsDelete?.length) {
        await tx.matchEvent.deleteMany({
          where: { id: { in: dto.eventsDelete }, matchId: id },
        });
      }

      if (dto.eventsUpdate?.length) {
        for (const e of dto.eventsUpdate) {
          await tx.matchEvent.update({
            where: { id: e.id },
            data: {
              minute: e.minute,
              type: e.type as MatchEventType,
              playerId: e.playerId,
              teamId: e.teamId,
              card:
                e.type === 'CARD'
                  ? ((e.card ?? null) as CardKind | null)
                  : null,
              match: { connect: { id } },
            },
          });
        }
      }

      if (dto.eventsAppend?.length) {
        await tx.matchEvent.createMany({
          data: dto.eventsAppend.map((e) => ({
            matchId: id,
            minute: e.minute,
            type: e.type as MatchEventType,
            playerId: e.playerId,
            teamId: e.teamId,
            card:
              e.type === 'CARD' ? ((e.card ?? null) as CardKind | null) : null,
          })),
        });
      }

      return tx.match.findUnique({
        where: { id },
        include: { events: true },
      });
    });

    return toMatchDto(result!);
  }

  async deleteOne(id: string): Promise<void> {
    const existing = await this.prisma.match.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Match not found');
    }
    await this.prisma.$transaction([
      this.prisma.matchEvent.deleteMany({ where: { matchId: id } }),
      this.prisma.match.delete({ where: { id } }),
    ]);
  }

  async deleteAllByTournament(
    tournamentId: string,
  ): Promise<{ count: number }> {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!t) {
      throw new NotFoundException('Tournament not found');
    }

    const stages = await this.prisma.stage.findMany({
      where: { tournamentId },
      select: { id: true },
    });
    const stageIds = stages.map((s) => s.id);

    const matches = await this.prisma.match.findMany({
      where: { stageId: { in: stageIds } },
      select: { id: true },
    });
    const matchIds = matches.map((m) => m.id);

    await this.prisma.$transaction([
      this.prisma.matchEvent.deleteMany({
        where: { matchId: { in: matchIds } },
      }),
      this.prisma.match.deleteMany({ where: { id: { in: matchIds } } }),
    ]);

    return { count: matchIds.length };
  }

  async deleteAllByStage(stageId: string): Promise<{ count: number }> {
    await this.ensureStageExists(stageId);

    const matches = await this.prisma.match.findMany({
      where: { stageId },
      select: { id: true },
    });
    const ids = matches.map((m) => m.id);

    await this.prisma.$transaction([
      this.prisma.matchEvent.deleteMany({ where: { matchId: { in: ids } } }),
      this.prisma.match.deleteMany({ where: { id: { in: ids } } }),
    ]);

    return { count: ids.length };
  }

  async generateRoundRobin(
    tournamentId: string,
    _dto: GenerateRoundRobinDto,
  ): Promise<{ created: number }> {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!t) {
      throw new NotFoundException('Tournament not found');
    }

    return { created: 0 };
  }

  private async ensureStageExists(stageId: string): Promise<void> {
    const s = await this.prisma.stage.findUnique({ where: { id: stageId } });
    if (!s) {
      throw new NotFoundException('Stage not found');
    }
  }
}
