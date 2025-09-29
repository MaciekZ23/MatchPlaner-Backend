import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const hasAuthHeader = !!req.headers['authorization'];

    if (hasAuthHeader && (err || info)) {
      throw err || new UnauthorizedException(info?.message || 'Invalid token');
    }

    return user ?? null;
  }
}
