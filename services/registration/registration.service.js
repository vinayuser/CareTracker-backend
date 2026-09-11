const Model = require('../../models/index');
const InvitationService = require('../admin/invitation.service');
const AgencyService = require('../admin/agency.service');
const {
  sendAgencyRegistrationWelcomeEmail,
  sendAdminAgencyOnboardedEmail,
  sendAgencyPaymentInvoiceEmail,
} = require('../common/mail.service');
const { getAdminEmails, agencyPortalUrl } = require('../common/notifyHelpers');
const {
  assertLoginIdentifiersAvailable,
} = require('../../common/emailAvailability');

const detectCardBrand = (digits) => {
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6/.test(digits)) return 'Discover';
  return 'Card';
};

const sanitizePaymentMethod = (payload = {}) => {
  const digits = String(payload.cardNumber || payload.last4 || '').replace(/\D/g, '');
  const last4 = String(payload.last4 || digits.slice(-4) || '').slice(-4);
  if (!last4) return null;
  const [expMonth, expYear] = String(payload.expiry || '').split('/');
  return {
    brand: payload.brand || detectCardBrand(digits),
    last4,
    expMonth: String(payload.expMonth || expMonth || '').trim(),
    expYear: String(payload.expYear || expYear || '').trim(),
    nameOnCard: String(payload.nameOnCard || '').trim(),
    isDefault: true,
  };
};

const resolvePendingInvitationExclude = async (invitationToken) => {
  if (!invitationToken) return {};
  const invitation = await Model.InvitationModel.findOne({
    token: invitationToken,
    status: 'Pending',
  }).select('_id');
  return invitation ? { invitationId: invitation._id } : {};
};

const checkUserIdAvailability = async (userId, invitationToken) => {
  const exclude = await resolvePendingInvitationExclude(invitationToken);
  await assertLoginIdentifiersAvailable({ userId, email: userId, exclude });
  return { available: true };
};

const createAccount = async (payload) => {
  const exclude = await resolvePendingInvitationExclude(payload.invitationToken);

  await assertLoginIdentifiersAvailable({
    email: payload.email,
    userId: payload.email,
    exclude,
  });

  const account = new Model.AgencyAccountModel({
    userId: payload.email.toLowerCase(),
    email: payload.email.toLowerCase(),
    fullName: payload.fullName,
    password: 'placeholder',
  });
  await account.setPassword(payload.password);
  await account.save();

  if (exclude.invitationId) {
    account.invitationId = exclude.invitationId;
    await account.save();
  }

  return { userId: account.userId, fullName: account.fullName };
};

const notifyRegistrationComplete = async (req, {
  agency,
  plan,
  ownerEmail,
  ownerName,
  transactionId,
  amount,
}) => {
  const loginUrl = agencyPortalUrl(req, '/login');
  const invoiceAmount = amount ?? plan?.price;

  if (ownerEmail) {
    try {
      await sendAgencyRegistrationWelcomeEmail({
        to: ownerEmail,
        ownerName,
        agencyName: agency.name,
        planName: plan?.name,
        planPrice: plan?.price,
        loginUrl,
      });
    } catch (err) {
      console.error('[registration] welcome email failed', err.message);
    }

    try {
      await sendAgencyPaymentInvoiceEmail({
        to: ownerEmail,
        ownerName,
        agencyName: agency.name,
        planName: plan?.name,
        amount: invoiceAmount,
        billingCycle: plan?.billingCycle || plan?.billing_cycle || 'month',
        transactionId,
        paidAt: new Date(),
      });
    } catch (err) {
      console.error('[registration] invoice email failed', err.message);
    }
  }

  try {
    const adminEmails = await getAdminEmails();
    await Promise.all(adminEmails.map((to) => sendAdminAgencyOnboardedEmail({
      to,
      agencyName: agency.name,
      ownerName,
      ownerEmail,
      planName: plan?.name,
      planPrice: plan?.price,
      transactionId,
    })));
  } catch (err) {
    console.error('[registration] admin onboard email failed', err.message);
  }
};

const submitRegistration = async (req, payload) => {
  let invitationDoc = null;
  if (payload.invitationToken) {
    const validated = await InvitationService.validateToken(payload.invitationToken);
    invitationDoc = validated.invitationDoc;
  }

  const plan = await Model.SubscriptionPlanModel.findById(payload.planId);
  if (!plan) throw new Error('Subscription Plan Not Found');

  const loginEmail = (payload.email || payload.userId || '').toLowerCase();
  const loginUserId = (payload.userId || payload.email || '').toLowerCase();
  let existingAccount = null;
  if (loginUserId) {
    existingAccount = await Model.AgencyAccountModel.findOne({ userId: loginUserId });
  }

  if (payload.userId && payload.password) {
    await assertLoginIdentifiersAvailable({
      email: loginEmail || loginUserId,
      userId: loginUserId,
      exclude: {
        invitationId: invitationDoc?._id,
        accountId: existingAccount?._id,
      },
    });
  }

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

  // One-time invite: invalidate immediately after agency is created
  if (payload.invitationToken) {
    await InvitationService.markAccepted(payload.invitationToken);
  }

  if (payload.userId && payload.password) {
    let account = existingAccount;
    if (!account) {
      account = new Model.AgencyAccountModel({
        userId: loginUserId,
        email: loginEmail || loginUserId,
        fullName: payload.fullName || '',
        role: 'AGENCY_OWNER',
        status: 'Active',
        password: 'placeholder',
      });
      await account.setPassword(payload.password);
    }
    account.agencyId = agency._id;
    account.role = account.role || 'AGENCY_OWNER';
    account.status = 'Active';
    if (invitationDoc) account.invitationId = invitationDoc._id;
    await account.save();
  }

  plan.assignedAgencies = plan.assignedAgencies || [];
  plan.assignedAgencies.push({ id: String(agency._id), name: agency.name });
  await plan.save();

  const ownerEmail = (payload.email || invitationDoc?.email || '').toLowerCase();
  const paymentMethod = payload.paymentMethod || sanitizePaymentMethod(payload);
  try {
    await AgencyService.recordSubscriptionPayment(agency._id, {
      plan,
      amount: payload.amount || plan.price,
      transactionId: payload.transactionId || `reg_${Date.now()}`,
      paymentMethod,
      status: 'Paid',
      paidAt: new Date(),
    });
  } catch (err) {
    console.error('[registration] billing record failed', err.message);
  }

  await notifyRegistrationComplete(req, {
    agency,
    plan,
    ownerEmail,
    ownerName: payload.fullName || agency.ownerName,
    transactionId: payload.transactionId || `reg_${Date.now()}`,
    amount: payload.amount || plan.price,
  });

  return AgencyService.formatAgency(agency);
};

const processPayment = async (payload) => {
  const plan = await Model.SubscriptionPlanModel.findById(payload.planId);
  if (!plan) throw new Error('Subscription Plan Not Found');

  const paymentMethod = sanitizePaymentMethod(payload);

  return {
    planId: String(plan._id),
    planName: plan.name,
    amount: payload.amount || plan.price,
    status: 'paid',
    transactionId: `pay_${Date.now()}`,
    billingCycle: plan.billingCycle || plan.billing_cycle || 'monthly',
    paymentMethod,
  };
};

module.exports = {
  checkUserIdAvailability,
  createAccount,
  submitRegistration,
  processPayment,
};
