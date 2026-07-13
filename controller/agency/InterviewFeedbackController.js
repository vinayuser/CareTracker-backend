const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { InterviewFeedbackService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = InterviewFeedbackService.getOptions();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.get = async (req, res, next) => {
  try {
    if (req.query.all === '1' || req.query.all === 'true') {
      const data = await InterviewFeedbackService.getAllForApplication(req, req.params.id);
      return res.success(constants.MESSAGE.SUCCESS, data);
    }
    const data = await InterviewFeedbackService.getForApplicationStage(
      req,
      req.params.id,
      req.query.stage_id || req.params.stageId,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.save = async (req, res, next) => {
  try {
    await Validation.InterviewFeedback.save.validateAsync(req.body);
    const data = await InterviewFeedbackService.saveFeedback(
      req,
      req.params.id,
      req.params.stageId,
      req.body,
    );
    return res.success(constants.MESSAGE.INTERVIEW_FEEDBACK.SAVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getPrint = async (req, res, next) => {
  try {
    const data = await InterviewFeedbackService.getPrintData(
      req,
      req.params.id,
      req.params.stageId,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
