const Joi = require('joi');
const { HOLIDAY_TYPES, HOLIDAY_STATUSES } = require('../../common/leaveConstants');

module.exports = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(200).required(),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    type: Joi.string().valid(...HOLIDAY_TYPES).required(),
    status: Joi.string().valid(...HOLIDAY_STATUSES).optional(),
    blocksWork: Joi.boolean().optional(),
    notes: Joi.string().allow('').max(1000).optional(),
  }),
  update: Joi.object({
    name: Joi.string().trim().min(1).max(200).optional(),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    type: Joi.string().valid(...HOLIDAY_TYPES).optional(),
    status: Joi.string().valid(...HOLIDAY_STATUSES).optional(),
    blocksWork: Joi.boolean().optional(),
    notes: Joi.string().allow('').max(1000).optional(),
  }).min(1),
};
