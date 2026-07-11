const Joi = require('joi');

module.exports.save = Joi.object({
  status: Joi.string().valid('Draft', 'Submitted').default('Draft'),
  form_data: Joi.object().unknown(true).required(),
});
