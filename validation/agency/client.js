const Joi = require('joi');

const clientFields = {
  firstName: Joi.string().trim().required(),
  lastName: Joi.string().trim().required(),
  email: Joi.string().email().allow('').optional(),
  phone: Joi.string().allow('').optional(),
  dateOfBirth: Joi.string().allow('').optional(),
  gender: Joi.string().allow('').optional(),
  streetAddress: Joi.string().allow('').optional(),
  city: Joi.string().allow('').optional(),
  state: Joi.string().allow('').optional(),
  zipCode: Joi.string().allow('').optional(),
  country: Joi.string().allow('').optional(),
  primaryDiagnosis: Joi.string().allow('').optional(),
  allergies: Joi.string().allow('').optional(),
  mobility: Joi.string().allow('').optional(),
  livingArrangement: Joi.string().allow('').optional(),
  emergencyContactName: Joi.string().allow('').optional(),
  emergencyContactRelationship: Joi.string().allow('').optional(),
  emergencyContactPhone: Joi.string().allow('').optional(),
  status: Joi.string().valid('Active', 'Inactive').optional(),
  notes: Joi.string().allow('').optional(),
};

module.exports = {
  create: Joi.object(clientFields),
  update: Joi.object({
    ...clientFields,
    firstName: Joi.string().trim().optional(),
    lastName: Joi.string().trim().optional(),
  }),
};
