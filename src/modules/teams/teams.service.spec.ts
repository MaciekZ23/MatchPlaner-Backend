import { Test, TestingModule } from '@nestjs/testing';
import { TeamsService } from './teams.service';
import { PrismaService } from 'src/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: jest.Mocked<PrismaService>;

  let txPlayerDeleteMany: jest.Mock;
  let txTeamDelete: jest.Mock;

  beforeEach(async () => {
    txPlayerDeleteMany = jest.fn();
    txTeamDelete = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: PrismaService,
          useValue: {
            idCounter: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({ value: 2 }),
              create: jest.fn().mockResolvedValue({ key: 'team', value: 1 }),
            },
            tournament: {
              findUnique: jest.fn(),
            },
            team: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            player: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            group: {
              findUnique: jest.fn(),
            },
            match: { findMany: jest.fn(), deleteMany: jest.fn() },
            matchEvent: { deleteMany: jest.fn() },
            mVPVote: { deleteMany: jest.fn().mockResolvedValue({}) },
            $transaction: jest.fn((fn) =>
              fn({
                idCounter: prisma.idCounter,
                team: { ...prisma.team, delete: txTeamDelete },
                player: { ...prisma.player, deleteMany: txPlayerDeleteMany },
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    prisma = module.get(PrismaService);
  });

  // listByTournament
  describe('listByTournament', () => {
    it('Should return list of teams for tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' });

      prisma.team.findMany.mockResolvedValue([
        { id: 'T1', name: 'Team A', groupId: null, logo: null, players: [] },
      ]);

      const result = await service.listByTournament('t1');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('T1');
      expect(prisma.team.findMany).toHaveBeenCalled();
    });

    it('Should throw NotFoundException if tournament does not exist', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);

      await expect(service.listByTournament('broken')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // getPlayersByTournament
  describe('getPlayersByTournament', () => {
    it('Should return players array', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' });

      prisma.player.findMany.mockResolvedValue([
        {
          id: 'P1',
          teamId: 'T1',
          name: 'John',
          position: 'MID',
          shirtNumber: 8,
          healthStatus: 'HEALTHY',
        },
      ]);

      const result = await service.getPlayersByTournament('t1');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('P1');
    });

    it('Should throw NotFoundException when tournament missing', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);

      await expect(service.getPlayersByTournament('x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // createForTournament
  describe('createForTournament', () => {
    it('Should create team in tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue({ id: 't1' });

      prisma.team.create.mockResolvedValue({
        id: 'T1',
        name: 'Team A',
        logo: null,
        groupId: null,
        players: [],
      });

      const dto = { name: 'Team A' };

      const result = await service.createForTournament('t1', dto);

      expect(result.id).toBe('T1');
      expect(prisma.team.create).toHaveBeenCalled();
    });

    it('Should throw NotFoundException if tournament not exists', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);

      await expect(
        service.createForTournament('bad', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // createPlayer
  describe('createPlayer', () => {
    it('Should create player for team', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'T1' });

      prisma.player.create.mockResolvedValue({
        id: 'P1',
        teamId: 'T1',
        name: 'Player A',
        position: 'MID',
        shirtNumber: null,
        healthStatus: 'HEALTHY',
      });

      const dto = {
        name: 'Player A',
        position: 'MID',
        healthStatus: 'HEALTHY',
      };

      const result = await service.createPlayer('T1', dto as any);

      expect(result.id).toBe('P1');
      expect(prisma.player.create).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when team missing', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(
        service.createPlayer('bad', {
          name: 'A',
          position: 'MID',
          healthStatus: 'HEALTHY',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // updateTeam
  describe('updateTeam', () => {
    it('Should update existing team', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'T1',
        players: [],
      });

      prisma.team.update.mockResolvedValue({
        id: 'T1',
        name: 'Updated',
        logo: null,
        groupId: null,
        players: [],
      });

      const result = await service.updateTeam('T1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });

    it('Should throw if team missing', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(service.updateTeam('bad', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Should throw if group does not exist', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'T1', players: [] });

      prisma.group.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeam('T1', { groupId: 'G123' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // deleteTeam
  describe('deleteTeam', () => {
    it('Should delete team and players', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'T1' });

      txTeamDelete.mockResolvedValue({ id: 'T1' });

      await service.deleteTeam('T1');

      expect(txPlayerDeleteMany).toHaveBeenCalled();
      expect(txTeamDelete).toHaveBeenCalled();
    });

    it('Should throw when team missing', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(service.deleteTeam('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // updatePlayer
  describe('updatePlayer', () => {
    it('Should update player', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'P1' });

      prisma.player.update.mockResolvedValue({
        id: 'P1',
        teamId: 'T1',
        name: 'Updated',
        position: 'MID',
        shirtNumber: 10,
        healthStatus: 'HEALTHY',
      });

      const result = await service.updatePlayer('P1', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('Should throw if player not found', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(service.updatePlayer('bad', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // deletePlayer
  describe('deletePlayer', () => {
    it('Should delete player', async () => {
      prisma.player.findUnique.mockResolvedValue({ id: 'P1' });

      await service.deletePlayer('P1');

      expect(prisma.player.delete).toHaveBeenCalled();
    });

    it('Should throw when missing', async () => {
      prisma.player.findUnique.mockResolvedValue(null);

      await expect(service.deletePlayer('bad')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
