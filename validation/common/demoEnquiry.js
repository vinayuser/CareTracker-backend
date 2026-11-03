const Joi = require('joi');

const usPhone = Joi.string()
  .trim()
  .required()
  .custom((value, helpers) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 10) {
      return helpers.message('Enter a valid US phone number: (555) 123-4567');
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }, 'US phone');

module.exports = {
  create: Joi.object({
    firstName: Joi.string().trim().min(1).max(80).required(),
    lastName: Joi.string().trim().min(1).max(80).required(),
    email: Joi.string().trim().email().required(),
    country: Joi.string().trim().max(8).allow('').optional(),
    dialCode: Joi.string().trim().max(8).allow('').optional(),
    phone: usPhone,
    scheduleDate: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    scheduleTime: Joi.string().trim().min(4).max(20).required(),
    timezone: Joi.string().trim().max(80).allow('').optional(),
    address: Joi.string().trim().min(8).max(400).required(),
  }),
};
