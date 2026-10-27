const constants = require('../../common/constants');
const LegalPageService = require('../../services/common/legalPage.service');

module.exports.getPublic = async (req, res, next) => {
  try {
    const data = await LegalPageService.getBySlug(req.params.slug);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.list = async (req, res, next) => {
  try {
    const data = await LegalPageService.listPages();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAdmin = async (req, res, next) => {
  try {
    const data = await LegalPageService.getBySlug(req.params.slug);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.save = async (req, res, next) => {
  try {
    const adminId = req.super_admin?._id || req.super_admin?.id || null;
    const data = await LegalPageService.savePage(req.params.slug, req.body || {}, adminId);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};
