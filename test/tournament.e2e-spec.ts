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

describe('Tournaments E2E (create + getOne)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminAccessToken: string;
  let createdTournamentId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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

    adminAccessToken = await jwtService.signAsync({
      sub: 'test-admin-id',
      role: 'ADMIN',
      email: 'admin@test.local',
      name: 'Test Admin',
      kind: 'USER',
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /api/v1/tournaments/create-tournament - powinno utworzyć turniej', async () => {
    const createPayload = {
      name: 'E2E Tournament',
      mode: 'LEAGUE',
      description: 'Turniej e2e testowy',
      additionalInfo: 'extra info',
      season: '2024/2025',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-06-30T00:00:00.000Z',
      timezone: 'Europe/Warsaw',
      venue: 'Main Arena',
      venueAddress: 'Test Street 1',
      groups: [{ name: 'Grupa A' }, { name: 'Grupa B' }],
      stages: [
        { name: 'Faza grupowa', kind: 'GROUP', order: 1 },
        { name: 'Playoffy', kind: 'PLAYOFF', order: 2 },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/tournaments/create-tournament')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send(createPayload)
      .expect(201);

    expect(res.body).toBeDefined();
    expect(res.body.id).toBeDefined();
    expect(typeof res.body.id).toBe('string');
    expect(res.body.name).toBe(createPayload.name);
    expect(res.body.mode).toBe(createPayload.mode);

    expect(res.body.startDate).toBe(createPayload.startDate);
    expect(res.body.endDate).toBe(createPayload.endDate);

    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(Array.isArray(res.body.stages)).toBe(true);
    expect(res.body.groups.length).toBe(2);
    expect(res.body.stages.length).toBe(2);

    expect(res.body.groups[0]).toHaveProperty('id');
    expect(res.body.groups[0]).toHaveProperty('name', 'Grupa A');

    expect(res.body.stages[0]).toHaveProperty('id');
    expect(res.body.stages[0]).toMatchObject({
      name: 'Faza grupowa',
      kind: 'GROUP',
      order: 1,
    });

    createdTournamentId = res.body.id;
  });

  it('GET /api/v1/tournaments/:id - powinno zwrócić ten sam turniej', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tournaments/${createdTournamentId}`)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.id).toBe(createdTournamentId);
    expect(res.body.name).toBe('E2E Tournament');
    expect(res.body.mode).toBe('LEAGUE');

    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(Array.isArray(res.body.stages)).toBe(true);
    expect(res.body.groups.length).toBeGreaterThan(0);
    expect(res.body.stages.length).toBeGreaterThan(0);
  });
});
