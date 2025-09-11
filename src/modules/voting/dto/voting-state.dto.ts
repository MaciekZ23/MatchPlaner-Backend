export type VotingStatus = 'NOT_STARTED' | 'OPEN' | 'CLOSED';

export interface PlayerEventStatsDto {
  goals?: number;
  assists?: number;
  yellow?: number;
  red?: number;
  ownGoals?: number;
}

export interface VotingCandidateDto {
  playerId: string;
  teamId: string;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  healthStatus: 'HEALTHY' | 'INJURED';
  events?: PlayerEventStatsDto;
  shirtNumber?: number;
  isGoalkeeper?: boolean;
  playedAsGK?: boolean;
}

export interface VoteSummaryEntryDto {
  playerId: string;
  votes: number;
}

export interface VotingStateDto {
  matchId: string;
  status: VotingStatus;
  hasVoted: boolean;
  candidates: VotingCandidateDto[];
  summary: VoteSummaryEntryDto[];
  closesPolicy?: {
    type: 'ABSOLUTE_DEADLINE' | 'NEXT_ROUND_START' | 'MANUAL';
    closesAtISO?: string;
  };
  closesAtISO?: string;
}
