import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

type RawMatch = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

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

  /** Top2 z każdej grupy wg reguł: pkt → H2H pkt → H2H GD → GD → GF → W → AW */
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

      const finished = g.matches.filter((m) => {
        return (
          m.status === 'FINISHED' &&
          m.homeTeamId &&
          m.awayTeamId &&
          m.homeScore != null &&
          m.awayScore != null
        );
      }) as RawMatch[];

      // zliczanie
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
          away.awayWins += 1; // zwycięstwo gości
        } else {
          home.pts += 1;
          away.pts += 1;
        }
      }

      // sort bazowy po punktach
      let table = Array.from(rows.values()).sort((a, b) => b.pts - a.pts);

      // rozwiązywanie remisów w klastrach
      let i = 0;
      while (i < table.length) {
        let j = i + 1;
        while (j < table.length && table[j].pts === table[i].pts) {
          j++;
        }

        if (j - i > 1) {
          const cluster = table.slice(i, j);
          const clusterIds = new Set(cluster.map((r) => r.teamId));
          const mini = this.buildMiniTable(clusterIds, finished);

          cluster.sort((a, b) => {
            // 1) punkty H2H
            if (mini.get(b.teamId)!.pts !== mini.get(a.teamId)!.pts) {
              return mini.get(b.teamId)!.pts - mini.get(a.teamId)!.pts;
            }
            // 2) bilans H2H
            if (mini.get(b.teamId)!.gd !== mini.get(a.teamId)!.gd) {
              return mini.get(b.teamId)!.gd - mini.get(a.teamId)!.gd;
            }
            // 3) bilans ogólny
            if (b.gd !== a.gd) {
              return b.gd - a.gd;
            }
            // 4) gole ogólnie
            if (b.gf !== a.gf) {
              return b.gf - a.gf;
            }
            // 5) zwycięstwa ogółem
            if (b.wins !== a.wins) {
              return b.wins - a.wins;
            }
            // 6) zwycięstwa na wyjeździe
            if (b.awayWins !== a.awayWins) {
              return b.awayWins - a.awayWins;
            }
            // stabilne domknięcie
            return a.teamId.localeCompare(b.teamId);
          });

          table.splice(i, j - i, ...cluster);
        }

        i = j;
      }

      // dodatkowo – gdy w klastrze 2 drużyn wciąż remis:
      // porównanie 1:1 (H2H) przed globalnymi 3→6 (dla pewności)
      table = table.sort((a, b) => this.comparePair(a, b, finished));

      if (table[0]) {
        qualified.push({ teamId: table[0].teamId, group: g.id, place: 1 });
      }
      if (table[1]) {
        qualified.push({ teamId: table[1].teamId, group: g.id, place: 2 });
      }
    }

    return qualified;
  }

  /** Mini-tabela tylko w gronie wskazanych ekip: liczy pkt i GD H2H */
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

  /** Porównanie dwóch drużyn wg pełnych zasad (używane jako domknięcie) */
  private comparePair(a: Row, b: Row, matches: RawMatch[]): number {
    if (a.pts !== b.pts) {
      return b.pts - a.pts;
    }

    // H2H tylko między a–b
    let aPts = 0,
      bPts = 0,
      aGD = 0,
      bGD = 0;
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
