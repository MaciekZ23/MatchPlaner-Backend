import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { Logger } from 'nestjs-pino';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse = isHttp
      ? (exception.getResponse() as any)
      : { message: 'Internal server error' };

    const message =
      typeof errorResponse === 'string'
        ? errorResponse
        : (errorResponse?.message ?? 'Unexpected error');

    this.logger.error({
      status,
      message,
      stack:
        process.env.NODE_ENV !== 'production'
          ? (exception as any)?.stack
          : undefined,
    });

    const safeResponse =
      process.env.NODE_ENV === 'production'
        ? {
            statusCode: status,
            message:
              status === 500
                ? 'Something went wrong. Please try again later.'
                : message,
          }
        : {
            statusCode: status,
            message,
            error: errorResponse?.error,
            stack: (exception as any)?.stack,
          };

    response.status(status).json(safeResponse);
  }
}
