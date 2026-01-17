import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from 'src/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TournamentService', () => {
  let service: TournamentsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsService,
        {
          provide: PrismaService,
          useValue: {
            idCounter: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({ value: 2 }),
              create: jest
                .fn()
                .mockResolvedValue({ key: 'tournament', value: 1 }),
            },

            tournament: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]), // FIX #1
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            group: {
              deleteMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
            },
            stage: {
              deleteMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
            },
            match: {
              deleteMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            matchEvent: { deleteMany: jest.fn() },
            player: { deleteMany: jest.fn() },
            team: {
              deleteMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            mVPVote: {
              deleteMany: jest.fn().mockResolvedValue(Promise.resolve()),
            },
            $transaction: jest.fn((fn) => fn(prisma)),
          },
        },
      ],
    }).compile();

    service = module.get<TournamentsService>(TournamentsService);
    prisma = module.get(PrismaService);
  });

  // FIND ONE
  describe('findOne', () => {
    it('Should return tournament DTO when tournament exists', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        name: 'Test Tournament',
        groups: [],
        stages: [],
      });

      const result = await service.findOne('t1');

      expect(result).toEqual({
        id: 't1',
        name: 'Test Tournament',
        groups: [],
        stages: [],
      });
    });

    it('Should throw NotFooundException when tournamnet does not exist', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // FIND ALL
  describe('findAll', () => {
    it('Should return array of tournament DTOs', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        { id: 't1', name: 'A', groups: [], stages: [] },
        { id: 't2', name: 'B', groups: [], stages: [] },
      ]);

      const result = await service.findAll();

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('t1');
      expect(prisma.tournament.findMany).toHaveBeenCalled();
    });
  });

  // CREATE
  describe('create', () => {
    it('Should create a tournament successfully', async () => {
      prisma.tournament.findMany.mockResolvedValue([]);
      prisma.tournament.create.mockResolvedValue({
        id: 't10',
        name: 'Created Tournament',
        groups: [],
        stages: [],
      });

      const dto = { name: 'Created Tournament' };

      const result = await service.create(dto as any);

      expect(result.name).toBe('Created Tournament');
      expect(prisma.tournament.create).toHaveBeenCalled();
    });

    it('Should throw error when Prisma throws error', async () => {
      prisma.tournament.create.mockRejectedValue(new Error('DB error'));

      await expect(service.create({ name: 'X' } as any)).rejects.toThrow(
        'DB error',
      );
    });
  });

  // UPDATE
  describe('update', () => {
    it('Should update tournament when exists', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' });
      prisma.tournament.update.mockResolvedValue({
        id: 't1',
        name: 'Updated',
        groups: [],
        stages: [],
      });

      prisma.tournament.findUnique.mockResolvedValue({
        id: 't1',
        name: 'Updated',
        groups: [],
        stages: [],
      });

      const result = await service.update('t1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(prisma.tournament.update).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when tournament does not exist', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);

      await expect(service.update('unknown', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // DELETE
  describe('delete', () => {
    it('Should delete tournament and related records', async () => {
      prisma.stage.findMany.mockResolvedValue([{ id: 's1' }]);
      prisma.match.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.team.findMany.mockResolvedValue([{ id: 'team1' }]);

      prisma.tournament.delete.mockResolvedValue({ id: 't1' } as any);

      await service.delete('t1');

      expect(prisma.tournament.delete).toHaveBeenCalled();
      expect(prisma.matchEvent.deleteMany).toHaveBeenCalled();
      expect(prisma.match.deleteMany).toHaveBeenCalled();
      expect(prisma.player.deleteMany).toHaveBeenCalled();
      expect(prisma.team.deleteMany).toHaveBeenCalled();
      expect(prisma.stage.deleteMany).toHaveBeenCalled();
    });
  });
});
