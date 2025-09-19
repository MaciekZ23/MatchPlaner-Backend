import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'USER' | 'CAPTAIN' | 'ADMIN'>) =>
  SetMetadata(ROLES_KEY, roles);
