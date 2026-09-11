const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { assertEmailGloballyAvailable } = require('../../common/emailAvailability');
const { sendAgencyInvitationEmail } = require('../common/mail.service');

const formatInvitation = (invitation, req) => {
  const client = functions.toClientDoc(invitation);
  if (client) {
    client.subscriptionPlanId = String(invitation.subscriptionPlanId);
    client.invitedOn = invitation.invitedOn?.toISOString?.() || invitation.invitedOn;
    client.expiresAt = invitation.expiresAt?.toISOString?.() || invitation.expiresAt;
    if (client.token) {
      client.inviteUrl = functions.buildInviteUrl(client.token, req);
    }
  }
  return client;
};

const getStats = async () => {
  const invitations = await Model.InvitationModel.find();
  return {
    total: invitations.length,
    accepted: invitations.filter((inv) => inv.status === 'Accepted').length,
    pending: invitations.filter((inv) => inv.status === 'Pending').length,
    expired: invitations.filter((inv) => inv.status === 'Expired').length,
  };
};

const getAll = async (req) => {
  const invitations = await Model.InvitationModel.find().sort({ createdAt: -1 });
  return invitations.map((inv) => formatInvitation(inv, req));
};

const deliverInvitationEmail = async (invitation, req) => {
  const inviteUrl = functions.buildInviteUrl(invitation.token, req);
  try {
    await sendAgencyInvitationEmail({
      to: invitation.email,
      agencyName: invitation.agencyName,
      planName: invitation.planName,
      planPrice: invitation.planPrice,
      message: invitation.message,
      inviteUrl,
      expiresAt: invitation.expiresAt,
    });
  } catch (err) {
    console.error('[invitation] email failed', err.message);
  }
  return inviteUrl;
};

const send = async (req, payload) => {
  const plan = await Model.SubscriptionPlanModel.findById(payload.subscriptionPlanId);
  if (!plan) throw new Error('Subscription Plan Not Found');

  await assertEmailGloballyAvailable(payload.email);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invitation = await Model.InvitationModel.create({
    token: functions.generateInviteToken(),
    agencyName: payload.agencyName,
    email: payload.email.toLowerCase(),
    message: payload.message || '',
    subscriptionPlanId: plan._id,
    planName: plan.name,
    planPrice: plan.price,
    status: 'Pending',
    invitedOn: new Date(),
    expiresAt,
  });

  const inviteUrl = await deliverInvitationEmail(invitation, req);
  const formatted = formatInvitation(invitation, req);
  formatted.inviteUrl = inviteUrl;
  return formatted;
};

const resend = async (req, id) => {
  const invitation = await Model.InvitationModel.findById(id);
  if (!invitation) throw new Error(constants.MESSAGE.INVITATION.NOT_FOUND);
  if (invitation.status === 'Accepted') {
    throw new Error(constants.MESSAGE.INVITATION.ALREADY_USED);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  invitation.expiresAt = expiresAt;
  invitation.status = 'Pending';
  invitation.invitedOn = new Date();
  await invitation.save();

  const inviteUrl = await deliverInvitationEmail(invitation, req);
  const formatted = formatInvitation(invitation, req);
  formatted.inviteUrl = inviteUrl;
  return formatted;
};

const remove = async (id) => {
  const invitation = await Model.InvitationModel.findById(id);
  if (!invitation) throw new Error(constants.MESSAGE.INVITATION.NOT_FOUND);
  if (invitation.status === 'Accepted') {
    throw new Error(constants.MESSAGE.INVITATION.CANNOT_DELETE_ACCEPTED);
  }
  await invitation.deleteOne();
  return { id: String(id) };
};

const validateToken = async (token) => {
  const invitation = await Model.InvitationModel.findOne({ token });
  if (!invitation) throw new Error(constants.MESSAGE.INVITATION.NOT_FOUND);
  if (invitation.status === 'Accepted') throw new Error(constants.MESSAGE.INVITATION.ALREADY_USED);
  if (invitation.status === 'Expired' || new Date(invitation.expiresAt) < new Date()) {
    if (invitation.status !== 'Expired') {
      invitation.status = 'Expired';
      await invitation.save();
    }
    throw new Error(constants.MESSAGE.INVITATION.EXPIRED);
  }

  const plan = await Model.SubscriptionPlanModel.findById(invitation.subscriptionPlanId);
  return {
    invitation: formatInvitation(invitation),
    invitationDoc: invitation,
    plan: functions.toClientDoc(plan),
  };
};

/** Atomically mark a pending invite Accepted (one-time use). */
const markAccepted = async (token) => {
  const invitation = await Model.InvitationModel.findOneAndUpdate(
    { token, status: 'Pending' },
    { $set: { status: 'Accepted' } },
    { new: true },
  );
  if (!invitation) {
    const existing = await Model.InvitationModel.findOne({ token });
    if (!existing) return null;
    return formatInvitation(existing);
  }
  return formatInvitation(invitation);
};

module.exports = {
  getStats,
  getAll,
  send,
  resend,
  remove,
  validateToken,
  markAccepted,
  formatInvitation,
};
