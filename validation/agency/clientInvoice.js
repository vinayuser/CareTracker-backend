const Joi = require('joi');

module.exports = {
  generate: Joi.object({
    client_id: Joi.string().required(),
    period_from: Joi.string().required(),
    period_to: Joi.string().required(),
    notes: Joi.string().allow('').optional(),
  }),
};
