import Joi from 'joi';

export const commonSchemas = {
  id: Joi.string().uuid().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  name: Joi.string().min(1).max(255).trim().required(),
  optionalName: Joi.string().min(1).max(255).trim().optional(),
  description: Joi.string().max(1000).trim().optional(),
  dateTime: Joi.date().iso().required(),
  optionalDateTime: Joi.date().iso().optional(),
  boolean: Joi.boolean().required(),
  optionalBoolean: Joi.boolean().optional(),
  color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).required(),
  optionalColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional(),
};