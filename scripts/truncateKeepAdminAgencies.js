/**
 * Truncate operational data — keep platform admins, agencies, subscription plans,
 * PDF document templates, and agency owner login accounts.
 *
 * Usage:
 *   node scripts/truncateKeepAdminAgencies.js --confirm
 */

require('dotenv').config({ path: require('path').join(__dirname, '../config/.env') });
const mongoose = require('mongoose');
const Model = require('../models/index');

const confirmed = process.argv.includes('--confirm');

const OPERATIONAL_MODELS = [
  ['HrStaff', Model.HrStaffModel],
  ['AgencyStage', Model.AgencyStageModel],
  ['JobPost', Model.JobPostModel],
  ['Candidate', Model.CandidateModel],
  ['CandidateApplication', Model.CandidateApplicationModel],
  ['CandidateStageAccess', Model.CandidateStageAccessModel],
  ['CandidateFormSubmission', Model.CandidateFormSubmissionModel],
  ['InterviewFeedback', Model.InterviewFeedbackModel],
  ['Client', Model.ClientModel],
  ['Lead', Model.LeadModel],
  ['AgencyCodeCounter', Model.AgencyCodeCounterModel],
  ['ClientAssessment', Model.ClientAssessmentModel],
  ['CarePlan', Model.CarePlanModel],
  ['CarePlanHistory', Model.CarePlanHistoryModel],
  ['ClientInsuranceIntake', Model.ClientInsuranceIntakeModel],
  ['EvvEnrollment', Model.EvvEnrollmentModel],
  ['VisitSchedule', Model.VisitScheduleModel],
  ['Visit', Model.VisitModel],
  ['EvvSettings', Model.EvvSettingsModel],
  ['ClientInvoice', Model.ClientInvoiceModel],
  ['AgencySubscriptionInvoice', Model.AgencySubscriptionInvoiceModel],
  ['AgencyDocument', Model.AgencyDocumentModel],
  ['AgencyNote', Model.AgencyNoteModel],
  ['Holiday', Model.HolidayModel],
  ['LeavePolicy', Model.LeavePolicyModel],
  ['CaregiverLeaveBalance', Model.CaregiverLeaveBalanceModel],
  ['LeaveRequest', Model.LeaveRequestModel],
  ['Invitation', Model.InvitationModel],
  ['Notification', Model.NotificationModel],
];

(async () => {
  if (!confirmed) {
    console.error('Refusing to run without --confirm');
    console.error('Usage: node scripts/truncateKeepAdminAgencies.js --confirm');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const [adminCount, agencyCount, planCount, docCount, ownerCount, nonOwnerCount] = await Promise.all([
    Model.AdminModel.countDocuments(),
    Model.AgencyModel.countDocuments(),
    Model.SubscriptionPlanModel.countDocuments(),
    Model.DocumentModel.countDocuments(),
    Model.AgencyAccountModel.countDocuments({ role: 'AGENCY_OWNER' }),
    Model.AgencyAccountModel.countDocuments({ role: { $ne: 'AGENCY_OWNER' } }),
  ]);

  console.log('Keeping:');
  console.log(`  Admins: ${adminCount}`);
  console.log(`  Agencies: ${agencyCount}`);
  console.log(`  Subscription plans: ${planCount}`);
  console.log(`  Document templates: ${docCount}`);
  console.log(`  Agency owner accounts: ${ownerCount}`);
  console.log(`Removing non-owner agency accounts: ${nonOwnerCount}`);

  const deleted = {};

  for (const [name, model] of OPERATIONAL_MODELS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await model.deleteMany({});
    deleted[name] = result?.deletedCount || 0;
  }

  const nonOwnerAccounts = await Model.AgencyAccountModel.deleteMany({ role: { $ne: 'AGENCY_OWNER' } });
  deleted.AgencyAccountNonOwner = nonOwnerAccounts?.deletedCount || 0;

  const usageReset = await Model.AgencyModel.updateMany(
    {},
    {
      $set: {
        'usage.clients': 0,
        'usage.caregivers': 0,
        'usage.users': 0,
        'usage.branches': 0,
      },
    },
  );
  deleted.AgencyUsageReset = usageReset?.modifiedCount || 0;

  console.log('\nDeleted counts:');
  Object.entries(deleted).forEach(([key, count]) => {
    console.log(`  ${key}: ${count}`);
  });

  const verify = await Promise.all([
    Model.LeadModel.countDocuments(),
    Model.ClientModel.countDocuments(),
    Model.ClientAssessmentModel.countDocuments(),
    Model.AgencyAccountModel.countDocuments({ role: { $ne: 'AGENCY_OWNER' } }),
  ]);

  console.log('\nVerify remaining operational rows:');
  console.log(`  Leads: ${verify[0]}`);
  console.log(`  Clients: ${verify[1]}`);
  console.log(`  Assessments: ${verify[2]}`);
  console.log(`  Non-owner accounts: ${verify[3]}`);

  await mongoose.disconnect();
  console.log('\nDone. Admins, agencies, plans, templates, and owner accounts were kept.');
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
