import { Request, Response, NextFunction } from 'express';
import { ApiError, ApiResponse, ValidationError as ValidationErrorType } from '../types';

export class AppError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail?: string;
  public readonly instance?: string;
  public readonly errors?: ValidationErrorType[];

  constructor(
    status: number,
    type: string,
    title: string,
    detail?: string,
    instance?: string,
    errors?: ValidationErrorType[]
  ) {
    super(title);
    this.status = status;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.instance = instance;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }

  public toApiError(): ApiError {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      errors: this.errors,
    };
  }
}

export class BadRequestError extends AppError {
  constructor(detail?: string, errors?: ValidationErrorType[]) {
    super(
      400,
      'https://httpstatuses.com/400',
      'Bad Request',
      detail || 'The request could not be understood by the server',
      undefined,
      errors
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super(
      401,
      'https://httpstatuses.com/401',
      'Unauthorized',
      detail || 'Authentication is required to access this resource'
    );
  }
}

export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super(
      403,
      'https://httpstatuses.com/403',
      'Forbidden',
      detail || 'You do not have permission to access this resource'
    );
  }
}

export class NotFoundError extends AppError {
  constructor(detail?: string) {
    super(
      404,
      'https://httpstatuses.com/404',
      'Not Found',
      detail || 'The requested resource could not be found'
    );
  }
}

export class ConflictError extends AppError {
  constructor(detail?: string) {
    super(
      409,
      'https://httpstatuses.com/409',
      'Conflict',
      detail || 'The request conflicts with the current state of the resource'
    );
  }
}

export class ValidationError extends AppError {
  constructor(errors: ValidationErrorType[], detail?: string) {
    super(
      422,
      'https://httpstatuses.com/422',
      'Validation Error',
      detail || 'The request contains invalid data',
      undefined,
      errors
    );
  }
}

export class InternalServerError extends AppError {
  constructor(detail?: string) {
    super(
      500,
      'https://httpstatuses.com/500',
      'Internal Server Error',
      detail || 'An unexpected error occurred on the server'
    );
  }
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error.name === 'ValidationError' && 'details' in error) {
    const validationErrors = (error as any).details.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message,
      code: detail.type,
    }));
    appError = new ValidationError(validationErrors);
  } else if (error.name === 'JsonWebTokenError') {
    appError = new UnauthorizedError('Invalid token');
  } else if (error.name === 'TokenExpiredError') {
    appError = new UnauthorizedError('Token has expired');
  } else if (error.name === 'SyntaxError' && 'body' in error) {
    appError = new BadRequestError('Invalid JSON syntax');
  } else {
    console.error('Unhandled error:', error);
    appError = new InternalServerError(
      process.env.NODE_ENV === 'development' ? error.message : undefined
    );
  }

  const response: ApiResponse = {
    success: false,
    error: appError.toApiError(),
  };

  if (process.env.NODE_ENV === 'development') {
    console.error(`Error ${appError.status}:`, appError.stack);
  }

  res.status(appError.status).json(response);
};