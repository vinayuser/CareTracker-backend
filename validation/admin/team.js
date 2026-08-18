const Joi = require('joi');

const moduleAccess = Joi.array().items(Joi.string().trim()).optional();

module.exports = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(120).required(),
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(8).max(128).required(),
    status: Joi.string().valid('Active', 'Inactive').optional(),
    role: Joi.string().valid('SUPER_ADMIN', 'ADMIN').optional(),
    moduleAccess,
  }),
  update: Joi.object({
    name: Joi.string().trim().min(1).max(120).optional(),
    email: Joi.string().trim().email().optional(),
    status: Joi.string().valid('Active', 'Inactive').optional(),
    role: Joi.string().valid('SUPER_ADMIN', 'ADMIN').optional(),
    moduleAccess,
  }).min(1),
  setStatus: Joi.object({
    status: Joi.string().valid('Active', 'Inactive').required(),
  }),
  setPassword: Joi.object({
    password: Joi.string().min(8).max(128).required(),
  }),
};
