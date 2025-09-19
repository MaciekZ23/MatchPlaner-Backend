import { Prisma } from '@prisma/client';
import {
  VotingStateDto,
  VotingCandidateDto,
  PlayerEventStatsDto,
} from './dto/voting-state.dto';

export function toVotingStateDto(params: {
  match: Prisma.MatchGetPayload<{
    include: { homeTeam: true; awayTeam: true; events: true };
  }>;
  players: Array<{
    id: string;
    teamId: string;
    name: string;
    position: 'GK' | 'DEF' | 'MID' | 'FWD';
    healthStatus: 'HEALTHY' | 'INJURED';
    shirtNumber: number | null;
  }>;
  summary: Array<{ playerId: string; votes: number }>;
  voting: {
    status: 'NOT_STARTED' | 'OPEN' | 'CLOSED';
    closesAt: Date | null;
    closeType: 'ABSOLUTE_DEADLINE' | 'NEXT_ROUND_START' | 'MANUAL' | null;
  };
  hasVoted?: boolean;
}): VotingStateDto {
  const { match, players, summary, voting, hasVoted } = params;

  const evByPlayer = new Map<string, PlayerEventStatsDto>();
  for (const ev of match.events ?? []) {
    const stat = evByPlayer.get(ev.playerId) ?? {};
    switch (ev.type) {
      case 'GOAL':
        stat.goals = (stat.goals ?? 0) + 1;
        break;
      case 'ASSIST':
        stat.assists = (stat.assists ?? 0) + 1;
        break;
      case 'OWN_GOAL':
        stat.ownGoals = (stat.ownGoals ?? 0) + 1;
        break;
      case 'CARD':
        if (ev.card === 'RED') {
          stat.red = (stat.red ?? 0) + 1;
        } else if (ev.card === 'SECOND_YELLOW') {
          stat.yellow = (stat.yellow ?? 0) + 1;
          stat.red = (stat.red ?? 0) + 1;
        } else {
          stat.yellow = (stat.yellow ?? 0) + 1;
        }
        break;
    }
    evByPlayer.set(ev.playerId, stat);
  }

  const teamIds = [match.homeTeamId, match.awayTeamId];
  const healthyPlayers = players.filter(
    (p) => p.healthStatus === 'HEALTHY' && teamIds.includes(p.teamId),
  );

  const homeGKSet = new Set(match.homeGKIds ?? []);
  const awayGKSet = new Set(match.awayGKIds ?? []);

  const candidates: VotingCandidateDto[] = healthyPlayers
    .map((p) => {
      const isGK = p.position === 'GK';
      const playedAsGK =
        isGK &&
        (p.teamId === match.homeTeamId
          ? homeGKSet.has(p.id)
          : awayGKSet.has(p.id));

      const events = evByPlayer.get(p.id);

      const cleanEvents =
        events && Object.keys(events).length > 0 ? events : undefined;

      return {
        playerId: p.id,
        teamId: p.teamId,
        name: p.name,
        position: p.position,
        healthStatus: p.healthStatus,
        shirtNumber: p.shirtNumber ?? undefined,
        isGoalkeeper: isGK,
        playedAsGK,
        events: cleanEvents,
      };
    })
    .sort((a, b) => {
      const teamOrderA = a.teamId === match.homeTeamId ? 0 : 1;
      const teamOrderB = b.teamId === match.homeTeamId ? 0 : 1;
      if (teamOrderA !== teamOrderB) return teamOrderA - teamOrderB;
      const snA = a.shirtNumber ?? 9999;
      const snB = b.shirtNumber ?? 9999;
      if (snA !== snB) return snA - snB;
      return a.name.localeCompare(b.name);
    });

  const closesPolicy =
    voting.closeType != null
      ? {
          type: voting.closeType,
          ...(voting.closeType === 'ABSOLUTE_DEADLINE' && voting.closesAt
            ? { closesAtISO: voting.closesAt.toISOString() }
            : {}),
        }
      : undefined;

  return {
    matchId: match.id,
    status: voting.status,
    hasVoted: !!hasVoted,
    candidates,
    summary,
    closesPolicy,
    closesAtISO: voting.closesAt ? voting.closesAt.toISOString() : undefined,
  };
}
