export type Pair<T> = { home: T; away: T };

export interface QualifiedTeam {
  teamId: string;
  group: string;
  place: number;
}

export interface SchedulingOptions {
  startDate: string;
  matchTimes?: string[];
  firstMatchTime?: string;
  matchIntervalMinutes?: number;
  dayInterval?: number;
  roundInSingleDay?: boolean;
  withThirdPlace: boolean;
  clearExisting?: boolean;
}
