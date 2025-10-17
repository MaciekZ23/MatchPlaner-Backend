import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { GeneratePlayoffsDto } from './dto/generate-playoffs.dto';
import { StandingsService } from './standings.service';
import { Pair, QualifiedTeam, SchedulingOptions } from './types';

@Injectable()
export class PlayoffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly standings: StandingsService,
  ) {}

  async generateForTournament(tournamentId: string, dto: GeneratePlayoffsDto) {
    // Zbieramy zakwalifikowanych 1 i 2 miejsce
    const groups = await this.prisma.group.findMany({
      where: { tournamentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (groups.length === 0) {
      throw new BadRequestException(
        'Turniej nie ma grup - brak danych do drabinki',
      );
    }

    // Bierzemy wszystkie mecze zakonczone czyli FINISHED
    const notFinished = await this.prisma.match.count({
      where: {
        stage: { tournamentId },
        groupId: { not: null },
        status: { not: 'FINISHED' },
      },
    });
    if (notFinished > 0) {
      throw new BadRequestException(
        'Njapierw zakończ wszystkie mecze w grupach',
      );
    }

    const qualified = await this.standings.topTwoPerGroup(tournamentId);
    if (qualified.length < 2) {
      throw new BadRequestException('Za mało zespołów do fazy pucharowej.');
    }

    const stage = await this.ensurePlayoffStage(
      tournamentId,
      dto.stageName ?? 'Playoffs',
    );

    if (dto.clearExisting) {
      const toDelete = await this.prisma.match.findMany({
        where: { stageId: stage.id },
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

    const firstRoundPairs = this.buildFirstRoundPairs(
      groups.map((g) => g.id),
      qualified,
    );
    if (firstRoundPairs.length === 0) {
      throw new BadRequestException(
        'Nie udało się zbudować par pierwszej rundy.',
      );
    }

    const options: SchedulingOptions = {
      startDate: dto.startDate,
      matchTimes: dto.matchTimes,
      firstMatchTime: dto.firstMatchTime,
      matchIntervalMinutes: dto.matchIntervalMinutes,
      dayInterval: dto.dayInterval ?? 0,
      roundInSingleDay: dto.roundInSingleDay ?? true,
      withThirdPlace: dto.withThirdPlace ?? true,
      clearExisting: dto.clearExisting ?? false,
    };

    const created = await this.createBracketTree(
      stage.id,
      firstRoundPairs,
      options,
    );
    return created;
  }

  private async ensurePlayoffStage(tournamentId: string, name: string) {
    const exist = await this.prisma.stage.findFirst({
      where: { tournamentId, kind: 'PLAYOFF' },
      orderBy: { order: 'asc' },
    });
    if (exist) {
      return exist;
    }

    const maxOrder = await this.prisma.stage.aggregate({
      where: { tournamentId },
      _max: { order: true },
    });

    return this.prisma.stage.create({
      data: {
        tournamentId,
        kind: 'PLAYOFF',
        name,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });
  }

  private buildFirstRoundPairs(
    groups: string[],
    q: QualifiedTeam[],
  ): Pair<QualifiedTeam>[] {
    const left: Pair<QualifiedTeam>[] = [];
    const right: Pair<QualifiedTeam>[] = [];

    if (groups.length === 0) {
      return [];
    }

    if (groups.length === 1) {
      const g = groups[0];
      const first = q.find((t) => t.group === g && t.place === 1);
      const second = q.find((t) => t.group === g && t.place === 2);
      return first && second ? [{ home: first, away: second }] : [];
    }

    if (groups.length % 2 !== 0) {
      throw new BadRequestException(
        'Liczba grup musi być parzysta, aby zbudować drabinkę bez BYE.',
      );
    }

    for (let i = 0; i < groups.length; i += 2) {
      const g1 = groups[i];
      const g2 = groups[i + 1];

      const g1_1 = q.find((t) => t.group === g1 && t.place === 1);
      const g1_2 = q.find((t) => t.group === g1 && t.place === 2);
      const g2_1 = q.find((t) => t.group === g2 && t.place === 1);
      const g2_2 = q.find((t) => t.group === g2 && t.place === 2);

      if (g1_1 && g2_2) {
        left.push({ home: g1_1, away: g2_2 });
      }

      if (g2_1 && g1_2) {
        right.push({ home: g2_1, away: g1_2 });
      }
    }

    return [...left, ...right];
  }

  // NEW: helpery daty/godziny (jak w RR)
  private addDays(ymd: string, days: number): string {
    const d = new Date(ymd);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private toZonedDate(ymd: string, hhmm: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    const [hh, mm] = hhmm.split(':').map(Number);
    // data w CZASIE LOKALNYM serwera (nie UTC)
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  // NEW: alokator slotów czasowych – wersja bez allocateWrapper
  private makeAllocator(opts: SchedulingOptions) {
    const dayInterval = opts.dayInterval ?? 0;
    const roundInSingleDay = opts.roundInSingleDay ?? true;

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

    const declared = Array.from(new Set(opts.matchTimes ?? []))
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const intervalMode = declared.length === 0;
    const first = opts.firstMatchTime ?? '18:00';
    const intervalMinutes = opts.matchIntervalMinutes ?? 120;

    // stan per data
    type DateState = { slotIdx: number; lastSlotMins: number };
    const dateState = new Map<string, DateState>();
    const usedTimesPerDate = new Map<string, Set<string>>(); // ymd -> Set('HH:mm')

    const markUsed = (ymd: string, hhmm: string) => {
      if (!usedTimesPerDate.has(ymd)) usedTimesPerDate.set(ymd, new Set());
      usedTimesPerDate.get(ymd)!.add(hhmm);
    };
    const isUsed = (ymd: string, hhmm: string) =>
      usedTimesPerDate.get(ymd)?.has(hhmm) ?? false;

    const ensureState = (d: string): DateState => {
      if (!dateState.has(d)) {
        dateState.set(d, {
          slotIdx: 0,
          lastSlotMins: intervalMode
            ? toMin(first)
            : toMin(declared[0] ?? first),
        });
      }
      return dateState.get(d)!;
    };

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
      return null;
    };

    // narzędzia do startowania od "początku dnia"
    const firstSlotOfDay = (ymdLocal: string): string => {
      if (!intervalMode) {
        // najpierw spróbuj pierwszej z listy; jak zajęta, weź kolejną o krok=step
        const step =
          opts.matchIntervalMinutes && opts.matchIntervalMinutes > 0
            ? opts.matchIntervalMinutes
            : declared.length >= 2
              ? Math.max(1, toMin(declared[1]) - toMin(declared[0]))
              : intervalMinutes;
        const base = toMin(declared[0] ?? first);
        return pickFree(ymdLocal, base, step) ?? declared[0] ?? first;
      } else {
        const base = toMin(first);
        return pickFree(ymdLocal, base, intervalMinutes) ?? first;
      }
    };

    // sterowanie datą rundy
    let roundDay = opts.startDate; // YYYY-MM-DD

    return {
      startOfRound: (ymd: string) => {
        roundDay = ymd;
      },
      nextRoundDay: (ymd: string) => this.addDays(ymd, dayInterval),

      allocate: (): { ymd: string; hhmm: string } => {
        let ymd = roundDay;
        let st = ensureState(ymd);

        if (!intervalMode) {
          // tryb z listą godzin
          while (st.slotIdx < declared.length) {
            const cand = declared[st.slotIdx++];
            if (!isUsed(ymd, cand)) {
              markUsed(ymd, cand);
              st.lastSlotMins = toMin(cand);
              return { ymd, hhmm: cand };
            }
          }

          // brak godzin – spróbuj dołożyć interwałem w tym dniu
          const step =
            opts.matchIntervalMinutes && opts.matchIntervalMinutes > 0
              ? opts.matchIntervalMinutes
              : declared.length >= 2
                ? Math.max(1, toMin(declared[1]) - toMin(declared[0]))
                : intervalMinutes;

          const from = st.lastSlotMins + step;
          const free = pickFree(ymd, from, step);
          if (free) {
            markUsed(ymd, free);
            st.lastSlotMins = toMin(free);
            return { ymd, hhmm: free };
          }

          if (!roundInSingleDay) {
            // przelew na kolejny dzień – zacznij od pierwszego slotu dnia
            roundDay = this.addDays(roundDay, 1);
            ymd = roundDay;
            st = ensureState(ymd);
            const firstFree = firstSlotOfDay(ymd);
            markUsed(ymd, firstFree);
            st.lastSlotMins = toMin(firstFree);
            st.slotIdx = Math.max(st.slotIdx, intervalMode ? 1 : 1); // „coś” już zużyliśmy
            return { ymd, hhmm: firstFree };
          }

          // wymuś w obrębie dnia (zawijanie)
          let wrap = from % (24 * 60);
          while (isUsed(ymd, toHHMM(wrap))) wrap = (wrap + step) % (24 * 60);
          const hhmm = toHHMM(wrap);
          markUsed(ymd, hhmm);
          st.lastSlotMins = wrap;
          return { ymd, hhmm };
        } else {
          // tryb interwałów
          const from =
            st.slotIdx === 0 ? toMin(first) : st.lastSlotMins + intervalMinutes;
          st.slotIdx++;
          const free = pickFree(ymd, from, intervalMinutes);
          if (free) {
            markUsed(ymd, free);
            st.lastSlotMins = toMin(free);
            return { ymd, hhmm: free };
          }

          if (!roundInSingleDay) {
            roundDay = this.addDays(roundDay, 1);
            ymd = roundDay;
            st = ensureState(ymd);
            const firstFree = firstSlotOfDay(ymd);
            markUsed(ymd, firstFree);
            st.lastSlotMins = toMin(firstFree);
            st.slotIdx = Math.max(st.slotIdx, 1);
            return { ymd, hhmm: firstFree };
          }

          // zawijanie w obrębie dnia
          let wrap = from % (24 * 60);
          while (isUsed(ymd, toHHMM(wrap)))
            wrap = (wrap + intervalMinutes) % (24 * 60);
          const hhmm = toHHMM(wrap);
          markUsed(ymd, hhmm);
          st.lastSlotMins = wrap;
          return { ymd, hhmm };
        }
      },
    };
  }

  private async createBracketTree(
    stageId: string,
    firstPairs: Pair<QualifiedTeam>[],
    opts: SchedulingOptions,
  ) {
    const allocator = this.makeAllocator(opts);

    const teamsCount = firstPairs.length * 2;
    const totalRounds = Math.ceil(Math.log2(teamsCount)); // 16→4, 8→3, 4→2
    const firstRoundNo = totalRounds;

    // licznik indeksów per runda (dla @@unique(stageId, round, index))
    const roundIndexCounters = new Map<number, number>();
    const nextIndexForRound = (roundNo: number) => {
      const cur = roundIndexCounters.get(roundNo) ?? 0;
      const nxt = cur + 1;
      roundIndexCounters.set(roundNo, nxt);
      return nxt;
    };

    // --- R1 (konkretne zespoły)
    let currentRoundDay = opts.startDate;
    allocator.startOfRound(currentRoundDay);

    const r1 = await Promise.all(
      firstPairs.map(async (p) => {
        const { ymd, hhmm } = allocator.allocate();
        return this.prisma.match.create({
          data: {
            stageId,
            round: firstRoundNo,
            index: nextIndexForRound(firstRoundNo),
            date: this.toZonedDate(ymd, hhmm),
            status: 'SCHEDULED',
            homeTeamId: p.home.teamId,
            awayTeamId: p.away.teamId,
            homeSourceKind: 'TEAM',
            awaySourceKind: 'TEAM',
          },
        });
      }),
    );

    // --- Kolejne rundy (WINNER z poprzednich)
    let prev = r1;
    for (let r = firstRoundNo - 1; r >= 1; r--) {
      currentRoundDay = allocator.nextRoundDay(currentRoundDay);
      allocator.startOfRound(currentRoundDay);

      const next: typeof prev = [];

      if (r === 1) {
        const left = prev[0];
        const right = prev[1] ?? null;

        if (opts.withThirdPlace && prev.length === 2) {
          const a = allocator.allocate();
          const b = allocator.allocate();

          const toKey = (s: { ymd: string; hhmm: string }) =>
            `${s.ymd}T${s.hhmm}`;
          const [early, late] = toKey(a) <= toKey(b) ? [a, b] : [b, a];

          // FINAŁ ─ PÓŹNIEJSZY slot, index: 1  ✅
          const final = await this.prisma.match.create({
            data: {
              stageId,
              round: 1,
              index: 1,
              date: this.toZonedDate(late.ymd, late.hhmm),
              status: 'SCHEDULED',
              homeSourceKind: 'WINNER',
              homeSourceRef: left.id,
              awaySourceKind: 'WINNER',
              awaySourceRef: right?.id ?? null,
            },
          });

          // 3. MIEJSCE ─ WCZEŚNIEJSZY slot, index: 2  ✅
          await this.prisma.match.create({
            data: {
              stageId,
              round: 1,
              index: 2,
              date: this.toZonedDate(early.ymd, early.hhmm),
              status: 'SCHEDULED',
              homeSourceKind: 'LOSER',
              homeSourceRef: prev[0].id,
              awaySourceKind: 'LOSER',
              awaySourceRef: prev[1].id,
            },
          });

          next.push(final);
        } else {
          // bez meczu o 3. miejsce – bez zmian
          const slotFinal = allocator.allocate();
          const final = await this.prisma.match.create({
            data: {
              stageId,
              round: 1,
              index: 1,
              date: this.toZonedDate(slotFinal.ymd, slotFinal.hhmm),
              status: 'SCHEDULED',
              homeSourceKind: 'WINNER',
              homeSourceRef: left.id,
              awaySourceKind: 'WINNER',
              awaySourceRef: right?.id ?? null,
            },
          });
          next.push(final);
        }
      } else {
        // ...bez zmian dla innych rund (SF/QF)
        for (let i = 0; i < prev.length; i += 2) {
          const left = prev[i];
          const right = prev[i + 1] ?? null;

          const { ymd, hhmm } = allocator.allocate();
          const m = await this.prisma.match.create({
            data: {
              stageId,
              round: r,
              index: nextIndexForRound(r),
              date: this.toZonedDate(ymd, hhmm),
              status: 'SCHEDULED',
              homeSourceKind: 'WINNER',
              homeSourceRef: left.id,
              awaySourceKind: 'WINNER',
              awaySourceRef: right?.id ?? null,
            },
          });
          next.push(m);
        }
      }

      prev = next;
    }

    return this.prisma.match.findMany({
      where: { stageId },
      orderBy: [{ round: 'desc' }, { index: 'asc' }],
    });
  }

  private pickWinnerLoser(m: {
    status: string;
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeScore: number | null;
    awayScore: number | null;
  }): { winnerId?: string; loserId?: string } {
    if (
      m.status !== 'FINISHED' ||
      m.homeTeamId == null ||
      m.awayTeamId == null ||
      m.homeScore == null ||
      m.awayScore == null
    ) {
      return {};
    }

    const homeWon = m.homeScore > m.awayScore;
    return {
      winnerId: homeWon ? m.homeTeamId : m.awayTeamId,
      loserId: homeWon ? m.awayTeamId : m.homeTeamId,
    };
  }

  async propagateMatchOutcome(matchId: string): Promise<void> {
    const m = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        stageId: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });
    if (!m) return;

    const { winnerId, loserId } = this.pickWinnerLoser(m);

    if (!winnerId || !loserId) {
      await this.prisma.match.updateMany({
        where: { homeSourceRef: matchId, homeSourceKind: 'WINNER' },
        data: { homeTeamId: null },
      });
      await this.prisma.match.updateMany({
        where: { awaySourceRef: matchId, awaySourceKind: 'WINNER' },
        data: { awayTeamId: null },
      });
      await this.prisma.match.updateMany({
        where: { homeSourceRef: matchId, homeSourceKind: 'LOSER' },
        data: { homeTeamId: null },
      });
      await this.prisma.match.updateMany({
        where: { awaySourceRef: matchId, awaySourceKind: 'LOSER' },
        data: { awayTeamId: null },
      });
      return;
    }

    await this.prisma.$transaction([
      this.prisma.match.updateMany({
        where: { homeSourceRef: matchId, homeSourceKind: 'WINNER' },
        data: { homeTeamId: winnerId },
      }),
      this.prisma.match.updateMany({
        where: { awaySourceRef: matchId, awaySourceKind: 'WINNER' },
        data: { awayTeamId: winnerId },
      }),
      this.prisma.match.updateMany({
        where: { homeSourceRef: matchId, homeSourceKind: 'LOSER' },
        data: { homeTeamId: loserId },
      }),
      this.prisma.match.updateMany({
        where: { awaySourceRef: matchId, awaySourceKind: 'LOSER' },
        data: { awayTeamId: loserId },
      }),
    ]);
  }
}
