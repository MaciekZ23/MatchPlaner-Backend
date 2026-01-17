import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard odpowiedzialny za autoryzację opartą o role użytkownika
 * Sprawdza czy użytkownik posiada jedną z wymaganych ról
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Array<string>>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const { user } = ctx.switchToHttp().getRequest();
    if (!user?.role) {
      return false;
    }
    return required.includes(user.role);
  }
}
