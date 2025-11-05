import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from 'src/database/prisma.service';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

function fixUtf8(str: string | null): string | null {
  if (!str) return str;
  try {
    return Buffer.from(str, 'utf8').toString();
  } catch {
    return str;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private cfg: ConfigService,
  ) {}

  private async signAccessToken(payload: Record<string, any>) {
    const expiresIn = this.cfg.get<string>('JWT_EXPIRES_IN') || '15m';
    return this.jwt.signAsync(payload, { expiresIn });
  }

  private async signRefreshToken(payload: Record<string, any>) {
    const secret =
      this.cfg.get<string>('REFRESH_JWT_SECRET') || this.cfg.get('JWT_SECRET')!;
    const expiresIn = this.cfg.get<string>('REFRESH_JWT_EXPIRES_IN') || '7d';
    return this.jwt.signAsync(payload, { secret, expiresIn });
  }

  async verifyGoogleAndLogin(idToken: string) {
    let payload: any;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google idToken');
    }

    const email = payload?.email as string | undefined;
    if (!email) {
      throw new UnauthorizedException('No email in Google token');
    }

    const normalizedAvatar = normalizeGoogleAvatar(payload?.picture ?? null);
    const desiredRole: 'ADMIN' | 'USER' = isAdminEmail(email)
      ? 'ADMIN'
      : 'USER';

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: fixUtf8(payload.name) ?? null,
          avatarUrl: normalizedAvatar ?? null,
          role: desiredRole,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: payload?.name ? fixUtf8(payload.name) : user.name,
          avatarUrl: normalizedAvatar ?? user.avatarUrl,
          role: desiredRole,
        },
      });
    }

    const basePayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: fixUtf8(user.name),
      avatar: user.avatarUrl ?? null,
      kind: 'USER',
    };

    const accessToken = await this.signAccessToken(basePayload);
    const refreshToken = await this.signRefreshToken({
      sub: user.id,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: fixUtf8(user.name),
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  async guestLogin(deviceId: string) {
    if (!deviceId) {
      throw new UnauthorizedException('deviceId required');
    }
    const guestId = `g_${cryptoRandomId()}`;
    const basePayload = {
      sub: guestId,
      role: 'GUEST',
      deviceId,
      kind: 'GUEST',
    };

    const accessToken = await this.signAccessToken(basePayload);
    const refreshToken = await this.signRefreshToken({
      sub: guestId,
      role: 'GUEST',
    });

    return {
      accessToken,
      refreshToken,
      user: { id: guestId, role: 'GUEST', avatarUrl: null },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const secret =
        this.cfg.get<string>('REFRESH_JWT_SECRET') ||
        this.cfg.get('JWT_SECRET')!;
      const payload = await this.jwt.verifyAsync(refreshToken, { secret });

      const user = await this.prisma.user
        .findUnique({ where: { id: payload.sub } })
        .catch(() => null);

      const role = user?.role ?? payload.role ?? 'GUEST';

      const accessToken = await this.signAccessToken({
        sub: payload.sub,
        role,
        kind: role === 'GUEST' ? 'GUEST' : 'USER',
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeGoogleAvatar(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    if (url.includes('googleusercontent.com')) {
      const u = new URL(url);
      if (!u.searchParams.has('sz')) u.searchParams.set('sz', '96'); // rozmiar miniatury
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}
