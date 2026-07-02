const Joi = require('joi');

const stringField = Joi.string().trim().allow('').optional();
const stringArray = Joi.array().items(Joi.string()).optional();

module.exports = {
  create: Joi.object({
    assessorName: stringField,
    assessorTitle: stringField,
    assessorPhoto: stringField,
    assessmentDate: stringField,
    assessmentTypes: stringArray,
    formData: Joi.object().unknown(true).required(),
    status: Joi.string().valid('Enquiry', 'Quoted', 'Accepted', 'Declined').optional(),
  }),
  update: Joi.object({
    assessorName: stringField,
    assessorTitle: stringField,
    assessorPhoto: stringField,
    assessmentDate: stringField,
    assessmentTypes: stringArray,
    formData: Joi.object().unknown(true).optional(),
    status: Joi.string().valid('Enquiry', 'Quoted', 'Accepted', 'Declined').optional(),
  }),
  generateQuote: Joi.object({
    hourlyRate: Joi.number().min(0).required(),
    weeklyHours: Joi.number().min(0).required(),
    quotedMonthlyPrice: Joi.number().min(0).optional(),
  }),
};
