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

  private alphaId(index0: number): string {
    let n = index0 + 1,
      out = '';
    while (n > 0) {
      n--;
      out = String.fromCharCode(65 + (n % 26)) + out;
      n = Math.floor(n / 26);
    }
    return out;
  }
  private alphaToNum(s: string): number {
    let n = 0;
    for (const ch of s.toUpperCase()) {
      const c = ch.charCodeAt(0);
      if (c < 65 || c > 90) return NaN;
      n = n * 26 + (c - 64);
    }
    return n;
  }

  private async nextGroupIdTx(tx: Prisma.TransactionClient): Promise<string> {
    const key = 'group';
    const existing = await tx.idCounter.findUnique({ where: { key } });
    if (existing) {
      const updated = await tx.idCounter.update({
        where: { key },
        data: { value: { increment: 1 } },
      });
      return this.alphaId(updated.value - 1);
    }
    const all = await tx.group.findMany({ select: { id: true } });
    let max = 0;
    for (const g of all) {
      const n = this.alphaToNum(g.id);
      if (Number.isFinite(n) && n > max) max = n;
    }
    const created = await tx.idCounter.create({
      data: { key, value: max + 1 },
    });
    return this.alphaId(created.value - 1);
  }

  private async nextStageIdTx(
    tx: Prisma.TransactionClient,
    kind: $Enums.StageKind,
  ): Promise<string> {
    const isGrp = kind === 'GROUP';
    const counterKey = isGrp ? 'stage-grp' : 'stage-po';
    const prefix = isGrp ? 'STAGE-GRP' : 'STAGE-PO';

    const existing = await tx.idCounter.findUnique({
      where: { key: counterKey },
    });
    if (existing) {
      const updated = await tx.idCounter.update({
        where: { key: counterKey },
        data: { value: { increment: 1 } },
      });
      return `${prefix}-${updated.value}`;
    }

    const all = await tx.stage.findMany({
      where: { kind },
      select: { id: true },
    });
    let max = 0;
    const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    for (const s of all) {
      const m = re.exec(s.id);
      const n = m ? parseInt(m[1], 10) : NaN;
      if (Number.isFinite(n) && n > max) max = n;
    }
    const created = await tx.idCounter.create({
      data: { key: counterKey, value: max + 1 },
    });
    return `${prefix}-${created.value}`;
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
        | undefined;
      if (dto.groups?.length) {
        const arr: Array<{ id: string; name: string; teamIds: string[] }> = [];
        for (const g of dto.groups) {
          const gid = await this.nextGroupIdTx(tx);
          arr.push({ id: gid, name: g.name, teamIds: g.teamIds ?? [] });
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
        | undefined;
      if (dto.stages?.length) {
        const arr: Array<{
          id: string;
          name: string;
          kind: $Enums.StageKind;
          order: number;
        }> = [];
        for (const s of dto.stages) {
          const sid = await this.nextStageIdTx(tx, s.kind as $Enums.StageKind);
          arr.push({
            id: sid,
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
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.tournament.findUnique({ where: { id } });
      if (!exists) {
        throw new NotFoundException('Tournament not found');
      }

      // 1) Metadane turnieju
      const data: Prisma.TournamentUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.mode !== undefined) data.mode = dto.mode as $Enums.TournamentMode;

      if (dto.description !== undefined) data.description = dto.description;
      if (dto.additionalInfo !== undefined)
        data.additionalInfo = dto.additionalInfo;
      if (dto.season !== undefined) data.season = dto.season;

      if (dto.startDate !== undefined) {
        data.startDate = dto.startDate ? new Date(dto.startDate) : null;
      }
      if (dto.endDate !== undefined) {
        data.endDate = dto.endDate ? new Date(dto.endDate) : null;
      }
      if (dto.timezone !== undefined) data.timezone = dto.timezone;
      if (dto.venue !== undefined) data.venue = dto.venue;
      if (dto.venueAddress !== undefined) data.venueAddress = dto.venueAddress;
      if (dto.venueImageUrl !== undefined)
        data.venueImageUrl = dto.venueImageUrl;

      if (Object.keys(data).length > 0) {
        await tx.tournament.update({ where: { id }, data });
      }

      // 2) GRUPY — APPEND
      if (dto.groupsAppend?.length) {
        for (const g of dto.groupsAppend) {
          const gid = await this.nextGroupIdTx(tx); // nada 'A','B','...','AA',...
          await tx.group.create({
            data: {
              tournamentId: id,
              id: gid,
              name: g.name,
              teamIds: g.teamIds ?? [],
            },
          });
        }
      }

      // 3) GRUPY — UPDATE (po globalnym id)
      if (dto.groupsUpdate?.length) {
        for (const g of dto.groupsUpdate) {
          await tx.group.update({
            where: { id: g.id },
            data: {
              ...(g.name !== undefined ? { name: g.name } : {}),
              ...(g.teamIds !== undefined ? { teamIds: g.teamIds } : {}),
            },
          });
        }
      }

      // 4) GRUPY — DELETE
      if (dto.groupsDelete?.length) {
        await tx.group.deleteMany({
          where: { id: { in: dto.groupsDelete } },
        });
      }

      // 5) STAGE’E — APPEND
      if (dto.stagesAppend?.length) {
        for (const s of dto.stagesAppend) {
          const sid = await this.nextStageIdTx(tx, s.kind as $Enums.StageKind); // nada 'STAGE-GRP-1'/'STAGE-PO-1' itd.
          await tx.stage.create({
            data: {
              tournamentId: id,
              id: sid,
              name: s.name,
              kind: s.kind as $Enums.StageKind,
              order: s.order,
            },
          });
        }
      }

      // 6) STAGE’E — UPDATE (po globalnym id)
      if (dto.stagesUpdate?.length) {
        for (const s of dto.stagesUpdate) {
          await tx.stage.update({
            where: { id: s.id },
            data: {
              ...(s.name !== undefined ? { name: s.name } : {}),
              ...(s.order !== undefined ? { order: s.order } : {}),
            },
          });
        }
      }

      // 7) STAGE’E — DELETE
      if (dto.stagesDelete?.length) {
        await tx.stage.deleteMany({
          where: { id: { in: dto.stagesDelete } },
        });
      }

      // 8) Zwróć aktualny stan
      const t = await tx.tournament.findUnique({
        where: { id },
        include: { groups: true, stages: true },
      });
      return toTournamentDto(t!);
    });
  }

  async delete(id: string) {
    await this.prisma.$transaction([
      this.prisma.group.deleteMany({ where: { tournamentId: id } }),
      this.prisma.stage.deleteMany({ where: { tournamentId: id } }),
      this.prisma.tournament.delete({ where: { id } }),
    ]);
  }
}
