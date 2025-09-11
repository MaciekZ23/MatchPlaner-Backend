import { Prisma } from '@prisma/client';
import { VotingStateDto, VotingCandidateDto } from './dto/voting-state.dto';

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
    closeType: any | null;
  };
}): VotingStateDto {
  const { match, players, summary, voting } = params;

  const teamIds = [match.homeTeamId, match.awayTeamId];
  const healthyPlayers = players.filter(
    (p) => p.healthStatus === 'HEALTHY' && teamIds.includes(p.teamId),
  );

  const candidates: VotingCandidateDto[] = healthyPlayers.map((p) => ({
    playerId: p.id,
    teamId: p.teamId,
    name: p.name,
    position: p.position,
    healthStatus: p.healthStatus,
    shirtNumber: p.shirtNumber ?? undefined,
    isGoalkeeper: p.position === 'GK',
    // playedAsGK – można wyliczyć na podstawie lineups jeśli trzymasz
  }));

  return {
    matchId: match.id,
    status: voting.status,
    hasVoted: false, // backend nie śledzi – front sam zaznaczy po localStorage
    candidates,
    summary,
    closesPolicy: voting.closeType ? { type: voting.closeType } : undefined,
    closesAtISO: voting.closesAt ? voting.closesAt.toISOString() : undefined,
  };
}
