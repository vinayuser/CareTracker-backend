const Joi = require('joi');

module.exports.setPassword = Joi.object({
  password: Joi.string().min(8).required(),
});
