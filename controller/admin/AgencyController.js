const constants = require('../../common/constants');
const Validation = require('../../validation');
const { AgencyService } = require('../../services');
const AgencyRecordsService = require('../../services/admin/agencyRecords.service');

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await AgencyService.getAll();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await AgencyService.getOptions();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await AgencyService.getById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregivers = async (req, res, next) => {
  try {
    const data = await AgencyService.getCaregivers(req.params.id, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getBilling = async (req, res, next) => {
  try {
    const data = await AgencyService.getBilling(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getDocuments = async (req, res, next) => {
  try {
    const data = await AgencyRecordsService.getDocuments(req.params.id, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.createDocument = async (req, res, next) => {
  try {
    const data = await AgencyRecordsService.createDocument(req, req.params.id, req.body, req.file);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.updateDocument = async (req, res, next) => {
  try {
    const data = await AgencyRecordsService.updateDocument(req.params.id, req.params.docId, req.body);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.removeDocument = async (req, res, next) => {
  try {
    await AgencyRecordsService.deleteDocument(req.params.id, req.params.docId);
    return res.success(constants.MESSAGE.RECORD_DELETED, {});
  } catch (error) {
    next(error);
  }
};

module.exports.getNotes = async (req, res, next) => {
  try {
    const data = await AgencyRecordsService.getNotes(req.params.id, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.createNote = async (req, res, next) => {
  try {
    const data = await AgencyRecordsService.createNote(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.updateNote = async (req, res, next) => {
  try {
    const data = await AgencyRecordsService.updateNote(req.params.id, req.params.noteId, req.body);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.removeNote = async (req, res, next) => {
  try {
    await AgencyRecordsService.deleteNote(req.params.id, req.params.noteId);
    return res.success(constants.MESSAGE.RECORD_DELETED, {});
  } catch (error) {
    next(error);
  }
};

module.exports.getLifecycleList = async (req, res, next) => {
  try {
    const data = await AgencyService.getLifecycleList(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.archive = async (req, res, next) => {
  try {
    const data = await AgencyService.archive(req.params.id);
    return res.success(constants.MESSAGE.AGENCY.ARCHIVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.restore = async (req, res, next) => {
  try {
    const data = await AgencyService.restore(req.params.id);
    return res.success(constants.MESSAGE.AGENCY.RESTORED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.setPassword = async (req, res, next) => {
  try {
    await Validation.Agency.setPassword.validateAsync(req.body);
    const data = await AgencyService.setPassword(req.params.id, req.body.password);
    return res.success(constants.MESSAGE.AGENCY.PASSWORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.resetPassword = async (req, res, next) => {
  try {
    const data = await AgencyService.resetPassword(req.params.id);
    return res.success(constants.MESSAGE.AGENCY.PASSWORD_RESET_SENT, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    const data = await AgencyService.create(req.body);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    const data = await AgencyService.update(req.params.id, req.body);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await AgencyService.remove(req.params.id);
    return res.success(constants.MESSAGE.AGENCY.DELETED, data);
  } catch (error) {
    next(error);
  }
};
