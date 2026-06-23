const Joi = require('joi');
const { HR_ASSIGNABLE_MODULES } = require('../../common/agencyModules');

const hrStaffFields = {
  firstName: Joi.string().trim().required(),
  lastName: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().trim().required(),
  dateOfBirth: Joi.string().allow('').optional(),
  gender: Joi.string().allow('').optional(),
  employeeId: Joi.string().trim().required(),
  jobTitle: Joi.string().trim().required(),
  department: Joi.string().allow('').optional(),
  hireDate: Joi.string().required(),
  employmentType: Joi.string().allow('').optional(),
  workLocation: Joi.string().allow('').optional(),
  reportsTo: Joi.string().allow('').optional(),
  streetAddress: Joi.string().allow('').optional(),
  city: Joi.string().allow('').optional(),
  state: Joi.string().allow('').optional(),
  zipCode: Joi.string().allow('').optional(),
  country: Joi.string().allow('').optional(),
  emergencyContactName: Joi.string().trim().required(),
  emergencyContactRelationship: Joi.string().allow('').optional(),
  emergencyContactPhone: Joi.string().trim().required(),
  emergencyContactEmail: Joi.string().email().allow('').optional(),
  educationLevel: Joi.string().allow('').optional(),
  yearsOfExperience: Joi.string().allow('').optional(),
  certifications: Joi.string().allow('').optional(),
  specializations: Joi.string().allow('').optional(),
  userId: Joi.string().trim().required(),
  password: Joi.string().min(8).required(),
  status: Joi.string().valid('Active', 'Pending', 'Inactive').optional(),
  sendWelcomeEmail: Joi.boolean().optional(),
  notes: Joi.string().allow('').optional(),
  moduleAccess: Joi.array()
    .items(Joi.string().valid(...HR_ASSIGNABLE_MODULES))
    .min(1)
    .optional(),
};

module.exports = {
  create: Joi.object(hrStaffFields),
  update: Joi.object({
    ...hrStaffFields,
    password: Joi.string().min(8).optional(),
    userId: Joi.string().trim().optional(),
    firstName: Joi.string().trim().optional(),
    lastName: Joi.string().trim().optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().trim().optional(),
    employeeId: Joi.string().trim().optional(),
    jobTitle: Joi.string().trim().optional(),
    hireDate: Joi.string().optional(),
    emergencyContactName: Joi.string().trim().optional(),
    emergencyContactPhone: Joi.string().trim().optional(),
    moduleAccess: Joi.array()
      .items(Joi.string().valid(...HR_ASSIGNABLE_MODULES))
      .min(1)
      .optional(),
  }),
  updateStatus: Joi.object({
    status: Joi.string().valid('Active', 'Pending', 'Inactive').required(),
  }),
};
