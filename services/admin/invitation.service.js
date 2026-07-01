const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');

const formatInvitation = (invitation) => {
  const client = functions.toClientDoc(invitation);
  if (client) {
    client.subscriptionPlanId = String(invitation.subscriptionPlanId);
    client.invitedOn = invitation.invitedOn?.toISOString?.() || invitation.invitedOn;
    client.expiresAt = invitation.expiresAt?.toISOString?.() || invitation.expiresAt;
    if (client.token) {
      client.inviteUrl = functions.buildInviteUrl(client.token);
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

const getAll = async () => {
  const invitations = await Model.InvitationModel.find().sort({ createdAt: -1 });
  return invitations.map(formatInvitation);
};

const send = async (payload) => {
  const plan = await Model.SubscriptionPlanModel.findById(payload.subscriptionPlanId);
  if (!plan) throw new Error('Subscription Plan Not Found');

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

  const formatted = formatInvitation(invitation);
  return formatted;
};

const resend = async (id) => {
  const invitation = await Model.InvitationModel.findById(id);
  if (!invitation) throw new Error(constants.MESSAGE.INVITATION.NOT_FOUND);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  invitation.expiresAt = expiresAt;
  invitation.status = 'Pending';
  invitation.invitedOn = new Date();
  await invitation.save();

  return formatInvitation(invitation);
};

const validateToken = async (token) => {
  const invitation = await Model.InvitationModel.findOne({ token });
  if (!invitation) throw new Error(constants.MESSAGE.INVITATION.NOT_FOUND);
  if (invitation.status === 'Accepted') throw new Error(constants.MESSAGE.INVITATION.ALREADY_USED);
  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = 'Expired';
    await invitation.save();
    throw new Error(constants.MESSAGE.INVITATION.EXPIRED);
  }

  const plan = await Model.SubscriptionPlanModel.findById(invitation.subscriptionPlanId);
  return {
    invitation: formatInvitation(invitation),
    plan: functions.toClientDoc(plan),
  };
};

const markAccepted = async (token) => {
  const invitation = await Model.InvitationModel.findOne({ token });
  if (!invitation) return null;
  invitation.status = 'Accepted';
  await invitation.save();
  return formatInvitation(invitation);
};

module.exports = {
  getStats,
  getAll,
  send,
  resend,
  validateToken,
  markAccepted,
  formatInvitation,
};
