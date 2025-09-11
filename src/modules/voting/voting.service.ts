import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { VoteRequestDto, VoteResponseDto } from './dto/vote.dto';
import { VotingStateDto } from './dto/voting-state.dto';
import { toVotingStateDto } from './mapper';

@Injectable()
export class VotingService {
  constructor(private prisma: PrismaService) {}

  async getState(matchId: string): Promise<VotingStateDto> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        events: true,
        homeTeam: true,
        awayTeam: true,
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    // Voting meta (tworzymy w locie jeśli brak)
    let voting = await this.prisma.voting.findUnique({ where: { matchId } });
    if (!voting) {
      voting = await this.prisma.voting.create({
        data: {
          matchId,
          status: 'OPEN',
        },
      });
    }

    // Kandydaci = wszyscy HEALTHY z obu drużyn
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
    });

    return toVotingStateDto({
      match,
      players,
      summary: summaries,
      voting,
    });
  }

  async vote(req: VoteRequestDto): Promise<VoteResponseDto> {
    const { matchId, playerId } = req;

    const voting = await this.prisma.voting.findUnique({ where: { matchId } });
    if (!voting) throw new NotFoundException('Voting not initialized');
    if (voting.status !== 'OPEN')
      throw new BadRequestException('Voting is closed');

    // (opcjonalnie) sprawdź czy player należy do jednego z teamów z meczu
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) throw new NotFoundException('Match not found');
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) throw new NotFoundException('Player not found');
    if (![match.homeTeamId, match.awayTeamId].includes(player.teamId)) {
      throw new BadRequestException('Player does not belong to this match');
    }

    await this.prisma.$transaction(async (tx) => {
      // upsert summary row, increment votes atomowo
      await tx.mVPVoteSummary.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        update: { votes: { increment: 1 } },
        create: { matchId, playerId, votes: 1 },
      });
    });

    return { ok: true, matchId, playerId };
  }

  // proste API do zmiany statusu (np. CRON zamknie po czasie)
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
