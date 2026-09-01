const Model = require('../models/index');
const constants = require('./constants');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeUserId = (userId) => String(userId || '').trim().toLowerCase();

/**
 * Ensure an email is not already used by any login-capable account or profile
 * (admin, agency account, HR, candidate, client, pending invitation).
 */
const assertEmailGloballyAvailable = async (email, exclude = {}) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const {
    adminId,
    accountId,
    hrStaffId,
    candidateId,
    clientId,
    invitationId,
  } = exclude;

  const [
    admin,
    account,
    hrStaff,
    candidate,
    client,
    invitation,
  ] = await Promise.all([
    Model.AdminModel.findOne({
      email: normalized,
      ...(adminId ? { _id: { $ne: adminId } } : {}),
    }).select('_id role'),
    Model.AgencyAccountModel.findOne({
      email: normalized,
      ...(accountId ? { _id: { $ne: accountId } } : {}),
    }).select('_id role'),
    Model.HrStaffModel.findOne({
      email: normalized,
      ...(hrStaffId ? { _id: { $ne: hrStaffId } } : {}),
      ...(accountId ? { accountId: { $ne: accountId } } : {}),
    }).select('_id'),
    Model.CandidateModel.findOne({
      email: normalized,
      ...(candidateId ? { _id: { $ne: candidateId } } : {}),
    }).select('_id'),
    Model.ClientModel.findOne({
      email: normalized,
      ...(clientId ? { _id: { $ne: clientId } } : {}),
    }).select('_id'),
    Model.InvitationModel.findOne({
      email: normalized,
      status: 'Pending',
      ...(invitationId ? { _id: { $ne: invitationId } } : {}),
    }).select('_id'),
  ]);

  if (admin || account || hrStaff || candidate || client || invitation) {
    throw new Error(constants.MESSAGE.USER.EMAIL_ALREADY_IN_USE);
  }
};

/** Ensure agency login userId is not taken by another account. */
const assertUserIdAvailable = async (userId, excludeAccountId) => {
  const normalized = normalizeUserId(userId);
  if (!normalized) return;

  const clash = await Model.AgencyAccountModel.findOne({
    userId: normalized,
    ...(excludeAccountId ? { _id: { $ne: excludeAccountId } } : {}),
  }).select('_id');

  if (clash) {
    throw new Error(constants.MESSAGE.USER.USER_ID_TAKEN);
  }
};

/**
 * Validate email + login userId together (userId must be unique; if it looks like an email,
 * it must also be globally available as an email address).
 */
const assertLoginIdentifiersAvailable = async ({
  email,
  userId,
  exclude = {},
}) => {
  await assertEmailGloballyAvailable(email, exclude);
  await assertUserIdAvailable(userId, exclude.accountId);

  const normalizedEmail = normalizeEmail(email);
  const normalizedUserId = normalizeUserId(userId);
  if (
    normalizedUserId
    && normalizedUserId.includes('@')
    && normalizedUserId !== normalizedEmail
  ) {
    await assertEmailGloballyAvailable(normalizedUserId, exclude);
  }
};

module.exports = {
  normalizeEmail,
  normalizeUserId,
  assertEmailGloballyAvailable,
  assertUserIdAvailable,
  assertLoginIdentifiersAvailable,
};
