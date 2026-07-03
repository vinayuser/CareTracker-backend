const Joi = require('joi');

const fields = {
  clientId: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('Draft', 'Submitted', 'Verified').optional(),
  intakeDate: Joi.string().allow('').optional(),
  formData: Joi.object().unknown(true).optional(),
};

module.exports = {
  create: Joi.object(fields),
  update: Joi.object(fields),
};
