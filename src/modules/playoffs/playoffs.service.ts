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

  /**
   * Generuje fazę pucharową dla danego turnieju
   *
   * Metoda:
   * weryfikuje zakończenie fazy grupowej
   * pobiera zakwalifikowane drużyny
   * tworzy etap playoff
   * opcjonalnie usuwa istniejące mecze
   * generuje pełną drabinkę pucharową
   */
  async generateForTournament(tournamentId: string, dto: GeneratePlayoffsDto) {
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
      dayInterval: dto.roundInSingleDay ? 0 : (dto.dayInterval ?? 0),
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

  /**
   * Zapewnia istnienie etapu typu PLAYOFF dla danego turnieju
   * Jeśli etap już istnieje, zostaje zwrócony, w przeciwnym razie tworzony jest nowy
   */
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

  /**
   * Buduje pary pierwszej rundy fazy pucharowej na podstawie wyników fazy grupowej
   *
   * Algorytm łączy:
   * - zwycięzcę grupy z wicemistrzem innej grupy
   * - zapewnia brak powtórzeń drużyn
   * - wymaga parzystej liczby grup
   */
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

  /**
   * Zwraca datę powiększoną o określoną liczbę dni
   */
  private addDays(ymd: string, days: number): string {
    const d = new Date(ymd);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Tworzy obiekt Date na podstawie daty i godziny
   * w lokalnej strefie czasowej
   */
  private toZonedDate(ymd: string, hhmm: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    const [hh, mm] = hhmm.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  /**
   * Tworzy alokator terminów meczów fazy pucharowej
   *
   * Mechanizm odpowiada za:
   * przydzielanie godzin rozpoczęcia meczów
   * obsługę interwałów czasowych
   * przechodzenie do kolejnych dni rozgrywek
   */
  private makeAllocator(opts: SchedulingOptions) {
    const interval = opts.matchIntervalMinutes ?? 60;
    const roundInSingleDay = opts.roundInSingleDay ?? true;
    const firstTime = opts.firstMatchTime ?? '22:00';

    const toMin = (hhmm: string) => {
      const [hh, mm] = hhmm.split(':').map(Number);
      return hh * 60 + mm;
    };
    const toHHMM = (mins: number) => {
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const addDays = (ymd: string, days: number) => {
      const d = new Date(ymd);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    let curDay = opts.startDate;
    let curMins = toMin(firstTime);

    return {
      startOfRound: (ymd: string) => {
        curDay = ymd;
        curMins = toMin(firstTime);
      },

      nextRoundDay: (ymd: string) => addDays(ymd, opts.dayInterval ?? 0),

      allocate: () => {
        const obj = { ymd: curDay, hhmm: toHHMM(curMins) };

        curMins += interval;

        if (curMins >= 24 * 60) {
          curMins -= 24 * 60;
          curDay = addDays(curDay, 1);

          if (!roundInSingleDay) {
            curMins = toMin(firstTime);
          }
        }

        return obj;
      },
    };
  }

  /**
   * Tworzy pełną strukturę drabinki pucharowej
   *
   * Metoda:
   * generuje mecze kolejnych rund
   * wiąże mecze poprzez referencje do zwycięzców i przegranych
   * opcjonalnie tworzy mecz o trzecie miejsce
   * zapisuje całą strukturę w bazie danych
   */
  private async createBracketTree(
    stageId: string,
    firstPairs: Pair<QualifiedTeam>[],
    opts: SchedulingOptions,
  ) {
    const allocator = this.makeAllocator(opts);

    const teamsCount = firstPairs.length * 2;
    const totalRounds = Math.ceil(Math.log2(teamsCount));
    const firstRoundNo = totalRounds;

    const roundIndexCounters = new Map<number, number>();
    const nextIndexForRound = (roundNo: number) => {
      const cur = roundIndexCounters.get(roundNo) ?? 0;
      const nxt = cur + 1;
      roundIndexCounters.set(roundNo, nxt);
      return nxt;
    };

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

    let prev = r1;
    for (let r = firstRoundNo - 1; r >= 1; r--) {
      if (!opts.roundInSingleDay) {
        currentRoundDay = allocator.nextRoundDay(currentRoundDay);
        allocator.startOfRound(currentRoundDay);
      }

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

  /**
   * Określa zwycięzcę i przegranego meczu na podstawie wyniku końcowego
   */
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

  /**
   * Propaguje wynik zakończonego meczu do kolejnych rund drabinki
   *
   * Na podstawie zwycięzcy i przegranego:
   * aktualizuje drużyny w meczach zależnych,
   * czyści powiązania w przypadku cofnięcia wyniku
   */
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
