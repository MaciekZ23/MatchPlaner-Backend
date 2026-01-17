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

describe('Teams E2E (add team + add player)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let adminToken: string;
  let tournamentId: string;
  let createdTeamId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);

    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

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

    const tournamentRes = await request(app.getHttpServer())
      .post('/api/v1/tournaments/create-tournament')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Teams Test Tournament',
        mode: 'LEAGUE',
        groups: [{ name: 'G1' }],
        stages: [{ name: 'Group Stage', kind: 'GROUP', order: 1 }],
      })
      .expect(201);

    tournamentId = tournamentRes.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ADD TEAM
  it('POST /api/v1/teams/tournament/:id/add-team – dodaje drużynę', async () => {
    const payload = {
      name: 'Drużyna Testowa',
      logo: null,
      groupId: null,
    };

    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/tournament/${tournamentId}/add-team`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(payload.name);

    createdTeamId = res.body.id;
  });

  // ADD PLAYER
  it('POST /api/v1/teams/tournament/:teamId/add-player – dodaje zawodnika', async () => {
    const payload = {
      name: 'Zawodnik Testowy',
      position: 'MID',
      shirtNumber: 10,
      healthStatus: 'HEALTHY',
    };

    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/tournament/${createdTeamId}/add-player`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.teamId).toBe(createdTeamId);
    expect(res.body.name).toBe(payload.name);
  });

  // VERIFY TEAM EXISTS
  it('GET /api/v1/teams/tournament/:id – pobiera drużyny turnieju', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/teams/tournament/${tournamentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(createdTeamId);
  });

  // VERIFY PLAYER EXISTS
  it('GET /api/v1/teams/tournament/:id/players – pobiera zawodników turnieju', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/teams/tournament/${tournamentId}/players`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Zawodnik Testowy');
  });
});
