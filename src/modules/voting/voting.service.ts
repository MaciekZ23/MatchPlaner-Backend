import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { VoteRequestDto, VoteResponseDto } from './dto/vote.dto';
import { VotingStateDto } from './dto/voting-state.dto';
import { toVotingStateDto } from './mapper';
import * as crypto from 'crypto';

type JwtUser = {
  sub: string;
  role?: 'USER' | 'CAPTAIN' | 'ADMIN' | 'GUEST';
  deviceId?: string;
};

const VOTING_WINDOW_HOURS = 48;

@Injectable()
export class VotingService {
  constructor(private prisma: PrismaService) {}

  async getState(matchId: string, user?: JwtUser): Promise<VotingStateDto> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        events: true,
        homeTeam: true,
        awayTeam: true,
      },
    });
    if (!match) {
      throw new NotFoundException('Mecz nie znaleziony');
    }

    // Utworzenie meta głosowania
    const voteDeadline = addHours(match.date, VOTING_WINDOW_HOURS);
    let voting = await this.prisma.voting.findUnique({ where: { matchId } });
    const now = new Date();
    if (!voting) {
      if (match.status === 'FINISHED') {
        if (now >= voteDeadline) {
          voting = await this.prisma.voting.create({
            data: {
              matchId,
              status: 'CLOSED',
              closeType: 'ABSOLUTE_DEADLINE',
              closedAt: voteDeadline,
              closesAt: voteDeadline,
            },
          });
        } else {
          voting = await this.prisma.voting.create({
            data: {
              matchId,
              status: 'OPEN',
              closeType: 'ABSOLUTE_DEADLINE',
              closesAt: voteDeadline,
            },
          });
        }
      } else {
        voting = await this.prisma.voting.create({
          data: {
            matchId,
            status: 'NOT_STARTED',
          },
        });
      }
    } else {
      if (match.status === 'FINISHED') {
        if (now >= voteDeadline) {
          if (voting.status !== 'CLOSED') {
            voting = await this.prisma.voting.update({
              where: { matchId },
              data: {
                status: 'CLOSED',
                closeType: 'ABSOLUTE_DEADLINE',
                closesAt: voting.closesAt ?? voteDeadline,
                closedAt: voting.closedAt ?? voteDeadline,
              },
            });
          }
        } else {
          if (voting.status !== 'OPEN') {
            voting = await this.prisma.voting.update({
              where: { matchId },
              data: {
                status: 'OPEN',
                closeType: 'ABSOLUTE_DEADLINE',
                closesAt: voting.closesAt ?? voteDeadline,
                closedAt: null,
              },
            });
          } else if (!voting.closesAt) {
            voting = await this.prisma.voting.update({
              where: { matchId },
              data: {
                closesAt: voteDeadline,
                closeType: 'ABSOLUTE_DEADLINE',
              },
            });
          }
        }
      } else {
        if (voting.status !== 'NOT_STARTED') {
          voting = await this.prisma.voting.update({
            where: { matchId },
            data: {
              status: 'NOT_STARTED',
              closesAt: null,
              closedAt: null,
              closeType: null,
            },
          });
        }
      }
    }

    // Kandydaci do głosowania
    const players = await this.prisma.player.findMany({
      where: { team: { id: { in: [match.homeTeamId, match.awayTeamId] } } },
      select: {
        id: true,
        teamId: true,
        name: true,
        position: true,
        healthStatus: true,
        shirtNumber: true,
      },
    });

    // Podsumowanie
    const summaries = await this.prisma.mVPVoteSummary.findMany({
      where: { matchId },
      select: { playerId: true, votes: true },
      orderBy: { votes: 'desc' },
    });

    let hasVoted = false;
    if (user) {
      const voter = resolveVoter(user);
      const existing = await this.prisma.mVPVote.findUnique({
        where: {
          matchId_voterHash: { matchId, voterHash: voter.hash },
        },
      });
      hasVoted = !!existing;
    }

    return toVotingStateDto({
      match,
      players,
      summary: summaries,
      voting,
      hasVoted,
    });
  }

  async vote(req: VoteRequestDto, user: JwtUser): Promise<VoteResponseDto> {
    if (!user) {
      throw new BadRequestException('Authentication required');
    }

    const { matchId, playerId } = req;

    const voting = await this.prisma.voting.findUnique({ where: { matchId } });
    if (!voting) {
      throw new NotFoundException('Voting not initialized');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const now = new Date();
    const voteDeadline = addHours(match.date, VOTING_WINDOW_HOURS);
    if (match.status !== 'FINISHED') {
      throw new BadRequestException('Voting is not open for this match');
    }

    if (now >= voteDeadline) {
      if (voting.status !== 'CLOSED') {
        await this.prisma.voting.update({
          where: { matchId },
          data: {
            status: 'CLOSED',
            closeType: 'ABSOLUTE_DEADLINE',
            closesAt: voting.closesAt ?? voteDeadline,
            closedAt: voting.closedAt ?? voteDeadline,
          },
        });
      }
      throw new BadRequestException('Voting is closed');
    }

    if (voting.status !== 'OPEN') {
      await this.prisma.voting.update({
        where: { matchId },
        data: {
          status: 'OPEN',
          closeType: 'ABSOLUTE_DEADLINE',
          closesAt: voting.closesAt ?? voteDeadline,
          closedAt: null,
        },
      });
    }

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) {
      throw new NotFoundException('Player not found');
    }
    if (![match.homeTeamId, match.awayTeamId].includes(player.teamId)) {
      throw new BadRequestException('Player does not belong to this match');
    }

    const voter = resolveVoter(user);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.mVPVote.create({
          data: {
            matchId,
            playerId,
            voterHash: voter.hash,
            voterType: voter.type,
          },
        });

        await tx.mVPVoteSummary.upsert({
          where: { matchId_playerId: { matchId, playerId } },
          update: { votes: { increment: 1 } },
          create: { matchId, playerId, votes: 1 },
        });
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Juz zagłosowane
        throw new ConflictException('You have already voted for this match');
      }
      throw e;
    }
    return { ok: true, matchId, playerId };
  }

  async setStatus(matchId: string, status: 'NOT_STARTED' | 'OPEN' | 'CLOSED') {
    return this.prisma.voting.update({
      where: { matchId },
      data: {
        status,
        closedAt: status === 'CLOSED' ? new Date() : null,
      },
      select: { matchId: true, status: true, closedAt: true },
    });
  }
}

function resolveVoter(user: any): { type: 'USER' | 'GUEST'; hash: string } {
  if (user.role && user.role !== 'GUEST') {
    const hash = sha256(`U:${user.sub}`);
    return { type: 'USER', hash };
  }
  const guestId = user.sub;
  const deviceId = user.deviceId;
  if (!deviceId) {
    throw new BadRequestException('Guest deviceId missing in token');
  }
  const hash = sha256(`G:${guestId}|${deviceId}`);
  return { type: 'GUEST', hash };
}

function sha256(x: string) {
  return crypto.createHash('sha256').update(x).digest('hex');
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3600 * 1000);
}
