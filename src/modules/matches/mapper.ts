import type { Match, MatchEvent } from '@prisma/client';
import { MatchDto, MatchEventDto } from './dto/match.dto';

type MatchWithEvents = Match & { events?: MatchEvent[] };

export const toEventDto = (e: MatchEvent): MatchEventDto => ({
  minute: e.minute,
  type: e.type as MatchEventDto['type'],
  playerId: e.playerId,
  teamId: e.teamId,
  card: e.card as MatchEventDto['card'] | undefined,
});

export const toMatchDto = (m: MatchWithEvents): MatchDto => ({
  id: m.id,
  stageId: m.stageId,
  groupId: m.groupId ?? undefined,
  round: m.round ?? undefined,
  date: m.date.toISOString(),
  status: m.status as MatchDto['status'],
  homeTeamId: m.homeTeamId ?? null,
  awayTeamId: m.awayTeamId ?? null,
  homeSourceKind: (m.homeSourceKind ?? null) as MatchDto['homeSourceKind'],
  homeSourceRef: m.homeSourceRef ?? null,
  awaySourceKind: (m.awaySourceKind ?? null) as MatchDto['awaySourceKind'],
  awaySourceRef: m.awaySourceRef ?? null,
  score:
    m.homeScore == null && m.awayScore == null
      ? undefined
      : { home: m.homeScore ?? 0, away: m.awayScore ?? 0 },
  events: m.events?.map(toEventDto),
  lineups: {
    homeGKIds: m.homeGKIds?.length ? m.homeGKIds : undefined,
    awayGKIds: m.awayGKIds?.length ? m.awayGKIds : undefined,
  },
});
