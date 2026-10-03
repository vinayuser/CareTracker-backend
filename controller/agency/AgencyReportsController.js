const constants = require('../../common/constants');
const AdminEvvSummaryReportService = require('../../services/admin/adminEvvSummaryReport.service');
const AdminTimeCardService = require('../../services/admin/adminTimeCard.service');

const getAgencyId = (req) => {
  const account = req.agency_owner || req.hr;
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return String(agencyId);
};

/** Force report queries to the authenticated agency only. */
const scopedQuery = (req, extra = {}) => ({
  ...req.query,
  ...extra,
  agencyId: getAgencyId(req),
  agencyIds: getAgencyId(req),
});

module.exports.getEvvSummaryOptions = async (req, res, next) => {
  try {
    const data = await AdminEvvSummaryReportService.getOptions(scopedQuery(req));
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEvvSummary = async (req, res, next) => {
  try {
    const data = await AdminEvvSummaryReportService.getList(scopedQuery(req));
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.exportEvvSummary = async (req, res, next) => {
  try {
    const { filename, csv } = await AdminEvvSummaryReportService.exportCsv(scopedQuery(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports.getTimeCardOptions = async (req, res, next) => {
  try {
    const data = await AdminTimeCardService.getOptions();
    const agencyId = getAgencyId(req);
    return res.success(constants.MESSAGE.SUCCESS, {
      ...data,
      agencies: (data.agencies || []).filter((agency) => String(agency.id) === agencyId),
    });
  } catch (error) {
    next(error);
  }
};

module.exports.getTimeCards = async (req, res, next) => {
  try {
    const data = await AdminTimeCardService.getList(scopedQuery(req));
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getTimeCardDetail = async (req, res, next) => {
  try {
    const data = await AdminTimeCardService.getDetail(req.params.id, scopedQuery(req));
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.exportTimeCards = async (req, res, next) => {
  try {
    const { filename, csv } = await AdminTimeCardService.exportCsv(scopedQuery(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};
