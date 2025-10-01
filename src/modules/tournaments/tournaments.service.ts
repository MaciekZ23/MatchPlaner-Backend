import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { toTournamentDto } from './mapper';
import { CreateTournamentDto, UpdateTournamentDto } from './dto/tournament.dto';
import { Prisma, $Enums } from '@prisma/client';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextTournamentIdTx(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const existing = await tx.idCounter.findUnique({
      where: { key: 'tournament' },
    });
    if (existing) {
      const updated = await tx.idCounter.update({
        where: { key: 'tournament' },
        data: { value: { increment: 1 } },
      });
      return `t${updated.value}`;
    }

    const all = await tx.tournament.findMany({ select: { id: true } });
    let max = 0;
    for (const t of all) {
      const m = /^t(\d+)$/i.exec(t.id);
      const n = m ? parseInt(m[1], 10) : NaN;
      if (Number.isFinite(n) && n > max) {
        max = n;
      }
    }

    const created = await tx.idCounter.create({
      data: { key: 'tournament', value: max + 1 },
    });
    return `t${created.value}`;
  }

  async findOne(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: { groups: true, stages: true },
    });

    if (!t) {
      throw new NotFoundException('Tournament not found');
    }
    return toTournamentDto(t);
  }

  async create(dto: CreateTournamentDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const newId = await this.nextTournamentIdTx(tx);

      const mode: $Enums.TournamentMode =
        (dto.mode as $Enums.TournamentMode) ?? $Enums.TournamentMode.LEAGUE;

      let groupsData:
        | { create: Array<{ id: string; name: string; teamIds: string[] }> }
        | undefined = undefined;
      if (dto.groups && dto.groups.length > 0) {
        const arr: Array<{ id: string; name: string; teamIds: string[] }> = [];
        for (const g of dto.groups) {
          arr.push({
            id: g.id,
            name: g.name,
            teamIds: g.teamIds ?? [],
          });
        }
        groupsData = { create: arr };
      }

      let stagesData:
        | {
            create: Array<{
              id: string;
              name: string;
              kind: $Enums.StageKind;
              order: number;
            }>;
          }
        | undefined = undefined;
      if (dto.stages && dto.stages.length > 0) {
        const arr: Array<{
          id: string;
          name: string;
          kind: $Enums.StageKind;
          order: number;
        }> = [];
        for (const s of dto.stages) {
          arr.push({
            id: s.id,
            name: s.name,
            kind: s.kind as $Enums.StageKind,
            order: s.order,
          });
        }
        stagesData = { create: arr };
      }

      const createdInner = await tx.tournament.create({
        data: {
          id: newId,
          name: dto.name,
          mode,

          description: dto.description ?? null,
          additionalInfo: dto.additionalInfo ?? null,
          season: dto.season ?? null,

          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          timezone: dto.timezone ?? null,

          venue: dto.venue ?? null,
          venueAddress: dto.venueAddress ?? null,
          venueImageUrl: dto.venueImageUrl ?? null,

          groups: groupsData,
          stages: stagesData,
        },
        include: { groups: true, stages: true },
      });

      return createdInner;
    });

    return toTournamentDto(created);
  }

  async update(id: string, dto: UpdateTournamentDto) {
    const exists = await this.prisma.tournament.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Tournament not found');
    }

    const data: Prisma.TournamentUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.mode !== undefined) {
      data.mode = dto.mode as $Enums.TournamentMode;
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.additionalInfo !== undefined) {
      data.additionalInfo = dto.additionalInfo;
    }
    if (dto.season !== undefined) {
      data.season = dto.season;
    }

    if (dto.startDate !== undefined) {
      if (dto.startDate === null) {
        data.startDate = null;
      } else {
        data.startDate = new Date(dto.startDate);
      }
    }
    if (dto.endDate !== undefined) {
      if (dto.endDate === null) {
        data.endDate = null;
      } else {
        data.endDate = new Date(dto.endDate);
      }
    }
    if (dto.timezone !== undefined) {
      data.timezone = dto.timezone;
    }

    if (dto.venue !== undefined) {
      data.venue = dto.venue;
    }
    if (dto.venueAddress !== undefined) {
      data.venueAddress = dto.venueAddress;
    }
    if (dto.venueImageUrl !== undefined) {
      data.venueImageUrl = dto.venueImageUrl;
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data,
      include: { groups: true, stages: true },
    });

    return toTournamentDto(updated);
  }

  async delete(id: string) {
    await this.prisma.$transaction([
      this.prisma.group.deleteMany({ where: { tournamentId: id } }),
      this.prisma.stage.deleteMany({ where: { tournamentId: id } }),
      this.prisma.tournament.delete({ where: { id } }),
    ]);
  }
}
