import { Test, TestingModule } from '@nestjs/testing';
import { MatchesService } from './matches.service';
import { PrismaService } from 'src/database/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlayoffsService } from '../playoffs/playoffs.service';

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: jest.Mocked<PrismaService>;
  let playoffs: jest.Mocked<PlayoffsService>;

  let txIdCounterFindUnique: jest.Mock;
  let txIdCounterUpdate: jest.Mock;
  let txIdCounterCreate: jest.Mock;

  let txMatchFindMany: jest.Mock;
  let txMatchCreate: jest.Mock;
  let txMatchUpdate: jest.Mock;
  let txMatchFindUnique: jest.Mock;

  let txMatchEventCreateMany: jest.Mock;
  let txMatchEventUpdate: jest.Mock;
  let txMatchEventDeleteMany: jest.Mock;

  beforeEach(async () => {
    txIdCounterFindUnique = jest.fn();
    txIdCounterUpdate = jest.fn();
    txIdCounterCreate = jest.fn();

    txMatchFindMany = jest.fn();
    txMatchCreate = jest.fn();
    txMatchUpdate = jest.fn();
    txMatchFindUnique = jest.fn();

    txMatchEventCreateMany = jest.fn();
    txMatchEventUpdate = jest.fn();
    txMatchEventDeleteMany = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        {
          provide: PrismaService,
          useValue: {
            idCounter: {
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            stage: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
            },
            tournament: {
              findUnique: jest.fn(),
            },
            group: {
              findMany: jest.fn(),
            },
            team: {
              findMany: jest.fn(),
            },
            match: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            matchEvent: {
              createMany: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },

            $transaction: jest.fn((arg: any) => {
              if (typeof arg === 'function') {
                const tx = {
                  idCounter: {
                    findUnique: txIdCounterFindUnique,
                    update: txIdCounterUpdate,
                    create: txIdCounterCreate,
                  },
                  match: {
                    findMany: txMatchFindMany,
                    create: txMatchCreate,
                    update: txMatchUpdate,
                    findUnique: txMatchFindUnique,
                  },
                  matchEvent: {
                    createMany: txMatchEventCreateMany,
                    update: txMatchEventUpdate,
                    deleteMany: txMatchEventDeleteMany,
                  },
                };
                return arg(tx);
              }
              if (Array.isArray(arg)) {
                return Promise.resolve();
              }
              return Promise.resolve();
            }),
          },
        },
        {
          provide: PlayoffsService,
          useValue: {
            propagateMatchOutcome: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
    prisma = module.get(PrismaService);
    playoffs = module.get(PlayoffsService);
  });

  const makeMatch = (over: Partial<any> = {}) => ({
    id: 'M1',
    stageId: 'STAGE-GRP-1',
    groupId: null,
    round: null,
    index: null,
    date: new Date('2025-01-01T10:00:00'),
    status: 'SCHEDULED',
    homeTeamId: null,
    awayTeamId: null,
    homeSourceKind: null,
    homeSourceRef: null,
    awaySourceKind: null,
    awaySourceRef: null,
    homeScore: null,
    awayScore: null,
    homeGKIds: [],
    awayGKIds: [],
    events: [],
    ...over,
  });

  // listByStage
  describe('listByStage', () => {
    it('Should return matches list when stage exists', async () => {
      prisma.stage.findUnique.mockResolvedValue({ id: 'STAGE-GRP-1' } as any);
      prisma.match.findMany.mockResolvedValue([
        makeMatch({ id: 'M1' }),
        makeMatch({ id: 'M2' }),
      ] as any);

      const res = await service.listByStage('STAGE-GRP-1');

      expect(res).toHaveLength(2);
      expect(res[0].id).toBe('M1');
      expect(prisma.match.findMany).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when stage missing', async () => {
      prisma.stage.findUnique.mockResolvedValue(null);

      await expect(service.listByStage('X')).rejects.toThrow(NotFoundException);
    });
  });

  // create
  describe('create', () => {
    it('Should create match successfully (with events)', async () => {
      prisma.stage.findUnique.mockResolvedValue({ id: 'STAGE-GRP-1' } as any);

      txIdCounterFindUnique.mockResolvedValue(null);
      txMatchFindMany.mockResolvedValue([]);
      txIdCounterCreate.mockResolvedValue({ value: 1 });

      const created = makeMatch({ id: 'M1' });
      txMatchCreate.mockResolvedValue(created);
      txMatchFindUnique.mockResolvedValue(created);

      const dto: any = {
        stageId: 'STAGE-GRP-1',
        date: '2025-01-01T10:00:00',
        events: [{ minute: 10, type: 'GOAL', playerId: 'P1', teamId: 'T1' }],
      };

      const res = await service.create(dto);

      expect(res.id).toBe('M1');
      expect(txMatchCreate).toHaveBeenCalled();
      expect(txMatchEventCreateMany).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when stage missing', async () => {
      prisma.stage.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ stageId: 'BAD', date: '2025-01-01T10:00:00' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // update
  describe('update', () => {
    it('Should update match and call playoffs propagation', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: 'M1' } as any);
      prisma.stage.findUnique.mockResolvedValue({ id: 'STAGE-GRP-1' } as any);

      const updated = makeMatch({ id: 'M1', status: 'FINISHED' });
      txMatchUpdate.mockResolvedValue(updated);
      txMatchFindUnique.mockResolvedValue(updated);

      playoffs.propagateMatchOutcome.mockResolvedValue(undefined);

      const res = await service.update('M1', {
        status: 'FINISHED',
        score: { home: 2, away: 1 },
      } as any);

      expect(res.status).toBe('FINISHED');
      expect(txMatchUpdate).toHaveBeenCalled();
      expect(playoffs.propagateMatchOutcome).toHaveBeenCalledWith('M1');
    });

    it('Should throw NotFoundException when match missing', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(
        service.update('BAD', { status: 'LIVE' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // deleteOne
  describe('deleteOne', () => {
    it('Should delete match and its events', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: 'M1' } as any);

      await service.deleteOne('M1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.matchEvent.deleteMany).toHaveBeenCalledWith({
        where: { matchId: 'M1' },
      });
      expect(prisma.match.delete).toHaveBeenCalledWith({
        where: { id: 'M1' },
      });
    });

    it('Should throw NotFoundException when match missing', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(service.deleteOne('BAD')).rejects.toThrow(NotFoundException);
    });
  });

  // deleteAllByStage
  describe('deleteAllByStage', () => {
    it('Should delete all matches by stage and return count', async () => {
      prisma.stage.findUnique.mockResolvedValue({ id: 'STAGE-GRP-1' } as any);
      prisma.match.findMany.mockResolvedValue([
        { id: 'M1' },
        { id: 'M2' },
      ] as any);

      const res = await service.deleteAllByStage('STAGE-GRP-1');

      expect(res.count).toBe(2);
      expect(prisma.match.deleteMany).toHaveBeenCalled();
      expect(prisma.matchEvent.deleteMany).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when stage missing', async () => {
      prisma.stage.findUnique.mockResolvedValue(null);

      await expect(service.deleteAllByStage('BAD')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // deleteAllByTournament
  describe('deleteAllByTournament', () => {
    it('Should delete all matches by tournament and return count', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' } as any);
      prisma.stage.findMany.mockResolvedValue([
        { id: 'S1' },
        { id: 'S2' },
      ] as any);

      prisma.match.findMany.mockResolvedValue([
        { id: 'M1' },
        { id: 'M2' },
        { id: 'M3' },
      ] as any);

      const res = await service.deleteAllByTournament('t1');

      expect(res.count).toBe(3);
      expect(prisma.matchEvent.deleteMany).toHaveBeenCalled();
      expect(prisma.match.deleteMany).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when tournament missing', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);

      await expect(service.deleteAllByTournament('BAD')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // generateRoundRobin
  describe('generateRoundRobin', () => {
    it('Should return {created:0} when no groups', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' } as any);
      prisma.stage.findFirst.mockResolvedValue({ id: 'STAGE-GRP-1' } as any);
      prisma.group.findMany.mockResolvedValue([]);

      const res = await service.generateRoundRobin('t1', {
        startDate: '2025-01-01',
      } as any);

      expect(res.created).toBe(0);
    });

    it('Should throw BadRequestException when team is in two groups', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' } as any);
      prisma.stage.findFirst.mockResolvedValue({ id: 'STAGE-GRP-1' } as any);
      prisma.group.findMany.mockResolvedValue([
        { id: 'G1', tournamentId: 't1' },
        { id: 'G2', tournamentId: 't1' },
      ] as any);

      prisma.team.findMany
        .mockResolvedValueOnce([{ id: 'T1' }] as any)
        .mockResolvedValueOnce([{ id: 'T1' }] as any);

      await expect(
        service.generateRoundRobin('t1', { startDate: '2025-01-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should generate matches and return created count', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' } as any);
      prisma.stage.findFirst.mockResolvedValue({
        id: 'STAGE-GRP-1',
        kind: 'GROUP',
      } as any);
      prisma.group.findMany.mockResolvedValue([
        { id: 'G1', tournamentId: 't1' },
      ] as any);

      prisma.team.findMany.mockResolvedValue([
        { id: 'T1' },
        { id: 'T2' },
      ] as any);

      let matchCounter = 0;
      txIdCounterFindUnique.mockResolvedValue({ key: 'match', value: 0 });
      txIdCounterUpdate.mockImplementation(async () => {
        matchCounter += 1;
        return { value: matchCounter };
      });
      txMatchFindMany.mockResolvedValue([]);
      txMatchCreate.mockResolvedValue(makeMatch({ id: 'M1' }));

      const res = await service.generateRoundRobin('t1', {
        startDate: '2025-01-01',
        roundInSingleDay: true,
      } as any);

      expect(res.created).toBe(1);
      expect(txMatchCreate).toHaveBeenCalled();
    });
  });
});
