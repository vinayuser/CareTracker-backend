const Joi = require('joi');

module.exports = {
  setPassword: Joi.object({
    password: Joi.string().min(8).required(),
  }),
  update: Joi.object({
    fullName: Joi.string().trim().min(1).max(200).optional(),
    email: Joi.string().email().optional(),
    userId: Joi.string().trim().min(1).max(100).optional(),
    phone: Joi.string().trim().allow('').optional(),
    employeeId: Joi.string().trim().allow('').optional(),
    dateOfBirth: Joi.string().allow('').optional(),
    status: Joi.string().valid('Active', 'Pending', 'Inactive').optional(),
  }).min(1),
  updateStatus: Joi.object({
    status: Joi.string().valid('Active', 'Pending', 'Inactive').required(),
  }),
  sendEmail: Joi.object({
    subject: Joi.string().trim().min(1).max(200).required(),
    message: Joi.string().trim().min(1).max(5000).required(),
  }),
};
