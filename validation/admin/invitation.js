const Joi = require('joi');

module.exports = {
  create: Joi.object({
    agencyName: Joi.string().required(),
    email: Joi.string().email().required(),
    message: Joi.string().allow('').optional(),
    subscriptionPlanId: Joi.string().required(),
  }),
};
