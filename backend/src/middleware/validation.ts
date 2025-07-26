import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { BadRequestError, ValidationError as CustomValidationError } from './errorHandler';
import { ValidationError as ValidationErrorType } from '../types';

export const validateRequest = (schema: {
  body?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationErrorType[] = [];

    if (schema.body && req.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) {
        errors.push(...mapJoiErrors(error, 'body'));
      }
    }

    if (schema.params && req.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) {
        errors.push(...mapJoiErrors(error, 'params'));
      }
    }

    if (schema.query && req.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) {
        errors.push(...mapJoiErrors(error, 'query'));
      }
    }

    if (errors.length > 0) {
      throw new CustomValidationError(errors);
    }

    next();
  };
};

const mapJoiErrors = (joiError: Joi.ValidationError, source: string): ValidationErrorType[] => {
  return joiError.details.map(detail => ({
    field: `${source}.${detail.path.join('.')}`,
    message: detail.message,
    code: detail.type,
  }));
};