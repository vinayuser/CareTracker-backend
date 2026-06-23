const Joi = require('joi');

const stageDocumentSchema = Joi.object({
  code: Joi.string().required(),
  name: Joi.string().allow('').optional(),
  isRequired: Joi.boolean().default(true),
  order: Joi.number().integer().min(1).required(),
});

const stageSchema = Joi.object({
  name: Joi.string().trim().required(),
  type: Joi.string().valid('hiring', 'onboarding', 'custom').default('hiring'),
  order: Joi.number().integer().min(1).required(),
  documents: Joi.array().items(stageDocumentSchema).default([]),
});

module.exports = {
  savePipeline: Joi.object({
    stages: Joi.array().items(stageSchema).min(1).required(),
  }),
  createStage: Joi.object({
    name: Joi.string().trim().required(),
    type: Joi.string().valid('hiring', 'onboarding', 'custom').default('hiring'),
    stageOrder: Joi.number().integer().min(1).optional(),
    documents: Joi.array().items(stageDocumentSchema).default([]),
  }),
  updateStage: Joi.object({
    name: Joi.string().trim().optional(),
    type: Joi.string().valid('hiring', 'onboarding', 'custom').optional(),
    stageOrder: Joi.number().integer().min(1).optional(),
    isActive: Joi.boolean().optional(),
    documents: Joi.array().items(stageDocumentSchema).optional(),
  }),
  reorderStages: Joi.object({
    stages: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().required(),
          order: Joi.number().integer().min(1).required(),
        }),
      )
      .min(1)
      .required(),
  }),
};
