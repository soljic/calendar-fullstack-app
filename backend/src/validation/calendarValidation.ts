import Joi from 'joi';

export const createEventSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  location: Joi.string().allow('').optional(),
  attendees: Joi.array().items(Joi.string().email()).optional(),
  isAllDay: Joi.boolean().optional(),
  timezone: Joi.string().optional(),
  status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional(),
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
});

