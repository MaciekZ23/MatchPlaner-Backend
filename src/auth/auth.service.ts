import { Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

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
          name: payload.name ?? null,
          avatarUrl: normalizedAvatar ?? null,
          role: desiredRole,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: payload?.name ?? user.name,
          avatarUrl: normalizedAvatar ?? user.avatarUrl,
          role: desiredRole, // 👈 aktualizuj rolę wg listy
        },
      });
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      avatar: user.avatarUrl ?? null,
      kind: 'USER',
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  async guestLogin(deviceId: string) {
    if (!deviceId) {
      throw new UnauthorizedException('deviceId required');
    }
    const guestId = `g_${cryptoRandomId()}`;

    const token = await this.jwt.signAsync({
      sub: guestId,
      role: 'GUEST',
      deviceId,
      kind: 'GUEST',
    });

    return { token, user: { id: guestId, role: 'GUEST', avatarUrl: null } };
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
