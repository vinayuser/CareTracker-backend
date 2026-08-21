const Joi = require('joi');

module.exports = {
  savePolicy: Joi.object({
    types: Joi.array().items(Joi.object({
      key: Joi.string().trim().allow('').optional(),
      name: Joi.string().trim().min(1).max(80).required(),
      days: Joi.number().min(0).max(366).required(),
    })).min(1).required(),
    applyToExisting: Joi.boolean().optional(),
  }),
  apply: Joi.object({
    typeKey: Joi.string().trim().required(),
    type_key: Joi.string().trim().optional(),
    startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    start_date: Joi.string().optional(),
    end_date: Joi.string().optional(),
    reason: Joi.string().allow('').max(1000).optional(),
  }),
  review: Joi.object({
    note: Joi.string().allow('').max(1000).optional(),
  }),
};
