const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { HiringPipelineService } = require('../../services');

module.exports.getDocuments = async (req, res, next) => {
  try {
    const data = await HiringPipelineService.getAvailableDocuments();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getPipeline = async (req, res, next) => {
  try {
    const data = await HiringPipelineService.getPipeline(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getStages = async (req, res, next) => {
  try {
    const data = await HiringPipelineService.getStages(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.savePipeline = async (req, res, next) => {
  try {
    await Validation.HiringPipeline.savePipeline.validateAsync(req.body);
    const data = await HiringPipelineService.savePipeline(req, req.body);
    return res.success(constants.MESSAGE.HIRING_PIPELINE.SAVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.createStage = async (req, res, next) => {
  try {
    await Validation.HiringPipeline.createStage.validateAsync(req.body);
    const data = await HiringPipelineService.createStage(req, req.body);
    return res.success(constants.MESSAGE.HIRING_PIPELINE.STAGE_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.updateStage = async (req, res, next) => {
  try {
    await Validation.HiringPipeline.updateStage.validateAsync(req.body);
    const data = await HiringPipelineService.updateStage(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.HIRING_PIPELINE.STAGE_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.deleteStage = async (req, res, next) => {
  try {
    await HiringPipelineService.deleteStage(req, req.params.id);
    return res.success(constants.MESSAGE.HIRING_PIPELINE.STAGE_DELETED, { deleted: true });
  } catch (error) {
    next(error);
  }
};

module.exports.reorderStages = async (req, res, next) => {
  try {
    await Validation.HiringPipeline.reorderStages.validateAsync(req.body);
    const data = await HiringPipelineService.reorderStages(req, req.body);
    return res.success(constants.MESSAGE.HIRING_PIPELINE.REORDERED, data);
  } catch (error) {
    next(error);
  }
};
