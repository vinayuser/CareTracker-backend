const Joi = require('joi');
const { LEAD_STAGES, LEAD_PRIORITIES } = require('../../common/leadConstants');

const stringField = Joi.string().trim().allow('', null).optional();

module.exports = {
  create: Joi.object({
    stage: Joi.string().valid(...LEAD_STAGES).optional(),
    priority: Joi.string().valid(...LEAD_PRIORITIES).optional(),
    nextAction: stringField,
    notes: stringField,
    assignedToAccountId: stringField,
    assignedToName: stringField,
    formData: Joi.object().unknown(true).required(),
  }),
  update: Joi.object({
    stage: Joi.string().valid(...LEAD_STAGES).optional(),
    priority: Joi.string().valid(...LEAD_PRIORITIES).optional(),
    nextAction: stringField,
    notes: stringField,
    assignedToAccountId: stringField,
    assignedToName: stringField,
    formData: Joi.object().unknown(true).optional(),
  }).min(1),
  convert: Joi.object({
    notes: stringField,
  }).unknown(true),
  logContact: Joi.object({
    contactMethod: Joi.string().trim().required(),
    contactedAt: stringField,
    spokeWith: Joi.string().trim().required(),
    relationship: stringField,
    contactedBy: Joi.string().trim().required(),
    designation: stringField,
    notes: Joi.when('callStatus', {
      is: 'cancel',
      then: Joi.string().trim().max(500).allow('').optional(),
      otherwise: Joi.string().trim().max(500).required(),
    }),
    followUpDate: stringField,
    followUpTime: stringField,
    callStatus: Joi.string().valid('move_next', 'cancel', 'needs_time').required(),
    nextLevel: stringField,
    assignTo: stringField,
    addReminder: Joi.boolean().optional(),
    reminderTask: stringField,
  }),
  scheduleHomeAssessment: Joi.object({
    visitDate: Joi.string().trim().required(),
    visitTime: Joi.string().trim().required(),
    location: stringField,
    assessorName: Joi.string().trim().required(),
    notes: stringField,
    createAssessmentAfter: Joi.boolean().optional(),
  }),
  createAssessment: Joi.object({
    assessorName: stringField,
    assessorTitle: stringField,
    assessmentDate: stringField,
  }).unknown(true),
};
