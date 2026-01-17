import { Test, TestingModule } from '@nestjs/testing';
import { VotingService } from './voting.service';
import { PrismaService } from 'src/database/prisma.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('VotingService', () => {
  let service: VotingService;
  let prisma: jest.Mocked<PrismaService>;

  const fixedDate = new Date('2025-01-01T12:00:00Z');
  const matchBase = {
    id: 'M1',
    date: new Date('2025-01-01T10:00:00Z'),
    status: 'FINISHED',
    homeTeamId: 'T1',
    awayTeamId: 'T2',
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(fixedDate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingService,
        {
          provide: PrismaService,
          useValue: {
            match: {
              findUnique: jest.fn(),
            },
            voting: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            player: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            mVPVoteSummary: {
              findMany: jest.fn(),
              upsert: jest.fn(),
            },
            mVPVote: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            $transaction: jest.fn((cb) =>
              cb({
                mVPVote: { create: jest.fn() },
                mVPVoteSummary: { upsert: jest.fn() },
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(VotingService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // GET STATE
  describe('getState', () => {
    it('Should throw if match not found', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(service.getState('X')).rejects.toThrow(NotFoundException);
    });

    it('Should create NOT_STARTED voting when match not finished', async () => {
      prisma.match.findUnique.mockResolvedValue({
        ...matchBase,
        status: 'SCHEDULED',
        events: [],
        homeTeam: {},
        awayTeam: {},
      });

      prisma.voting.findUnique.mockResolvedValue(null);
      prisma.voting.create.mockResolvedValue({
        matchId: 'M1',
        status: 'NOT_STARTED',
      });

      prisma.player.findMany.mockResolvedValue([]);
      prisma.mVPVoteSummary.findMany.mockResolvedValue([]);

      const res = await service.getState('M1');

      expect(prisma.voting.create).toHaveBeenCalledWith({
        data: { matchId: 'M1', status: 'NOT_STARTED' },
      });

      expect(res.status).toBe('NOT_STARTED');
    });

    it('Should create OPEN voting when match FINISHED & deadline not passed', async () => {
      prisma.match.findUnique.mockResolvedValue({
        ...matchBase,
        events: [],
        homeTeam: {},
        awayTeam: {},
      });

      prisma.voting.findUnique.mockResolvedValue(null);
      prisma.voting.create.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
      });

      prisma.player.findMany.mockResolvedValue([]);
      prisma.mVPVoteSummary.findMany.mockResolvedValue([]);

      const res = await service.getState('M1');
      expect(res.status).toBe('OPEN');
    });

    it('Should return hasVoted = true when user already voted', async () => {
      prisma.match.findUnique.mockResolvedValue({
        ...matchBase,
        events: [],
        homeTeam: {},
        awayTeam: {},
      });

      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
        closesAt: new Date(),
      });

      prisma.player.findMany.mockResolvedValue([]);
      prisma.mVPVoteSummary.findMany.mockResolvedValue([]);

      prisma.mVPVote.findUnique.mockResolvedValue({ id: 'vote1' });

      const res = await service.getState('M1', {
        sub: 'U1',
        role: 'USER',
      });

      expect(res.hasVoted).toBe(true);
    });
  });

  // VOTE
  describe('vote', () => {
    const user = { sub: 'U1', role: 'USER' };

    it('Should throw if no user provided', async () => {
      await expect(
        service.vote({ matchId: 'M1', playerId: 'P1' } as any, null as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should throw if voting not initialized', async () => {
      prisma.voting.findUnique.mockResolvedValue(null);

      await expect(
        service.vote({ matchId: 'M1', playerId: 'P1' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should throw if match not found', async () => {
      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
      });
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(
        service.vote({ matchId: 'M1', playerId: 'P1' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should throw if match not finished', async () => {
      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'NOT_STARTED',
      });
      prisma.match.findUnique.mockResolvedValue({
        ...matchBase,
        status: 'SCHEDULED',
      });

      await expect(
        service.vote({ matchId: 'M1', playerId: 'P1' }, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should throw if player not found', async () => {
      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
      });
      prisma.match.findUnique.mockResolvedValue(matchBase);
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(
        service.vote({ matchId: 'M1', playerId: 'PX' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should throw if player not in match teams', async () => {
      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
      });
      prisma.match.findUnique.mockResolvedValue(matchBase);
      prisma.player.findUnique.mockResolvedValue({
        id: 'P1',
        teamId: 'OTHER',
      });

      await expect(
        service.vote({ matchId: 'M1', playerId: 'P1' }, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should register vote successfully', async () => {
      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
      });
      prisma.match.findUnique.mockResolvedValue(matchBase);
      prisma.player.findUnique.mockResolvedValue({
        id: 'P1',
        teamId: 'T1',
      });

      prisma.$transaction.mockImplementation(async (cb) => {
        return cb({
          mVPVote: { create: jest.fn() },
          mVPVoteSummary: { upsert: jest.fn() },
        });
      });

      const res = await service.vote({ matchId: 'M1', playerId: 'P1' }, user);

      expect(res.ok).toBe(true);
      expect(res.playerId).toBe('P1');
    });

    it('Should throw ConflictException on duplicate vote (P2002)', async () => {
      prisma.voting.findUnique.mockResolvedValue({
        matchId: 'M1',
        status: 'OPEN',
      });
      prisma.match.findUnique.mockResolvedValue(matchBase);
      prisma.player.findUnique.mockResolvedValue({
        id: 'P1',
        teamId: 'T1',
      });

      const err = new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: '1',
      });

      prisma.$transaction.mockRejectedValue(err);

      await expect(
        service.vote({ matchId: 'M1', playerId: 'P1' }, user),
      ).rejects.toThrow(ConflictException);
    });
  });

  // SET STATUS
  describe('setStatus', () => {
    it('Should update status', async () => {
      prisma.voting.update.mockResolvedValue({
        matchId: 'M1',
        status: 'CLOSED',
        closedAt: new Date(),
      });

      const res = await service.setStatus('M1', 'CLOSED');
      expect(res.status).toBe('CLOSED');
      expect(prisma.voting.update).toHaveBeenCalled();
    });
  });
});
