const Joi = require('joi');

module.exports = {
  login: Joi.object({
    // Accept email or login userId (HR/caregiver may not use an email as userId)
    email: Joi.string().trim().min(1).required(),
    password: Joi.string().required(),
  }),
  updateProfile: Joi.object({
    name: Joi.string().trim().min(1).max(120).optional(),
    email: Joi.string().trim().email().optional(),
    phone: Joi.string().trim().allow('').max(40).optional(),
    dateOfBirth: Joi.string().trim().allow('').max(40).optional(),
    userId: Joi.string().trim().min(3).max(80).optional(),
    employeeId: Joi.string().trim().allow('').max(80).optional(),
    jobTitle: Joi.string().trim().allow('').max(120).optional(),
    department: Joi.string().trim().allow('').max(120).optional(),
  }).min(1),
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(128).required(),
  }),
  forgotPassword: Joi.object({
    email: Joi.string().trim().min(1).required(),
  }),
  resetPassword: Joi.object({
    token: Joi.string().trim().min(10).required(),
    password: Joi.string().min(8).max(128).required(),
  }),
};
