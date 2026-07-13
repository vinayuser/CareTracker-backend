const Joi = require('joi');

module.exports = {
  saveDraft: Joi.object({
    form_data: Joi.object().required(),
  }),
  submit: Joi.object({
    form_data: Joi.object().required(),
  }),
  resendEmail: Joi.object({
    document_codes: Joi.array().items(Joi.string().trim()).min(1).optional(),
  }),
};
