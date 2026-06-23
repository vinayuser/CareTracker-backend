const Model = require('../../models/index');
const constants = require('../../common/constants');
const InvitationService = require('../admin/invitation.service');
const AgencyService = require('../admin/agency.service');

const checkUserIdAvailability = async (userId) => {
  const existing = await Model.AgencyAccountModel.findOne({
    userId: userId.toLowerCase(),
  });
  if (existing) throw new Error(constants.MESSAGE.USER.USER_ID_TAKEN);
  return { available: true };
};

const createAccount = async (payload) => {
  const existing = await Model.AgencyAccountModel.findOne({
    userId: payload.email.toLowerCase(),
  });
  if (existing) throw new Error(constants.MESSAGE.USER.USER_ID_TAKEN);

  const account = new Model.AgencyAccountModel({
    userId: payload.email.toLowerCase(),
    email: payload.email.toLowerCase(),
    fullName: payload.fullName,
    password: 'placeholder',
  });
  await account.setPassword(payload.password);
  await account.save();

  return { userId: account.userId, fullName: account.fullName };
};

const submitRegistration = async (payload) => {
  let invitation = null;
  if (payload.invitationToken) {
    const validated = await InvitationService.validateToken(payload.invitationToken);
    invitation = validated.invitation;
  }

  const plan = await Model.SubscriptionPlanModel.findById(payload.planId);
  if (!plan) throw new Error('Subscription Plan Not Found');

  const agency = await Model.AgencyModel.create({
    name: payload.agencyName,
    legalName: payload.agencyName,
    email: payload.email,
    phone: payload.phone || '',
    address: payload.address || '',
    website: payload.website || '',
    agencyType: payload.agencyType || '',
    yearEstablished: payload.yearEstablished || '',
    serviceAreas: payload.serviceAreas || [],
    description: payload.description || '',
    ownerName: payload.fullName || '',
    status: 'Active',
    subscriptionPlanId: plan._id,
    usage: { clients: 0, caregivers: 0, users: 1, branches: 1 },
  });

  if (payload.userId && payload.password) {
    let account = await Model.AgencyAccountModel.findOne({ userId: payload.userId.toLowerCase() });
    if (!account) {
      account = new Model.AgencyAccountModel({
        userId: payload.userId.toLowerCase(),
        email: payload.email?.toLowerCase() || payload.userId.toLowerCase(),
        fullName: payload.fullName || '',
        role: 'AGENCY_OWNER',
        status: 'Active',
        password: 'placeholder',
      });
      await account.setPassword(payload.password);
    }
    account.agencyId = agency._id;
    if (payload.invitationToken) {
      const invDoc = await Model.InvitationModel.findOne({ token: payload.invitationToken });
      if (invDoc) account.invitationId = invDoc._id;
    }
    await account.save();
  }

  plan.assignedAgencies = plan.assignedAgencies || [];
  plan.assignedAgencies.push({ id: String(agency._id), name: agency.name });
  await plan.save();

  if (payload.invitationToken) {
    await InvitationService.markAccepted(payload.invitationToken);
  }

  return AgencyService.formatAgency(agency);
};

const processPayment = async (payload) => {
  const plan = await Model.SubscriptionPlanModel.findById(payload.planId);
  if (!plan) throw new Error('Subscription Plan Not Found');

  return {
    planId: String(plan._id),
    planName: plan.name,
    amount: payload.amount || plan.price,
    status: 'paid',
    transactionId: `demo_${Date.now()}`,
  };
};

module.exports = {
  checkUserIdAvailability,
  createAccount,
  submitRegistration,
  processPayment,
};
