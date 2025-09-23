export type Pair<T> = { home: T; away: T };

export interface QualifiedTeam {
  teamId: string;
  group: string;
  place: number;
}

export interface SchedulingOptions {
  startDateISO: string;
  matchDurationMin: number;
  gapBetweenMatchesMin: number;
  matchesPerDay: number;
  withThirdPlace: boolean;
}
