const Joi = require('joi');

const formData = Joi.object().unknown(true).optional();

module.exports = {
  update: Joi.object({
    status: Joi.string().valid('Pending', 'Submitted', 'Verified', 'Rejected').optional(),
    formData,
  }),
  verify: Joi.object({
    action: Joi.string().valid('verify', 'reject').optional(),
    formData,
  }),
  submit: Joi.object({
    formData: formData.required(),
  }),
};
