import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { JwtService } from '@nestjs/jwt';
import { SanitizePipe } from 'src/common/pipes/sanitize.pipe';
import { PrismaService } from 'src/database/prisma.service';

describe('Matches E2E (create match + generate round-robin)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let adminToken: string;
  let tournamentId: string;
  let stageId: string;
  let groupId: string;

  let team1Id: string;
  let team2Id: string;
  let team3Id: string;
  let team4Id: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);

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

    jwtService = moduleFixture.get(JwtService);

    adminToken = await jwtService.signAsync({
      sub: 'admin-test-id',
      role: 'ADMIN',
      email: 'admin@test.local',
      kind: 'USER',
    });

    const createTournament = await request(app.getHttpServer())
      .post('/api/v1/tournaments/create-tournament')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Tournament',
        mode: 'LEAGUE',
        groups: [{ name: 'Grupa Testowa' }],
        stages: [{ name: 'Group Stage', kind: 'GROUP', order: 1 }],
      })
      .expect(201);

    tournamentId = createTournament.body.id;
    groupId = createTournament.body.groups[0].id;
    stageId = createTournament.body.stages[0].id;

    const t1 = await prisma.team.create({
      data: { name: 'Drużyna 1', tournamentId, groupId },
    });
    const t2 = await prisma.team.create({
      data: { name: 'Drużyna 2', tournamentId, groupId },
    });
    const t3 = await prisma.team.create({
      data: { name: 'Drużyna 3', tournamentId, groupId },
    });
    const t4 = await prisma.team.create({
      data: { name: 'Drużyna 4', tournamentId, groupId },
    });

    team1Id = t1.id;
    team2Id = t2.id;
    team3Id = t3.id;
    team4Id = t4.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // CREATE MATCH
  it('POST /api/v1/matches/create-match - tworzy mecz', async () => {
    const payload = {
      stageId,
      groupId,
      round: 1,
      index: 1,
      date: '2025-01-01T12:00:00.000Z',
      homeTeamId: 'T1',
      awayTeamId: 'T2',
      status: 'SCHEDULED',
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/matches/create-match')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.stageId).toBe(stageId);
    expect(res.body.groupId).toBe(groupId);
    expect(res.body.round).toBe(1);
  });

  // GENERATE ROUND ROBIN
  it('POST /api/v1/matches/generate-round-robin/:tournamentId - generuje mecze', async () => {
    const dto = {
      startDate: '2025-05-01',
      matchTimes: ['10:00', '12:00'],
      clearExisting: true,
      shuffleTeams: false,
      doubleRound: false,
      roundInSingleDay: true,
    };

    const res = await request(app.getHttpServer())
      .post(`/api/v1/matches/generate-round-robin/${tournamentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(dto)
      .expect(201);

    expect(res.body).toHaveProperty('created');
    expect(res.body.created).toBe(6);
  });

  // VERIFY MATCHES WERE GENERATED
  it('GET /api/v1/matches/stage/:stageId - pobiera wygenerowane mecze', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/matches/stage/${stageId}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(6);

    for (const m of res.body) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('homeTeamId');
      expect(m).toHaveProperty('awayTeamId');
      expect(m.round).toBeGreaterThanOrEqual(1);
    }
  });
});
