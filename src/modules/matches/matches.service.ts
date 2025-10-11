import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    // 2a) Walidacja: drużyna tylko w jednej grupie
    const seen = new Map<string, string>(); // teamId -> groupId
    for (const g of groups) {
      for (const tid of g.teamIds) {
        const prev = seen.get(tid);
        if (prev && prev !== g.id) {
          throw new BadRequestException(
            `Team ${tid} jest już w grupie ${prev}, a także w ${g.id}. Jedna drużyna może należeć tylko do jednej grupy.`,
          );
        }
        seen.set(tid, g.id);
      }
    }

    // 3) Opcjonalny cleanup
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
    const declaredTimes = (dto.matchTimes ?? []).filter(Boolean); // ['08:00','08:50',...]
    const firstMatchTime = dto.firstMatchTime ?? '18:00';
    const intervalMinutes = dto.matchIntervalMinutes ?? 120;
    const roundInSingleDay = dto.roundInSingleDay ?? true;

    // 5) Helpery dat
    const addDays = (ymd: string, days: number): string => {
      const d = new Date(ymd);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const toZonedDate = (ymd: string, hhmm: string): Date => {
      const [y, m, d] = ymd.split('-').map(Number);
      const [hh, mm] = hhmm.split(':').map(Number);
      // zapis jako UTC; jeśli chcesz TZ, zmień implementację
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
        // rotacja z „zatrzymanym” pierwszym
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

    // 7) GLOBALNY licznik indeksów per runda (dla @@unique(stageId, round, index))
    const roundIndexCounters = new Map<number, number>(); // runda -> ostatni użyty index
    const nextIndexForRound = (roundNo: number) => {
      const cur = roundIndexCounters.get(roundNo) ?? 0;
      const nxt = cur + 1;
      roundIndexCounters.set(roundNo, nxt);
      return nxt;
    };

    // === GLOBALNY ALOKATOR SLOTÓW CZASOWYCH ===
    type DateState = { slotIdx: number; lastSlotMins: number };
    const toMin = (hhmm: string) => {
      const [hh, mm] = hhmm.split(':').map(Number);
      return hh * 60 + mm;
    };
    const toHHMM = (mins: number) => {
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(h)}:${pad(m)}`;
    };

    const cleanTimes = Array.from(new Set(declaredTimes))
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const inferredStep =
      cleanTimes.length >= 2 ? toMin(cleanTimes[1]) - toMin(cleanTimes[0]) : 90;

    const step =
      dto.matchIntervalMinutes && dto.matchIntervalMinutes > 0
        ? dto.matchIntervalMinutes
        : inferredStep;

    const dateState = new Map<string, DateState>();
    const usedTimesPerDate = new Map<string, Set<string>>(); // ymd -> set("HH:mm")

    const markUsed = (ymd: string, hhmm: string) => {
      if (!usedTimesPerDate.has(ymd)) usedTimesPerDate.set(ymd, new Set());
      usedTimesPerDate.get(ymd)!.add(hhmm);
    };
    const isUsed = (ymd: string, hhmm: string) =>
      usedTimesPerDate.get(ymd)?.has(hhmm) ?? false;

    const allocateSlot = (
      ymdStart: string,
      allowNextDay: boolean,
    ): { ymd: string; hhmm: string } => {
      let ymd = ymdStart;
      const intervalMode = cleanTimes.length === 0;

      const ensureState = (d: string): DateState => {
        if (!dateState.has(d)) {
          dateState.set(d, {
            slotIdx: 0,
            // inicjujemy na pierwszym możliwym slocie
            lastSlotMins: intervalMode
              ? toMin(firstMatchTime)
              : toMin(cleanTimes[0] ?? firstMatchTime),
          });
        }
        return dateState.get(d)!;
      };

      // pomocnik: od minuty bazowej szukaj pierwszego wolnego slotu co 'stepMins'
      const pickFree = (
        ymdLocal: string,
        baseMins: number,
        stepMins: number,
      ): string | null => {
        let mins = baseMins;
        while (mins < 24 * 60) {
          const hhmm = toHHMM(mins);
          if (!isUsed(ymdLocal, hhmm)) return hhmm;
          mins += stepMins;
        }
        return null; // brak miejsca w tej dobie
      };

      for (;;) {
        const st = ensureState(ymd);

        if (!intervalMode) {
          // 1) konsumuj podane godziny
          while (st.slotIdx < cleanTimes.length) {
            const cand = cleanTimes[st.slotIdx++];
            if (!isUsed(ymd, cand)) {
              markUsed(ymd, cand);
              st.lastSlotMins = toMin(cand); // AKTUALIZUJEMY stan po przydziale
              return { ymd, hhmm: cand };
            }
          }

          // 2) brak godzin => dokładamy w TYM SAMYM DNIU co 'step'
          const from = st.lastSlotMins + step;
          const free = pickFree(ymd, from, step);
          if (free) {
            markUsed(ymd, free);
            st.lastSlotMins = toMin(free);
            return { ymd, hhmm: free };
          }

          // 3) doba pełna -> jeśli wolno, przejdź na kolejny dzień
          if (allowNextDay) {
            ymd = addDays(ymd, 1);
            continue;
          }

          // 4) nie wolno – zawijamy w obrębie dnia (ciągle bez duplikatów)
          let wrap = from % (24 * 60);
          while (isUsed(ymd, toHHMM(wrap))) wrap = (wrap + step) % (24 * 60);
          const hhmm = toHHMM(wrap);
          markUsed(ymd, hhmm);
          st.lastSlotMins = wrap;
          return { ymd, hhmm };
        } else {
          // tryb interwałów
          const from =
            st.slotIdx === 0
              ? toMin(firstMatchTime)
              : st.lastSlotMins + intervalMinutes;
          st.slotIdx++;

          const free = pickFree(ymd, from, intervalMinutes);
          if (free) {
            markUsed(ymd, free);
            st.lastSlotMins = toMin(free);
            return { ymd, hhmm: free };
          }

          if (allowNextDay) {
            ymd = addDays(ymd, 1);
            continue;
          }

          // zawijamy w obrębie dnia
          let wrap = from % (24 * 60);
          while (isUsed(ymd, toHHMM(wrap)))
            wrap = (wrap + intervalMinutes) % (24 * 60);
          const hhmm = toHHMM(wrap);
          markUsed(ymd, hhmm);
          st.lastSlotMins = wrap;
          return { ymd, hhmm };
        }
      }
    };

    // 8) Generacja
    let created = 0;

    await this.prisma.$transaction(async (tx) => {
      // 8a) Zbuduj rundy dla każdej grupy
      const roundsByGroup = new Map<string, Array<Array<[string, string]>>>();
      for (const g of groups) {
        roundsByGroup.set(g.id, buildRounds(g.teamIds));
      }

      // maksymalna liczba kolejek
      const maxRounds = Math.max(
        ...Array.from(roundsByGroup.values()).map((rs) => rs.length || 0),
      );

      // data startu dla kolejki 1
      let roundDay = dto.startDate; // YYYY-MM-DD

      for (let r = 0; r < maxRounds; r++) {
        const roundNo = r + 1;

        // w tej kolejce przejdź po wszystkich grupach (unikalne godziny globalnie)
        for (const g of groups) {
          const rs = roundsByGroup.get(g.id)!;
          const pairs = rs[r] ?? [];

          for (const [home, away] of pairs) {
            if (home === '__BYE__' || away === '__BYE__') continue;

            const { ymd, hhmm } = allocateSlot(
              roundDay,
              /* allowNextDay */ !roundInSingleDay,
            );

            const id = await this.nextMatchIdTx(tx);
            await tx.match.create({
              data: {
                id,
                stageId: stage.id,
                groupId: g.id,
                round: roundNo,
                index: nextIndexForRound(roundNo),
                date: toZonedDate(ymd, hhmm),
                status: 'SCHEDULED',
                homeTeamId: home,
                awayTeamId: away,
              },
            });
            created++;
          }
        }

        // po całej kolejce skaczemy o dayInterval
        roundDay = addDays(roundDay, dayInterval);
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
