const Joi = require('joi');

module.exports = {
  update: Joi.object({
    logo: Joi.string().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    phone: Joi.string().allow('').max(40).optional(),
    fax: Joi.string().allow('').max(40).optional(),
    website: Joi.string().allow('').max(200).optional(),
    address: Joi.string().allow('').max(300).optional(),
    city: Joi.string().allow('').max(100).optional(),
    state: Joi.string().allow('').max(50).optional(),
  }),
};
