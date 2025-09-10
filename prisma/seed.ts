import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const STAGE_GRP = 'STAGE-GRP-1';

  await prisma.$transaction(async (tx) => {
    await tx.group.deleteMany({ where: { tournamentId: 't1' } });
    await tx.stage.deleteMany({ where: { tournamentId: 't1' } });

    await tx.tournament.upsert({
      where: { id: 't1' },
      update: {
        name: 'Trawiasta Liga Piłki Nożnej Warszawa 2026',
        mode: 'LEAGUE_PLAYOFFS',
        description:
          'Trawiasta Liga Piłki Nożnej Warszawa to coroczne wydarzenie sportowe, które gromadzi drużyny z całego regionu. Edycja 2026 zapowiada się wyjątkowo emocjonująco – ponad 20 zespołów, setki kibiców i pasja, która napędza każdą akcję na boisku.',
        additionalInfo:
          'Wyniki, strzelcy bramek oraz szczegóły meczów będą uzupełniane na bieżąco po zakończeniu każdego meczu. Do zobaczenia na stadionie!',
        season: 'Edycja 2026',
        startDate: new Date('2026-01-17T12:00:00Z'),
        endDate: new Date('2026-01-31T20:30:00Z'),
        timezone: 'Europe/Warsaw',
        venue: 'PGE Narodowy',
        venueAddress: 'al. Księcia Józefa Poniatowskiego 1, 03-901 Warszawa',
        venueImageUrl: 'assets/MIEJSCA/PGE-NARODOWY-WARSZAWA.png',
        groups: {
          create: [
            { id: 'A', name: 'Grupa A', teamIds: ['T1', 'T2', 'T3', 'T4'] },
            { id: 'B', name: 'Grupa B', teamIds: ['T5', 'T6', 'T7', 'T8'] },
            { id: 'C', name: 'Grupa C', teamIds: ['T9', 'T10', 'T11', 'T12'] },
            { id: 'D', name: 'Grupa D', teamIds: ['T13', 'T14', 'T15', 'T16'] },
          ],
        },
        stages: {
          create: [
            { id: STAGE_GRP, name: 'Faza grupowa', kind: 'GROUP', order: 1 },
            { id: 'STAGE-PO-1', name: 'Play-off', kind: 'PLAYOFF', order: 2 },
          ],
        },
      },
      create: {
        id: 't1',
        name: 'Trawiasta Liga Piłki Nożnej Warszawa 2026',
        mode: 'LEAGUE_PLAYOFFS',
        description:
          'Trawiasta Liga Piłki Nożnej Warszawa to coroczne wydarzenie sportowe, które gromadzi drużyny z całego regionu. Edycja 2026 zapowiada się wyjątkowo emocjonująco – ponad 20 zespołów, setki kibiców i pasja, która napędza każdą akcję na boisku.',
        additionalInfo:
          'Wyniki, strzelcy bramek oraz szczegóły meczów będą uzupełniane na bieżąco po zakończeniu każdego meczu. Do zobaczenia na stadionie!',
        season: 'Edycja 2026',
        startDate: new Date('2026-01-17T12:00:00Z'),
        endDate: new Date('2026-01-31T20:30:00Z'),
        timezone: 'Europe/Warsaw',
        venue: 'PGE Narodowy',
        venueAddress: 'al. Księcia Józefa Poniatowskiego 1, 03-901 Warszawa',
        venueImageUrl: 'assets/MIEJSCA/PGE-NARODOWY-WARSZAWA.png',
        groups: {
          create: [
            { id: 'A', name: 'Grupa A', teamIds: ['T1', 'T2', 'T3', 'T4'] },
            { id: 'B', name: 'Grupa B', teamIds: ['T5', 'T6', 'T7', 'T8'] },
            { id: 'C', name: 'Grupa C', teamIds: ['T9', 'T10', 'T11', 'T12'] },
            { id: 'D', name: 'Grupa D', teamIds: ['T13', 'T14', 'T15', 'T16'] },
          ],
        },
        stages: {
          create: [
            { id: STAGE_GRP, name: 'Faza grupowa', kind: 'GROUP', order: 1 },
            { id: 'STAGE-PO-1', name: 'Play-off', kind: 'PLAYOFF', order: 2 },
          ],
        },
      },
    });
  });
}

main().finally(() => prisma.$disconnect());
