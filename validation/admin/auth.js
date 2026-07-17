const Joi = require('joi');

module.exports = {
  login: Joi.object({
    // Accept email or login userId (HR/caregiver may not use an email as userId)
    email: Joi.string().trim().min(1).required(),
    password: Joi.string().required(),
  }),
};
