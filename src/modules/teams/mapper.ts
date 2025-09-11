import { Player, Team } from '@prisma/client';
import { PlayerDto } from './dto/player.dto';
import { TeamDto } from './dto/team.dto';

export const toPlayerDto = (p: Player): PlayerDto => ({
  id: p.id,
  teamId: p.teamId,
  name: p.name,
  position: p.position as PlayerDto['position'],
  shirtNumber: p.shirtNumber ?? undefined,
  healthStatus: p.healthStatus as PlayerDto['healthStatus'],
});

export const toTeamDto = (t: Team & { players?: Player[] }): TeamDto => ({
  id: t.id,
  name: t.name,
  logo: t.logo ?? undefined,
  playerIds: (t.players ?? []).map((p) => p.id),
});
