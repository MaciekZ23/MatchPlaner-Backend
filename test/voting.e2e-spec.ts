import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { SanitizePipe } from 'src/common/pipes/sanitize.pipe';

describe('Voting E2E (state + voting)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let adminToken: string;
  let matchId: string;
  let playerId: string;
  let homeTeamId: string;
  let awayTeamId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);

    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    app.useGlobalPipes(
      new SanitizePipe(),
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    adminToken = await jwtService.signAsync({
      sub: 'admin-test',
      role: 'ADMIN',
      email: 'admin@test.local',
    });

    const tRes = await request(app.getHttpServer())
      .post('/api/v1/tournaments/create-tournament')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Voting Test Tournament',
        mode: 'LEAGUE',
        groups: [{ name: 'A' }],
        stages: [{ name: 'Stage', kind: 'GROUP', order: 1 }],
      })
      .expect(201);

    const tournamentId = tRes.body.id;
    const groupId = tRes.body.groups[0].id;
    const stageId = tRes.body.stages[0].id;

    const home = await prisma.team.create({
      data: { name: 'Home', tournamentId, groupId },
    });
    const away = await prisma.team.create({
      data: { name: 'Away', tournamentId, groupId },
    });

    homeTeamId = home.id;
    awayTeamId = away.id;

    const player = await prisma.player.create({
      data: {
        name: 'Test Player',
        teamId: homeTeamId,
        position: 'MID',
        healthStatus: 'HEALTHY',
        shirtNumber: 8,
      },
    });
    playerId = player.id;

    const match = await prisma.match.create({
      data: {
        stageId,
        groupId,
        round: 1,
        index: 1,
        status: 'FINISHED',
        date: new Date(Date.now() - 1000 * 60 * 60),
        homeTeamId,
        awayTeamId,
        homeScore: 2,
        awayScore: 1,
      },
    });

    matchId = match.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // GET VOTING STATE
  it('GET /api/v1/voting/:matchId – zwraca stan głosowania', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/voting/${matchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.matchId).toBe(matchId);
    expect(res.body.status).toBe('OPEN');
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates.length).toBe(1);
    expect(res.body.summary.length).toBe(0);
  });

  // POST VOTE
  it('POST /api/v1/voting/vote/:matchId – oddaje głos', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/voting/vote/${matchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId })
      .expect(201);

    expect(res.body).toEqual({
      ok: true,
      matchId,
      playerId,
    });
  });

  // GET STATE AFTER VOTING
  it('GET /api/v1/voting/:matchId – pokazuje 1 głos po oddaniu', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/voting/${matchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.hasVoted).toBe(true);
    expect(res.body.summary.length).toBe(1);
    expect(res.body.summary[0]).toEqual({
      playerId,
      votes: 1,
    });
  });

  // AGAIN VOTING
  it('POST vote – drugi raz to Conflict', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/voting/vote/${matchId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ playerId })
      .expect(409);
  });
});
