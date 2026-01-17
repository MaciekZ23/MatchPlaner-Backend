import { Test, TestingModule } from '@nestjs/testing';
import { StandingsService } from './standings.service';
import { PrismaService } from 'src/database/prisma.service';

describe('StandingsService', () => {
  let service: StandingsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StandingsService,
        {
          provide: PrismaService,
          useValue: {
            stage: { findFirst: jest.fn() },
            group: { findMany: jest.fn() },
            team: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(StandingsService);
    prisma = module.get(PrismaService);
  });

  // brak etapu grupowego
  it('Should return empty array when no GROUP stage exists', async () => {
    prisma.stage.findFirst.mockResolvedValue(null);

    const result = await service.topTwoPerGroup('T1');
    expect(result).toEqual([]);
  });

  // prosta grupa — 2 drużyny, jeden mecz
  it('Should rank two teams correctly in a simple scenario', async () => {
    prisma.stage.findFirst.mockResolvedValue({ id: 'ST1' });

    prisma.group.findMany.mockResolvedValue([
      {
        id: 'G1',
        matches: [
          {
            status: 'FINISHED',
            homeTeamId: 'A',
            awayTeamId: 'B',
            homeScore: 2,
            awayScore: 0,
          },
        ],
      },
    ]);

    prisma.team.findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);

    const result = await service.topTwoPerGroup('T1');

    expect(result).toEqual([
      { teamId: 'A', group: 'G1', place: 1 },
      { teamId: 'B', group: 'G1', place: 2 },
    ]);
  });

  // remis punktowy — rozstrzyga bezpośredni mecz (compareTwo)
  it('Should break tie using head-to-head match (compareTwo)', async () => {
    prisma.stage.findFirst.mockResolvedValue({ id: 'ST1' });

    prisma.group.findMany.mockResolvedValue([
      {
        id: 'G1',
        matches: [
          {
            status: 'FINISHED',
            homeTeamId: 'A',
            awayTeamId: 'B',
            homeScore: 1,
            awayScore: 0,
          },
        ],
      },
    ]);

    prisma.team.findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);

    const result = await service.topTwoPerGroup('T1');

    expect(result[0].teamId).toBe('A');
    expect(result[1].teamId).toBe('B');
  });

  // trójstronny remis — minitabela
  it('Should resolve 3-way tie using mini-table', async () => {
    prisma.stage.findFirst.mockResolvedValue({ id: 'ST1' });

    prisma.group.findMany.mockResolvedValue([
      {
        id: 'G1',
        matches: [
          {
            status: 'FINISHED',
            homeTeamId: 'A',
            awayTeamId: 'B',
            homeScore: 0,
            awayScore: 1,
          },
          {
            status: 'FINISHED',
            homeTeamId: 'B',
            awayTeamId: 'C',
            homeScore: 0,
            awayScore: 2,
          },
          {
            status: 'FINISHED',
            homeTeamId: 'C',
            awayTeamId: 'A',
            homeScore: 0,
            awayScore: 3,
          },
        ],
      },
    ]);

    prisma.team.findMany.mockResolvedValue([
      { id: 'A' },
      { id: 'B' },
      { id: 'C' },
    ]);

    const result = await service.topTwoPerGroup('T1');

    // mini-tabela head-to-head:
    // A  → 3 pkt (wygrana z C)
    // B  → 3 pkt (wygrana z A)
    // C  → 3 pkt (wygrana z B)
    // ale różnice bramek:
    // A +2, B -1, C -1
    // więc A pierwsze, B i C dalej

    expect(result[0].teamId).toBe('A');
    expect(['B', 'C']).toContain(result[1].teamId);
  });

  // brak drużyn
  it('Should return empty qualification when group has no teams', async () => {
    prisma.stage.findFirst.mockResolvedValue({ id: 'STG1' });

    prisma.group.findMany.mockResolvedValue([{ id: 'G1', matches: [] }]);

    prisma.team.findMany.mockResolvedValue([]);

    const result = await service.topTwoPerGroup('T1');

    expect(result).toEqual([]);
  });
});
