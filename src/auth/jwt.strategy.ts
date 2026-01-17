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

/**
 * Strategia JWT wykorzystywana przez Passport
 * Odpowiada za weryfikację tokenu oraz ekstrakcję danych użytkownika
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'devsecret',
    });
  }

  /**
   * Metoda wywoływana po poprawnej weryfikacji tokenu JWT
   * Zwrócony obiekt trafia do req.user
   */
  async validate(payload: JwtPayload) {
    return payload;
  }
}
