const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const LeavePolicyService = require('./leavePolicy.service');
const {
  dateKeysBetween,
  formatMdY,
  getBlockingHolidayMap,
  applyLeaveRequestToVisits,
  clearLeaveRequestFromVisits,
} = require('./holidayLeaveVisits.service');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyIdFromAgencyReq = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const getCaregiver = (req) => req.caregiver;
const getCaregiverAgencyId = (req) => {
  const account = getCaregiver(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const formatRequest = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId);
  item.caregiverAccountId = String(doc.caregiverAccountId);
  item.startDisplay = formatMdY(item.startDate);
  item.endDisplay = formatMdY(item.endDate);
  item.rangeLabel = item.startDate === item.endDate
    ? formatMdY(item.startDate)
    : `${formatMdY(item.startDate)} – ${formatMdY(item.endDate)}`;
  item.reviewedByAccountId = item.reviewedByAccountId ? String(item.reviewedByAccountId) : null;
  return item;
};

const chargeableDates = async (agencyId, startDate, endDate) => {
  const keys = dateKeysBetween(startDate, endDate);
  if (!keys.length) return [];
  const holidayMap = await getBlockingHolidayMap(agencyId, startDate, endDate);
  return keys.filter((key) => !holidayMap.has(key));
};

const hasOverlap = async (agencyId, caregiverAccountId, startDate, endDate, excludeId) => {
  const filter = {
    agencyId,
    caregiverAccountId,
    status: { $in: ['Pending', 'Approved'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const count = await Model.LeaveRequestModel.countDocuments(filter);
  return count > 0;
};

const createRequest = async (req, payload) => {
  const caregiver = getCaregiver(req);
  const agencyId = getCaregiverAgencyId(req);
  const caregiverId = caregiver._id || caregiver.id;
  const startDate = String(payload.startDate || payload.start_date || '').slice(0, 10);
  const endDate = String(payload.endDate || payload.end_date || startDate).slice(0, 10);
  const typeKey = String(payload.typeKey || payload.type_key || '').trim();
  const reason = String(payload.reason || '').trim();

  if (!startDate || !endDate || startDate > endDate) {
    throw new Error(constants.MESSAGE.LEAVE.INVALID_DATES);
  }

  const dates = await chargeableDates(agencyId, startDate, endDate);
  if (!dates.length) throw new Error(constants.MESSAGE.LEAVE.NO_DAYS);

  if (await hasOverlap(agencyId, caregiverId, startDate, endDate)) {
    throw new Error(constants.MESSAGE.LEAVE.OVERLAP);
  }

  const year = Number(startDate.slice(0, 4));
  const balance = await LeavePolicyService.ensureCaregiverLeaveBalance(agencyId, caregiverId, year);
  const item = (balance.items || []).find((row) => row.key === typeKey);
  if (!item) throw new Error('Leave type not found');

  const available = (Number(item.allocated) || 0) - (Number(item.used) || 0) - (Number(item.pending) || 0);
  if (dates.length > available) throw new Error(constants.MESSAGE.LEAVE.INSUFFICIENT);

  const request = await Model.LeaveRequestModel.create({
    agencyId,
    caregiverAccountId: caregiverId,
    caregiverName: caregiver.fullName || caregiver.name || '',
    typeKey: item.key,
    typeName: item.name,
    startDate,
    endDate,
    dates,
    days: dates.length,
    reason,
    status: 'Pending',
  });

  item.pending = (Number(item.pending) || 0) + dates.length;
  await balance.save();
  return formatRequest(request);
};

const listMine = async (req) => {
  const caregiver = getCaregiver(req);
  const agencyId = getCaregiverAgencyId(req);
  const caregiverId = caregiver._id || caregiver.id;
  const year = Number(req.query.year) || new Date().getFullYear();
  const balance = await LeavePolicyService.getCaregiverBalance(agencyId, caregiverId, year);
  const list = await Model.LeaveRequestModel.find({
    agencyId,
    caregiverAccountId: caregiverId,
  }).sort({ createdAt: -1 }).limit(100);
  return {
    balance,
    list: list.map(formatRequest),
  };
};

const cancelMine = async (req, id) => {
  const caregiver = getCaregiver(req);
  const agencyId = getCaregiverAgencyId(req);
  const caregiverId = caregiver._id || caregiver.id;
  const request = await Model.LeaveRequestModel.findOne({
    _id: id,
    agencyId,
    caregiverAccountId: caregiverId,
  });
  if (!request) throw new Error(constants.MESSAGE.LEAVE.NOT_FOUND);
  if (request.status !== 'Pending') throw new Error('Only pending requests can be cancelled');

  const year = Number(request.startDate.slice(0, 4));
  const balance = await LeavePolicyService.ensureCaregiverLeaveBalance(agencyId, caregiverId, year);
  await LeavePolicyService.adjustBalance(balance, request.typeKey, 'pending', -request.days);
  request.status = 'Cancelled';
  await request.save();
  return formatRequest(request);
};

const listAgencyRequests = async (req, query = {}) => {
  const agencyId = getAgencyIdFromAgencyReq(req);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const status = String(query.status || 'All');
  const search = String(query.search || '').trim();

  const filter = { agencyId };
  if (status && status !== 'All') filter.status = status;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ caregiverName: regex }, { typeName: regex }, { reason: regex }];
  }

  const [total, rows] = await Promise.all([
    Model.LeaveRequestModel.countDocuments(filter),
    Model.LeaveRequestModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    list: rows.map(formatRequest),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
  };
};

const reviewRequest = async (req, id, action, note = '') => {
  const agencyId = getAgencyIdFromAgencyReq(req);
  const account = getAgencyAccount(req);
  const request = await Model.LeaveRequestModel.findOne({ _id: id, agencyId });
  if (!request) throw new Error(constants.MESSAGE.LEAVE.NOT_FOUND);
  if (request.status !== 'Pending') throw new Error('Only pending requests can be reviewed');

  const approved = action === 'approve';
  const year = Number(request.startDate.slice(0, 4));
  const balance = await LeavePolicyService.ensureCaregiverLeaveBalance(
    agencyId,
    request.caregiverAccountId,
    year,
  );
  await LeavePolicyService.adjustBalance(balance, request.typeKey, 'pending', -request.days);
  if (approved) {
    await LeavePolicyService.adjustBalance(balance, request.typeKey, 'used', request.days);
    await applyLeaveRequestToVisits(request);
  }

  request.status = approved ? 'Approved' : 'Rejected';
  request.reviewedByAccountId = account?._id || account?.id || null;
  request.reviewedByName = account?.fullName || account?.name || '';
  request.reviewedAt = new Date();
  request.reviewNote = note || '';
  await request.save();
  return formatRequest(request);
};

const getAgencyCaregiverBalance = async (req, caregiverId) => {
  const agencyId = getAgencyIdFromAgencyReq(req);
  const account = await Model.AgencyAccountModel.findOne({
    _id: caregiverId,
    agencyId,
    role: 'CAREGIVER',
  }).select('_id');
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);
  return LeavePolicyService.getCaregiverBalance(agencyId, account._id, Number(req.query.year) || new Date().getFullYear());
};

module.exports = {
  createRequest,
  listMine,
  cancelMine,
  listAgencyRequests,
  reviewRequest,
  getAgencyCaregiverBalance,
};
