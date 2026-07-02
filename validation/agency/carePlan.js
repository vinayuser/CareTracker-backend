const Joi = require('joi');

const assessmentSchema = Joi.object({
  personalCare: Joi.string().allow('').optional(),
  mobility: Joi.string().allow('').optional(),
  medicationManagement: Joi.string().allow('').optional(),
  nutrition: Joi.string().allow('').optional(),
  cognitiveStatus: Joi.string().allow('').optional(),
  communication: Joi.string().allow('').optional(),
  emotionalWellbeing: Joi.string().allow('').optional(),
  homeSafety: Joi.string().allow('').optional(),
});

const serviceSchema = Joi.object({
  id: Joi.string().optional(),
  enabled: Joi.boolean().optional(),
  category: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  frequency: Joi.string().allow('').optional(),
  duration: Joi.string().allow('').optional(),
  provider: Joi.string().allow('').optional(),
  notes: Joi.string().allow('').optional(),
});

const carePlanFields = {
  clientId: Joi.string().optional(),
  assessmentId: Joi.string().optional(),
  status: Joi.string().valid('Draft', 'Active', 'Archived').optional(),
  quoteStatus: Joi.string().valid('Quoted', 'Accepted', 'Declined').allow(null).optional(),
  hourlyRate: Joi.number().min(0).optional(),
  weeklyHours: Joi.number().min(0).optional(),
  quotedMonthlyPrice: Joi.number().min(0).optional(),
  agreementDate: Joi.string().allow('').optional(),
  effectiveDate: Joi.string().allow('').optional(),
  reviewDate: Joi.string().allow('').optional(),
  version: Joi.string().allow('').optional(),
  formData: Joi.object().unknown(true).optional(),
  assessment: assessmentSchema.optional(),
  assessmentNotes: Joi.string().allow('').optional(),
  services: Joi.array().items(serviceSchema).optional(),
};

module.exports = {
  create: Joi.object(carePlanFields).or('clientId', 'assessmentId'),
  update: Joi.object({
    ...carePlanFields,
    clientId: Joi.string().optional(),
  }),
};
