import { Test, TestingModule } from '@nestjs/testing';
import { PlayoffsService } from './playoffs.service';
import { PrismaService } from 'src/database/prisma.service';
import { StandingsService } from './standings.service';
import { BadRequestException } from '@nestjs/common';

describe('PlayoffsService', () => {
  let service: PlayoffsService;
  let prisma: jest.Mocked<PrismaService>;
  let standings: jest.Mocked<StandingsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayoffsService,
        {
          provide: PrismaService,
          useValue: {
            group: {
              findMany: jest.fn(),
            },
            match: {
              count: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              updateMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            matchEvent: {
              deleteMany: jest.fn(),
            },
            stage: {
              findFirst: jest.fn(),
              aggregate: jest.fn(),
              create: jest.fn(),
            },
            $transaction: jest.fn(async (arg: any) => {
              if (typeof arg === 'function') {
                return arg(prisma);
              }
              if (Array.isArray(arg)) {
                return Promise.all(arg);
              }
              return arg;
            }),
          },
        },
        {
          provide: StandingsService,
          useValue: {
            topTwoPerGroup: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PlayoffsService);
    prisma = module.get(PrismaService);
    standings = module.get(StandingsService);
  });

  describe('generateForTournament', () => {
    it('Should throw BadRequestException when tournament has no groups', async () => {
      prisma.group.findMany.mockResolvedValue([]);

      await expect(
        service.generateForTournament('t1', {
          startDate: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should throw BadRequestException when some group matches are not finished', async () => {
      prisma.group.findMany.mockResolvedValue([{ id: 'G1', name: 'A' } as any]);
      prisma.match.count.mockResolvedValue(2);

      await expect(
        service.generateForTournament('t1', {
          startDate: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should throw BadRequestException when not enough qualified teams', async () => {
      prisma.group.findMany.mockResolvedValue([{ id: 'G1', name: 'A' } as any]);
      prisma.match.count.mockResolvedValue(0);
      standings.topTwoPerGroup.mockResolvedValue([
        { teamId: 'T1', group: 'G1', place: 1 },
      ]);

      await expect(
        service.generateForTournament('t1', {
          startDate: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should remove existing playoff matches when clearExisting=true', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'G1', name: 'A' } as any,
        { id: 'G2', name: 'B' } as any,
      ]);
      prisma.match.count.mockResolvedValue(0);

      standings.topTwoPerGroup.mockResolvedValue([
        { teamId: 'T1', group: 'G1', place: 1 },
        { teamId: 'T2', group: 'G1', place: 2 },
        { teamId: 'T3', group: 'G2', place: 1 },
        { teamId: 'T4', group: 'G2', place: 2 },
      ]);

      prisma.stage.findFirst.mockResolvedValue({ id: 'STAGE-PO-1' } as any);

      prisma.match.findMany.mockResolvedValueOnce([{ id: 'M1' } as any]);

      const createTreeSpy = jest
        .spyOn(service as any, 'createBracketTree')
        .mockResolvedValue([{ id: 'M_NEW' }] as any);

      const result = await service.generateForTournament('t1', {
        startDate: '2025-01-01',
        clearExisting: true,
      } as any);

      expect(prisma.matchEvent.deleteMany).toHaveBeenCalled();
      expect(prisma.match.deleteMany).toHaveBeenCalled();
      expect(createTreeSpy).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'M_NEW' }]);
    });

    it('Should generate playoffs successfully (happy path)', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'G1', name: 'A' } as any,
        { id: 'G2', name: 'B' } as any,
      ]);
      prisma.match.count.mockResolvedValue(0);

      standings.topTwoPerGroup.mockResolvedValue([
        { teamId: 'T1', group: 'G1', place: 1 },
        { teamId: 'T2', group: 'G1', place: 2 },
        { teamId: 'T3', group: 'G2', place: 1 },
        { teamId: 'T4', group: 'G2', place: 2 },
      ]);

      prisma.stage.findFirst.mockResolvedValue(null);
      prisma.stage.aggregate.mockResolvedValue({ _max: { order: 3 } } as any);
      prisma.stage.create.mockResolvedValue({
        id: 'STAGE-PO-1',
        kind: 'PLAYOFF',
        order: 4,
        tournamentId: 't1',
      } as any);

      const createTreeSpy = jest
        .spyOn(service as any, 'createBracketTree')
        .mockResolvedValue([{ id: 'M_FINAL' }] as any);

      const res = await service.generateForTournament('t1', {
        startDate: '2025-01-01',
        stageName: 'Playoffs',
        roundInSingleDay: true,
        withThirdPlace: true,
      } as any);

      expect(prisma.stage.create).toHaveBeenCalled();
      expect(createTreeSpy).toHaveBeenCalled();
      expect(Array.isArray(res)).toBe(true);
      expect(res[0].id).toBe('M_FINAL');
    });

    it('Should throw when firstRoundPairs are empty', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'G1', name: 'A' } as any,
        { id: 'G2', name: 'B' } as any,
      ]);
      prisma.match.count.mockResolvedValue(0);

      standings.topTwoPerGroup.mockResolvedValue([
        { teamId: 'T1', group: 'G1', place: 1 },
        { teamId: 'T2', group: 'G1', place: 2 },
      ]);

      prisma.stage.findFirst.mockResolvedValue({ id: 'STAGE-PO-1' } as any);

      await expect(
        service.generateForTournament('t1', {
          startDate: '2025-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('private buildFirstRoundPairs (extra coverage)', () => {
    it('Should throw when number of groups is odd (>1)', () => {
      const fn = (service as any).buildFirstRoundPairs.bind(service);

      expect(() =>
        fn(
          ['G1', 'G2', 'G3'],
          [
            { teamId: 'T1', group: 'G1', place: 1 },
            { teamId: 'T2', group: 'G1', place: 2 },
            { teamId: 'T3', group: 'G2', place: 1 },
            { teamId: 'T4', group: 'G2', place: 2 },
            { teamId: 'T5', group: 'G3', place: 1 },
            { teamId: 'T6', group: 'G3', place: 2 },
          ],
        ),
      ).toThrow(BadRequestException);
    });

    it('Should build pairs for two groups correctly', () => {
      const fn = (service as any).buildFirstRoundPairs.bind(service);

      const pairs = fn(
        ['G1', 'G2'],
        [
          { teamId: 'T1', group: 'G1', place: 1 },
          { teamId: 'T2', group: 'G1', place: 2 },
          { teamId: 'T3', group: 'G2', place: 1 },
          { teamId: 'T4', group: 'G2', place: 2 },
        ],
      );

      expect(pairs).toEqual([
        {
          home: { teamId: 'T1', group: 'G1', place: 1 },
          away: { teamId: 'T4', group: 'G2', place: 2 },
        },
        {
          home: { teamId: 'T3', group: 'G2', place: 1 },
          away: { teamId: 'T2', group: 'G1', place: 2 },
        },
      ]);
    });
  });

  describe('propagateMatchOutcome', () => {
    it('Should do nothing if match not found', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await service.propagateMatchOutcome('M1');

      expect(prisma.match.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('Should reset dependent matches when no winner/loser can be determined', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: 'M1',
        stageId: 'S1',
        status: 'LIVE',
        homeTeamId: 'T1',
        awayTeamId: 'T2',
        homeScore: 1,
        awayScore: 0,
      } as any);

      prisma.match.updateMany.mockResolvedValue({ count: 1 } as any);

      await service.propagateMatchOutcome('M1');

      expect(prisma.match.updateMany).toHaveBeenCalledTimes(4);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('Should propagate winner and loser to next matches when finished', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: 'M1',
        stageId: 'S1',
        status: 'FINISHED',
        homeTeamId: 'T1',
        awayTeamId: 'T2',
        homeScore: 3,
        awayScore: 1,
      } as any);

      prisma.match.updateMany.mockResolvedValue({ count: 1 } as any);

      await service.propagateMatchOutcome('M1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.match.updateMany).toHaveBeenCalledTimes(4);

      expect(prisma.match.updateMany).toHaveBeenNthCalledWith(1, {
        where: { homeSourceRef: 'M1', homeSourceKind: 'WINNER' },
        data: { homeTeamId: 'T1' },
      });
      expect(prisma.match.updateMany).toHaveBeenNthCalledWith(2, {
        where: { awaySourceRef: 'M1', awaySourceKind: 'WINNER' },
        data: { awayTeamId: 'T1' },
      });
      expect(prisma.match.updateMany).toHaveBeenNthCalledWith(3, {
        where: { homeSourceRef: 'M1', homeSourceKind: 'LOSER' },
        data: { homeTeamId: 'T2' },
      });
      expect(prisma.match.updateMany).toHaveBeenNthCalledWith(4, {
        where: { awaySourceRef: 'M1', awaySourceKind: 'LOSER' },
        data: { awayTeamId: 'T2' },
      });
    });
  });
});
