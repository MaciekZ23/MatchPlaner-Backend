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
      startDateISO: dto.startDateISO,
      matchDurationMin: dto.matchDurationMin,
      gapBetweenMatchesMin: dto.gapBetweenMatchesMin,
      matchesPerDay: dto.matchesPerDay,
      withThirdPlace: dto.withThirdPlace,
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
    const pairs: Pair<QualifiedTeam>[] = [];

    if (groups.length === 0) {
      return pairs;
    }

    if (groups.length === 1) {
      const g = groups[0];
      const first = q.find((t) => t.group === g && t.place === 1) ?? null;
      const second = q.find((t) => t.group === g && t.place === 2) ?? null;
      if (first && second) {
        pairs.push({ home: first, away: second });
      }
      return pairs;
    }

    if (groups.length % 2 !== 0) {
      throw new BadRequestException(
        'Liczba grup musi być parzysta, aby zbudować drabinkę bez BYE (albo dodaj logikę BYE/best thirds).',
      );
    }

    for (let i = 0; i < groups.length; i += 2) {
      const g1 = groups[i];
      const g2 = groups[i + 1];

      const g1_1 = q.find((t) => t.group === g1 && t.place === 1) ?? null;
      const g1_2 = q.find((t) => t.group === g1 && t.place === 2) ?? null;
      const g2_1 = q.find((t) => t.group === g2 && t.place === 1) ?? null;
      const g2_2 = q.find((t) => t.group === g2 && t.place === 2) ?? null;

      if (g1_1 && g2_2) {
        pairs.push({ home: g1_1, away: g2_2 });
      }
      if (g2_1 && g1_2) {
        pairs.push({ home: g2_1, away: g1_2 });
      }
    }

    return pairs;
  }

  private addMinutesISO(baseISO: string, plusMin: number): string {
    const d = new Date(baseISO);
    d.setMinutes(d.getMinutes() + plusMin);
    return d.toISOString();
  }

  // Wyliczanie daty/godziny dla kolejnego slotu
  private makeSlotter(opts: SchedulingOptions) {
    const step = opts.matchDurationMin + opts.gapBetweenMatchesMin;

    return (slotIndex: number) => {
      const day = Math.floor(slotIndex / opts.matchesPerDay);
      const offset = slotIndex % opts.matchesPerDay;

      const baseForDay = this.addMinutesISO(
        opts.startDateISO,
        day * opts.matchesPerDay * step,
      );
      return this.addMinutesISO(baseForDay, offset * step);
    };
  }

  // Tworzenie pełnej drabinki
  private async createBracketTree(
    stageId: string,
    firstPairs: Pair<QualifiedTeam>[],
    opts: SchedulingOptions,
  ) {
    const slotAt = this.makeSlotter(opts);
    const teamsCount = firstPairs.length * 2;
    const totalRounds = Math.ceil(Math.log2(teamsCount)); // 16→4, 8→3, 4→2
    const firstRoundNo = totalRounds;

    // Pierwsza runda
    const r1 = await Promise.all(
      firstPairs.map((p, idx) =>
        this.prisma.match.create({
          data: {
            stageId,
            round: firstRoundNo,
            index: idx + 1,
            date: slotAt(idx),
            status: 'SCHEDULED',
            homeTeamId: p.home.teamId,
            awayTeamId: p.away.teamId,
            homeSourceKind: 'TEAM',
            awaySourceKind: 'TEAM',
          },
        }),
      ),
    );

    // Kolejne rundy
    let prev = r1;
    let slotCursor = r1.length;
    for (let r = firstRoundNo - 1; r >= 1; r--) {
      const next: typeof prev = [];
      for (let i = 0; i < prev.length; i += 2) {
        const left = prev[i];
        const right = prev[i + 1];

        const m = await this.prisma.match.create({
          data: {
            stageId,
            round: r,
            index: Math.floor(i / 2) + 1,
            date: slotAt(slotCursor++),
            status: 'SCHEDULED',
            homeSourceKind: 'WINNER',
            homeSourceRef: left.id,
            awaySourceKind: 'WINNER',
            awaySourceRef: right?.id ?? null,
          },
        });
        next.push(m);
      }
      prev = next;
    }

    // Mecz o 3. miejsce
    if (opts.withThirdPlace) {
      const semis = await this.prisma.match.findMany({
        where: { stageId, round: 2 },
        orderBy: { index: 'asc' },
      });
      if (semis.length === 2) {
        await this.prisma.match.create({
          data: {
            stageId,
            round: 1,
            index: 2,
            date: slotAt(slotCursor++),
            status: 'SCHEDULED',
            homeSourceKind: 'LOSER',
            homeSourceRef: semis[0].id,
            awaySourceKind: 'LOSER',
            awaySourceRef: semis[1].id,
          },
        });
      }
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
