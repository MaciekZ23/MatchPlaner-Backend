import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { AppModule } from 'src/app.module';
import request from 'supertest';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { SanitizePipe } from 'src/common/pipes/sanitize.pipe';

jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: jest.fn().mockImplementation(({ idToken }) => {
        if (idToken === 'valid-google-token') {
          return {
            getPayload: () => ({
              email: 'testuser@example.com',
              name: 'Test User',
              picture: null,
            }),
          };
        }
        throw new Error('Invalid token');
      }),
    })),
  };
});

describe('Auth E2E (Google login + Guest login + Refresh)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    process.env.REFRESH_JWT_SECRET = 'refreshsecret';
    process.env.ADMIN_EMAILS = 'admin@test.local';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);

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
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // GOOGLE LOGIN
  it('POST /api/admin/auth/google/verify – poprawne logowanie Google', async () => {
    const body = { idToken: 'valid-google-token' };

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/google/verify')
      .send(body)
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('testuser@example.com');

    const dbUser = await prisma.user.findUnique({
      where: { email: 'testuser@example.com' },
    });
    expect(dbUser).not.toBeNull();
  });

  // GUEST LOGIN
  it('POST /api/auth/guest – tworzy konto gościa', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/guest')
      .send({ deviceId: 'device-123' })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.role).toBe('GUEST');
    expect(res.body.user.id).toContain('g_');
  });

  // REFRESH TOKEN
  it('POST /api/auth/refresh – zwraca nowy access token', async () => {
    const guest = await request(app.getHttpServer())
      .post('/api/v1/auth/guest')
      .send({ deviceId: 'device-xyz' })
      .expect(201);

    const oldRefresh = guest.body.refreshToken;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(201);

    expect(res.body).toHaveProperty('accessToken');
  });

  // REFRESH TOKEN – błędny token
  it('POST /api/auth/refresh – błędny token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'INVALID_TOKEN' })
      .expect(401);
  });
});
