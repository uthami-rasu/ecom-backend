import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const INVALID_TEXT_REPRESENTATION = '22P02';

/** Friendly messages for named constraints; anything else gets a generic message. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_users_email: 'An account with this email already exists',
  uq_categories_slug: 'A category with this slug already exists',
  uq_products_slug: 'A product with this slug already exists',
  uq_product_variants_sku: 'A variant with this SKU already exists',
  uq_product_variants_product_label:
    'This product already has a variant with that label',
  uq_coupons_code: 'A coupon with this code already exists',
  uq_reviews_product_user: 'You have already reviewed this product',
  fk_products_category: 'Category is in use or does not exist',
  fk_categories_parent:
    'Category has sub-categories or the parent does not exist',
};

/**
 * Translates Postgres errors into HTTP responses without leaking SQL, table names
 * or driver details to clients.
 */
@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(
    exception: QueryFailedError & {
      driverError?: { code?: string; constraint?: string };
    },
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();
    const code = exception.driverError?.code;
    const constraint = exception.driverError?.constraint ?? '';

    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (code === UNIQUE_VIOLATION) {
      status = HttpStatus.CONFLICT;
      message = CONSTRAINT_MESSAGES[constraint] ?? 'Resource already exists';
    } else if (code === FOREIGN_KEY_VIOLATION) {
      status = HttpStatus.CONFLICT;
      message =
        CONSTRAINT_MESSAGES[constraint] ??
        'Operation conflicts with related records';
    } else if (code === CHECK_VIOLATION) {
      status = HttpStatus.CONFLICT;
      message = 'Operation violates a data constraint';
    } else if (code === INVALID_TEXT_REPRESENTATION) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid identifier or value';
    } else {
      this.logger.error(exception.message, exception.stack);
    }

    response
      .status(status)
      .json({ statusCode: status, message, error: HttpStatus[status] });
  }
}
