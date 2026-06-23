const Joi = require('joi');

module.exports = {
  apply: Joi.object({
    first_name: Joi.string().trim().required(),
    last_name: Joi.string().trim().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().trim().required(),
    location: Joi.string().trim().required(),
    country: Joi.string().trim().required(),
    designation: Joi.string().trim().required(),
    education: Joi.string().trim().required(),
    experience: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
    current_ctc: Joi.alternatives().try(Joi.number(), Joi.string().allow('')).optional(),
    expected_ctc: Joi.alternatives().try(Joi.number(), Joi.string().allow('')).optional(),
    date_of_birth: Joi.alternatives().try(Joi.date(), Joi.string().allow('')).optional(),
    summary: Joi.string().allow('').optional(),
    skills: Joi.string().allow('').optional(),
    source_id: Joi.string().allow('').optional(),
    job_id: Joi.string().required(),
  }),
  setStage: Joi.object({
    stage_id: Joi.string().required(),
  }),
};
