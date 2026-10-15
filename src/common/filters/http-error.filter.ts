import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

interface ExposedHttpError {
  status: number;
  expose: boolean;
  message: string;
}

const isExposedHttpError = (error: unknown): error is ExposedHttpError =>
  typeof error === 'object' &&
  error !== null &&
  (error as ExposedHttpError).expose === true &&
  typeof (error as ExposedHttpError).status === 'number';

/**
 * Express middleware (body-parser, multer) raises `http-errors` such as 413 or 400 for
 * malformed JSON. Return them as normal client errors instead of logging them as
 * unhandled server exceptions; everything else falls through to Nest's default handler.
 */
@Catch()
export class HttpErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    if (
      !(exception instanceof HttpException) &&
      isExposedHttpError(exception)
    ) {
      const response = host.switchToHttp().getResponse<Response>();
      response
        .status(exception.status)
        .json({ statusCode: exception.status, message: exception.message });
      return;
    }
    super.catch(exception, host);
  }
}
