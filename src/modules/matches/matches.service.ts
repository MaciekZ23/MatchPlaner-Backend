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
    dto: GenerateRoundRobinDto,
  ): Promise<{ created: number }> {
    const t = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!t) throw new NotFoundException('Tournament not found');

    // 1) Stage grupowy
    const stage = await this.prisma.stage.findFirst({
      where: { tournamentId, kind: 'GROUP' },
    });
    if (!stage) throw new NotFoundException('Group stage not found');

    // 2) Grupy (opcjonalny filtr)
    const groups = await this.prisma.group.findMany({
      where: {
        tournamentId,
        ...(dto.groupIds?.length ? { id: { in: dto.groupIds } } : {}),
      },
    });
    if (!groups.length) return { created: 0 };

    // 3) Opcjonalny cleanup meczów w tym stage (i ewent. tylko wskazanych grup)
    if (dto.clearExisting) {
      const toDelete = await this.prisma.match.findMany({
        where: {
          stageId: stage.id,
          ...(dto.groupIds?.length ? { groupId: { in: dto.groupIds } } : {}),
        },
        select: { id: true },
      });
      const mids = toDelete.map((m) => m.id);
      if (mids.length) {
        await this.prisma.$transaction([
          this.prisma.matchEvent.deleteMany({
            where: { matchId: { in: mids } },
          }),
          this.prisma.match.deleteMany({ where: { id: { in: mids } } }),
        ]);
      }
    }

    // 4) Parametry kalendarza
    const dayInterval = dto.dayInterval ?? 7;
    const declaredTimes = (dto.matchTimes ?? []).filter(Boolean); // np. ['14:00','16:00']
    const firstMatchTime = dto.firstMatchTime ?? '18:00'; // start jeśli używasz interwałów
    const intervalMinutes = dto.matchIntervalMinutes ?? 120; // odstęp między meczami
    const roundInSingleDay = dto.roundInSingleDay ?? true; // czy cała kolejka jednego dnia
    const useInterval = !declaredTimes.length && !!dto.matchIntervalMinutes;

    // 5) Helpery dat
    const addDays = (ymd: string, days: number): string => {
      const d = new Date(ymd);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const toZonedDate = (ymd: string, hhmm: string): Date => {
      const [y, m, d] = ymd.split('-').map(Number);
      const [hh, mm] = hhmm.split(':').map(Number);
      // uproszczenie: zapis UTC na bazie daty + godziny
      return new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
    };

    // 6) Berger – parowanie z obsługą BYE, doubleRound i shuffle
    const buildRounds = (teamIds: string[]) => {
      const teams = [...teamIds];
      if (dto.shuffleTeams) {
        for (let i = teams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [teams[i], teams[j]] = [teams[j], teams[i]];
        }
      }
      const hasBye = teams.length % 2 === 1;
      if (hasBye) teams.push('__BYE__');

      const n = teams.length;
      const half = n / 2;
      const rounds: Array<Array<[string, string]>> = [];
      let arr = [...teams];

      for (let r = 0; r < n - 1; r++) {
        const pairings: Array<[string, string]> = [];
        for (let i = 0; i < half; i++) {
          const a = arr[i];
          const b = arr[n - 1 - i];
          const homeFirst = r % 2 === 0;
          pairings.push(homeFirst ? [a, b] : [b, a]);
        }
        rounds.push(pairings);
        // rotacja z "zatrzymanym" pierwszym
        const fixed = arr[0];
        arr = [fixed, ...arr.slice(-1), ...arr.slice(1, -1)];
      }

      if (dto.doubleRound) {
        const second = rounds.map((round) =>
          round.map(([h, a]) => [a, h] as [string, string]),
        );
        return rounds.concat(second);
      }
      return rounds;
    };

    // 7) GLOBALNY licznik indeksów per runda (naprawa @@unique(stageId, round, index))
    const roundIndexCounters = new Map<number, number>(); // runda -> ostatni użyty index
    const nextIndexForRound = (roundNo: number) => {
      const cur = roundIndexCounters.get(roundNo) ?? 0;
      const nxt = cur + 1;
      roundIndexCounters.set(roundNo, nxt);
      return nxt;
    };

    // 8) Generacja
    let created = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const g of groups) {
        const rounds = buildRounds(g.teamIds);
        let day = dto.startDate; // YYYY-MM-DD

        for (let r = 0; r < rounds.length; r++) {
          const pairs = rounds[r];
          const roundNo = r + 1;

          if (declaredTimes.length) {
            // ---- NOWA WERSJA: interwał dla każdego kolejnego meczu ----
            let ymd = day;

            // Godzina startu w danym dniu:
            // - gdy runda ma być w 1 dniu -> bierzemy pierwszy slot jeśli jest, inaczej firstMatchTime
            // - gdy może rozlewać się na kilka dni -> zaczynamy też od pierwszego slotu
            const startHHMM = declaredTimes[0] ?? firstMatchTime;

            // "aktualny" czas, który będziemy inkrementować o intervalMinutes
            let current = toZonedDate(ymd, startHHMM);

            // używane tylko, gdy runda może rozlewać się na wiele dni (roundInSingleDay === false)
            let slotIdx = 0;

            for (let i = 0; i < pairs.length; i++) {
              const [home, away] = pairs[i];
              if (home === '__BYE__' || away === '__BYE__') continue;

              let date: Date;

              if (roundInSingleDay) {
                // cała runda w jednym dniu → każdy kolejny mecz to +interval
                date = new Date(current);
                current = new Date(
                  current.getTime() + intervalMinutes * 60_000,
                );
              } else {
                // runda może rozlewać się na kilka dni:
                // użyj zdefiniowanych slotów; gdy zabraknie → następny dzień i znów od pierwszego slotu
                if (slotIdx >= declaredTimes.length) {
                  ymd = addDays(ymd, 1);
                  slotIdx = 0;
                  // odśwież także "current" na początek nowego dnia (żeby nie kumulować interwału z poprzedniego)
                  current = toZonedDate(
                    ymd,
                    declaredTimes[0] ?? firstMatchTime,
                  );
                }
                date = toZonedDate(ymd, declaredTimes[slotIdx++]);
              }

              const id = await this.nextMatchIdTx(tx);
              await tx.match.create({
                data: {
                  id,
                  stageId: stage.id,
                  groupId: g.id,
                  round: roundNo,
                  index: nextIndexForRound(roundNo), // zostaw jak masz
                  date,
                  status: 'SCHEDULED',
                  homeTeamId: home,
                  awayTeamId: away,
                },
              });
              created++;
            }

            // po kolejce – przeskocz o dayInterval (może być 0)
            day = addDays(day, dayInterval);
          } else if (useInterval) {
            // Tryb: jeden start + odstęp minutowy (kolejka w jednym dniu)
            let current = toZonedDate(day, firstMatchTime);

            for (const [home, away] of pairs) {
              if (home === '__BYE__' || away === '__BYE__') continue;

              const id = await this.nextMatchIdTx(tx);
              await tx.match.create({
                data: {
                  id,
                  stageId: stage.id,
                  groupId: g.id,
                  round: roundNo,
                  index: nextIndexForRound(roundNo), // <--- KLUCZOWE
                  date: current,
                  status: 'SCHEDULED',
                  homeTeamId: home,
                  awayTeamId: away,
                },
              });
              created++;
              current = new Date(current.getTime() + intervalMinutes * 60_000);
            }

            day = addDays(day, dayInterval);
          } else {
            // Fallback: jeden slot na dzień (firstMatchTime), cała kolejka jednego dnia
            for (const [home, away] of pairs) {
              if (home === '__BYE__' || away === '__BYE__') continue;

              const id = await this.nextMatchIdTx(tx);
              await tx.match.create({
                data: {
                  id,
                  stageId: stage.id,
                  groupId: g.id,
                  round: roundNo,
                  index: nextIndexForRound(roundNo), // <--- KLUCZOWE
                  date: toZonedDate(day, firstMatchTime),
                  status: 'SCHEDULED',
                  homeTeamId: home,
                  awayTeamId: away,
                },
              });
              created++;
            }
            day = addDays(day, dayInterval);
          }
        }
      }
    });

    return { created };
  }

  private async ensureStageExists(stageId: string): Promise<void> {
    const s = await this.prisma.stage.findUnique({ where: { id: stageId } });
    if (!s) {
      throw new NotFoundException('Stage not found');
    }
  }
}
