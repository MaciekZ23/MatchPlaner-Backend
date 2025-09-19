import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type JwtPayload = {
  sub: string;
  role?: 'USER' | 'CAPTAIN' | 'ADMIN' | 'GUEST';
  deviceId?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'devsecret',
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
