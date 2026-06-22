import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '../logger.js';

const logger = new Logger('HttpExceptionFilter');

const ERROR_STATUS = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  INVALID_DAYS: HttpStatus.BAD_REQUEST,
  INVALID_STATE: HttpStatus.CONFLICT,
  INSUFFICIENT_BALANCE: HttpStatus.CONFLICT,
  CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
};

export class HttpExceptionFilter {
  catch(exception, host) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message;
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = exceptionResponse.message || exception.message;
        details = exceptionResponse.error || exceptionResponse.message;
      } else {
        message = exceptionResponse;
      }
    } else {
      const errorKey = exception?.code || exception?.message;
      if (errorKey && ERROR_STATUS[errorKey]) {
        status = ERROR_STATUS[errorKey];
      }
      message = exception.message || 'Internal Server Error';
      details = {
        code: exception.code,
        name: exception.constructor?.name || 'Error',
        stack: process.env.NODE_ENV === 'development' ? exception.stack : undefined,
      };
    }

    // Log the error
    logger.error(`${request.method} ${request.url}`, {
      status,
      message,
      details,
    });

    // Send response
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(process.env.NODE_ENV === 'development' && { details }),
    });
  }
}

Catch()(HttpExceptionFilter);
