import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

/** Surowy widok meczu potrzebny do obliczeń tabeli */
type RawMatch = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

/** Pojedynczy wiersz tabeli roboczej */
interface Row {
  teamId: string;
  pts: number;
  gf: number;
  ga: number;
  gd: number;
  wins: number;
  awayWins: number;
}

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Zwraca Top2 z każdej grupy */
  async topTwoPerGroup(
    tournamentId: string,
  ): Promise<Array<{ teamId: string; group: string; place: 1 | 2 }>> {
    const stage = await this.prisma.stage.findFirst({
      where: { tournamentId, kind: 'GROUP' },
      select: { id: true },
    });

    if (!stage) {
      return [];
    }

    const groups = await this.prisma.group.findMany({
      where: { tournamentId },
      include: {
        matches: {
          where: { stageId: stage.id },
        },
      },
      orderBy: { name: 'asc' },
    });

    const qualified: Array<{ teamId: string; group: string; place: 1 | 2 }> =
      [];

    for (const g of groups) {
      // baza wierszy
      const rows = new Map<string, Row>();
      for (const tid of g.teamIds) {
        rows.set(tid, {
          teamId: tid,
          pts: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          wins: 0,
          awayWins: 0,
        });
      }

      // tylko mecze zakończone i z oboma zespołami + wynikiem
      const finished = g.matches.filter((m) => {
        return (
          m.status === 'FINISHED' &&
          !!m.homeTeamId &&
          !!m.awayTeamId &&
          m.homeScore != null &&
          m.awayScore != null
        );
      }) as RawMatch[];

      // agregacja statystyk
      for (const m of finished) {
        const home = rows.get(m.homeTeamId!)!;
        const away = rows.get(m.awayTeamId!)!;

        home.gf += m.homeScore!;
        home.ga += m.awayScore!;
        away.gf += m.awayScore!;
        away.ga += m.homeScore!;

        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;

        if (m.homeScore! > m.awayScore!) {
          home.pts += 3;
          home.wins += 1;
        } else if (m.homeScore! < m.awayScore!) {
          away.pts += 3;
          away.wins += 1;
          away.awayWins += 1;
        } else {
          home.pts += 1;
          away.pts += 1;
        }
      }

      // sort bazowy po punktach
      const table = Array.from(rows.values());
      table.sort((a, b) => b.pts - a.pts);

      // rozwiązywanie remisów w klastrach
      let i = 0;
      const resolved: Row[] = [];
      while (i < table.length) {
        let j = i + 1;
        while (j < table.length && table[j].pts === table[i].pts) {
          j++;
        }

        const cluster = table.slice(i, j);
        if (cluster.length === 1) {
          resolved.push(cluster[0]);
        } else if (cluster.length === 2) {
          cluster.sort((A, B) => {
            return this.compareTwo(A, B, finished);
          });
          resolved.push(...cluster);
        } else {
          const ids = new Set(cluster.map((r) => r.teamId));
          const mini = this.buildMiniTable(ids, finished);

          cluster.sort((A, B) => {
            if (mini.get(B.teamId)!.pts !== mini.get(A.teamId)!.pts) {
              return mini.get(B.teamId)!.pts - mini.get(A.teamId)!.pts;
            }

            if (mini.get(B.teamId)!.gd !== mini.get(A.teamId)!.gd) {
              return mini.get(B.teamId)!.gd - mini.get(A.teamId)!.gd;
            }

            if (B.gd !== A.gd) {
              return B.gd - A.gd;
            }

            if (B.gf !== A.gf) {
              return B.gf - A.gf;
            }

            if (B.wins !== A.wins) {
              return B.wins - A.wins;
            }

            if (B.awayWins !== A.awayWins) {
              return B.awayWins - A.awayWins;
            }

            return A.teamId.localeCompare(B.teamId);
          });

          resolved.push(...cluster);
        }

        i = j;
      }

      if (resolved[0]) {
        qualified.push({ teamId: resolved[0].teamId, group: g.id, place: 1 });
      }
      if (resolved[1]) {
        qualified.push({ teamId: resolved[1].teamId, group: g.id, place: 2 });
      }
    }

    return qualified;
  }

  /**Metoda tworząca mini-tabelę (tylko w gronie wskazanych zespołów) */
  private buildMiniTable(
    teams: Set<string>,
    matches: RawMatch[],
  ): Map<string, { pts: number; gd: number; gf: number }> {
    const res = new Map<
      string,
      { pts: number; gd: number; gf: number; ga: number }
    >();

    for (const id of teams) {
      res.set(id, { pts: 0, gd: 0, gf: 0, ga: 0 });
    }

    for (const m of matches) {
      if (!teams.has(m.homeTeamId!) || !teams.has(m.awayTeamId!)) {
        continue;
      }

      const A = res.get(m.homeTeamId!)!;
      const B = res.get(m.awayTeamId!)!;

      A.gf += m.homeScore!;
      A.ga += m.awayScore!;
      B.gf += m.awayScore!;
      B.ga += m.homeScore!;

      A.gd = A.gf - A.ga;
      B.gd = B.gf - B.ga;

      if (m.homeScore! > m.awayScore!) {
        A.pts += 3;
      } else if (m.homeScore! < m.awayScore!) {
        B.pts += 3;
      } else {
        A.pts += 1;
        B.pts += 1;
      }
    }

    const out = new Map<string, { pts: number; gd: number; gf: number }>();
    for (const [id, v] of res) {
      out.set(id, { pts: v.pts, gd: v.gd, gf: v.gf });
    }
    return out;
  }

  /** Porównanie dwóch drużyn wg pełnych zasad */
  private compareTwo(a: Row, b: Row, matches: RawMatch[]): number {
    if (a.pts !== b.pts) {
      return b.pts - a.pts;
    }

    let aPts = 0;
    let bPts = 0;
    let aGD = 0;
    let bGD = 0;

    for (const m of matches) {
      const isAB = m.homeTeamId === a.teamId && m.awayTeamId === b.teamId;
      const isBA = m.homeTeamId === b.teamId && m.awayTeamId === a.teamId;

      if (!isAB && !isBA) {
        continue;
      }

      const h = m.homeScore!;
      const aw = m.awayScore!;

      if (isAB) {
        if (h > aw) {
          aPts += 3;
        } else if (h < aw) {
          bPts += 3;
        } else {
          aPts += 1;
          bPts += 1;
        }
        aGD += h - aw;
        bGD += aw - h;
      } else {
        if (h > aw) {
          bPts += 3;
        } else if (h < aw) {
          aPts += 3;
        } else {
          aPts += 1;
          bPts += 1;
        }
        bGD += h - aw;
        aGD += aw - h;
      }
    }

    if (aPts !== bPts) {
      return bPts - aPts;
    }
    if (aGD !== bGD) {
      return bGD - aGD;
    }
    if (a.gd !== b.gd) {
      return b.gd - a.gd;
    }
    if (a.gf !== b.gf) {
      return b.gf - a.gf;
    }
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    if (a.awayWins !== b.awayWins) {
      return b.awayWins - a.awayWins;
    }
    return a.teamId.localeCompare(b.teamId);
  }
}
