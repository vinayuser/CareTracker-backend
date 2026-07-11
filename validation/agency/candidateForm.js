const Joi = require('joi');

module.exports = {
  saveDraft: Joi.object({
    form_data: Joi.object().required(),
  }),
  submit: Joi.object({
    form_data: Joi.object().required(),
  }),
};
