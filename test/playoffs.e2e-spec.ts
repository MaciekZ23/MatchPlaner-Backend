import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/database/prisma.service';
import { SanitizePipe } from 'src/common/pipes/sanitize.pipe';

describe('Playoffs E2E (generate + get)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let adminToken: string;
  let tournamentId: string;
  let groupAId: string;
  let groupBId: string;

  let teamA1: string;
  let teamA2: string;
  let teamB1: string;
  let teamB2: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

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
        skipUndefinedProperties: true,
        skipMissingProperties: true,
      }),
    );

    await app.init();

    adminToken = await jwtService.signAsync({
      sub: 'admin-test-id',
      role: 'ADMIN',
      email: 'admin@test.local',
    });

    const tRes = await request(app.getHttpServer())
      .post('/api/v1/tournaments/create-tournament')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Playoffs Test Tournament',
        mode: 'LEAGUE',
        groups: [{ name: 'A' }, { name: 'B' }],
        stages: [{ name: 'Group Stage', kind: 'GROUP', order: 1 }],
      })
      .expect(201);

    tournamentId = tRes.body.id;
    groupAId = tRes.body.groups[0].id;
    groupBId = tRes.body.groups[1].id;

    const A1 = await prisma.team.create({
      data: { name: 'A1', tournamentId, groupId: groupAId },
    });
    const A2 = await prisma.team.create({
      data: { name: 'A2', tournamentId, groupId: groupAId },
    });
    const B1 = await prisma.team.create({
      data: { name: 'B1', tournamentId, groupId: groupBId },
    });
    const B2 = await prisma.team.create({
      data: { name: 'B2', tournamentId, groupId: groupBId },
    });

    teamA1 = A1.id;
    teamA2 = A2.id;
    teamB1 = B1.id;
    teamB2 = B2.id;

    await prisma.match.create({
      data: {
        stageId: tRes.body.stages[0].id,
        groupId: groupAId,
        round: 1,
        index: 1,
        date: new Date(),
        status: 'FINISHED',
        homeTeamId: teamA1,
        awayTeamId: teamA2,
        homeScore: 3,
        awayScore: 1,
      },
    });

    await prisma.match.create({
      data: {
        stageId: tRes.body.stages[0].id,
        groupId: groupBId,
        round: 1,
        index: 2,
        date: new Date(),
        status: 'FINISHED',
        homeTeamId: teamB1,
        awayTeamId: teamB2,
        homeScore: 2,
        awayScore: 0,
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // GENERATE PLAYOFFS
  it('POST /api/v1/playoffs/generate/:id – generuje drabinkę playoff', async () => {
    const dto = {
      startDate: '2025-06-01',
      matchTimes: ['14:00', '16:00'],
      clearExisting: true,
      roundInSingleDay: true,
      withThirdPlace: true,
    };

    const res = await request(app.getHttpServer())
      .post(`/api/v1/playoffs/generate/${tournamentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(dto)
      .expect(201);

    expect(res.body).toHaveProperty('ok', true);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.matches)).toBe(true);
  });

  // GET PLAYOFF BRACKET
  it('GET /api/v1/playoffs/:id – pobiera drabinkę', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/playoffs/${tournamentId}`)
      .expect(200);

    expect(res.body).toHaveProperty('matches');
    expect(Array.isArray(res.body.matches)).toBe(true);
    expect(res.body.matches.length).toBeGreaterThan(0);
  });
});
