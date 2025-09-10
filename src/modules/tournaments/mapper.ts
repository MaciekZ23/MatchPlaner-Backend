import { Group, Stage, Tournament } from 'generated/prisma';

export const toTournamentDto = (
  t: Tournament & { groups: Group[]; stages: Stage[] },
) => ({
  id: t.id,
  name: t.name,
  mode: t.mode,
  description: t.description ?? undefined,
  additionalInfo: t.additionalInfo ?? undefined,
  season: t.season ?? undefined,
  startDate: t.startDate?.toISOString(),
  endDate: t.endDate?.toISOString(),
  timezone: t.timezone ?? undefined,
  venue: t.venue ?? undefined,
  venueAddress: t.venueAddress ?? undefined,
  venueImageUrl: t.venueImageUrl ?? undefined,
  groups: t.groups.map((g) => ({ id: g.id, name: g.name, teamIds: g.teamIds })),
  stages: t.stages.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    order: s.order,
  })),
});
