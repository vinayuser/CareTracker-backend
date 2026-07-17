const Joi = require('joi');

module.exports = {
  update: Joi.object({
    vendorName: Joi.string().allow('').optional(),
    complianceGoalPercent: Joi.number().min(0).max(100).optional(),
    defaultGraceMinutes: Joi.number().valid(15, 30).optional(),
    geoRadiusMeters: Joi.number().min(50).max(5000).optional(),
    geoEnforcement: Joi.string().valid('off', 'warn', 'block').optional(),
    allowedMethods: Joi.array().items(Joi.string()).optional(),
    medicaidExportEnabled: Joi.boolean().optional(),
  }),
};
