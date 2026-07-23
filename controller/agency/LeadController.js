const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { LeadService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    return res.success(constants.MESSAGE.SUCCESS, LeadService.getOptions());
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await LeadService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await LeadService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await LeadService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.Lead.create.validateAsync(req.body);
    const data = await LeadService.create(req, req.body);
    return res.success(constants.MESSAGE.LEAD.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.Lead.update.validateAsync(req.body);
    const data = await LeadService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.LEAD.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await LeadService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.LEAD.DELETED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.convert = async (req, res, next) => {
  try {
    await Validation.Lead.convert.validateAsync(req.body || {});
    const data = await LeadService.convertToClient(req, req.params.id);
    return res.success(constants.MESSAGE.LEAD.CONVERTED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.logContact = async (req, res, next) => {
  try {
    await Validation.Lead.logContact.validateAsync(req.body || {});
    const data = await LeadService.logContact(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.LEAD.CONTACT_LOGGED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.scheduleHomeAssessment = async (req, res, next) => {
  try {
    await Validation.Lead.scheduleHomeAssessment.validateAsync(req.body || {});
    const data = await LeadService.scheduleHomeAssessment(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.LEAD.ASSESSMENT_SCHEDULED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.createAssessment = async (req, res, next) => {
  try {
    await Validation.Lead.createAssessment.validateAsync(req.body || {});
    const data = await LeadService.createAssessmentFromLead(req, req.params.id, req.body || {});
    return res.success(constants.MESSAGE.LEAD.ASSESSMENT_CREATED, data);
  } catch (error) {
    next(error);
  }
};
