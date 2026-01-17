import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn();

  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
    __mockVerifyIdToken: mockVerifyIdToken,
  };
});

const { __mockVerifyIdToken } = require('google-auth-library');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
  let jwt: jest.Mocked<JwtService>;
  let cfg: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    process.env.GOOGLE_CLIENT_ID = 'test-google-id';

    __mockVerifyIdToken.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed-token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwt = module.get(JwtService);
    cfg = module.get(ConfigService);
  });

  // Google login
  describe('verifyGoogleAndLogin', () => {
    it('Throws if Google token invalid', async () => {
      __mockVerifyIdToken.mockRejectedValue(new Error('bad token'));

      await expect(service.verifyGoogleAndLogin('idtoken123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Throws if Google token has no email', async () => {
      __mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: undefined }),
      });

      await expect(service.verifyGoogleAndLogin('X')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Creates new user if not exists', async () => {
      __mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'user@example.com',
          name: 'Test User',
          picture: null,
        }),
      });

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'U1',
        email: 'user@example.com',
        name: 'Test User',
        avatarUrl: null,
        role: 'USER',
      });

      const result = await service.verifyGoogleAndLogin('valid-token');

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.user.email).toBe('user@example.com');
    });

    it('Updates existing user if exists', async () => {
      __mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email: 'user@example.com',
          name: 'New Name',
          picture: 'http://pic',
        }),
      });

      prisma.user.findUnique.mockResolvedValue({
        id: 'U1',
        email: 'user@example.com',
        name: 'Old Name',
        avatarUrl: null,
        role: 'USER',
      });

      prisma.user.update.mockResolvedValue({
        id: 'U1',
        email: 'user@example.com',
        name: 'New Name',
        avatarUrl: 'http://pic',
        role: 'USER',
      });

      const result = await service.verifyGoogleAndLogin('valid-token');

      expect(prisma.user.update).toHaveBeenCalled();
      expect(result.user.name).toBe('New Name');
    });
  });

  // Guest login
  describe('guestLogin', () => {
    it('Throws if no deviceId', async () => {
      await expect(service.guestLogin('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Creates valid guest session', async () => {
      const result = await service.guestLogin('device-123');

      expect(result.user.role).toBe('GUEST');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  // Refresh token
  describe('refreshToken', () => {
    it('Throws if refresh token invalid', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('Invalid'));

      await expect(service.refreshToken('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Refreshes token for existing user', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'U1', role: 'USER' });

      prisma.user.findUnique.mockResolvedValue({ id: 'U1', role: 'USER' });

      const res = await service.refreshToken('valid-refresh');

      expect(res.accessToken).toBe('signed-token');
    });

    it('Refreshes token for deleted user', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'U999', role: 'ADMIN' });

      prisma.user.findUnique.mockResolvedValue(null);

      const res = await service.refreshToken('valid');

      expect(res.accessToken).toBe('signed-token');
    });
  });
});
