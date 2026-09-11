/**
 * Hard-delete cascade for an agency.
 *
 * All related Mongo delete operations live here so they can be reviewed
 * and extended later without hunting through controllers.
 *
 * Call order: related collections first → caller deletes the Agency document.
 */

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Model = require('../../models/index');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
};

const uploadsRoot = path.join(__dirname, '../../uploads');

const safeUnlinkUpload = async (relativePath) => {
  if (!relativePath) return;
  try {
    const full = path.join(uploadsRoot, String(relativePath).replace(/^uploads\//, ''));
    await fs.unlink(full);
  } catch {
    // File may already be gone
  }
};

/**
 * Delete every agency-scoped record for `agencyId`.
 * Returns a map of collection → deletedCount for logging / debugging.
 *
 * @param {string|import('mongoose').Types.ObjectId} agencyId
 * @returns {Promise<Record<string, number>>}
 */
const purgeAgencyRelatedData = async (agencyId) => {
  const id = toOid(agencyId);
  if (!id) throw new Error('Agency Not Found');

  const filter = { agencyId: id };
  const deleted = {};

  const agency = await Model.AgencyModel.findById(id).select('logoPath subscriptionPlanId').lean();
  if (!agency) throw new Error('Agency Not Found');

  // Collect upload paths before wiping documents
  const [documents, formSubmissions] = await Promise.all([
    Model.AgencyDocumentModel.find(filter).select('filePath').lean(),
    Model.CandidateFormSubmissionModel.find(filter).select('filledPdfPath').lean(),
  ]);

  // --- Edit this list to add or remove cascade targets ---
  const ops = [
    ['AgencyAccount', () => Model.AgencyAccountModel.deleteMany(filter)],
    ['HrStaff', () => Model.HrStaffModel.deleteMany(filter)],
    ['AgencyStage', () => Model.AgencyStageModel.deleteMany(filter)],
    ['JobPost', () => Model.JobPostModel.deleteMany(filter)],
    ['Candidate', () => Model.CandidateModel.deleteMany(filter)],
    ['CandidateApplication', () => Model.CandidateApplicationModel.deleteMany(filter)],
    ['CandidateStageAccess', () => Model.CandidateStageAccessModel.deleteMany(filter)],
    ['CandidateFormSubmission', () => Model.CandidateFormSubmissionModel.deleteMany(filter)],
    ['InterviewFeedback', () => Model.InterviewFeedbackModel.deleteMany(filter)],
    ['Client', () => Model.ClientModel.deleteMany(filter)],
    ['Lead', () => Model.LeadModel.deleteMany(filter)],
    ['AgencyCodeCounter', () => Model.AgencyCodeCounterModel.deleteMany(filter)],
    ['ClientAssessment', () => Model.ClientAssessmentModel.deleteMany(filter)],
    ['CarePlan', () => Model.CarePlanModel.deleteMany(filter)],
    ['CarePlanHistory', () => Model.CarePlanHistoryModel.deleteMany(filter)],
    ['ClientInsuranceIntake', () => Model.ClientInsuranceIntakeModel.deleteMany(filter)],
    ['EvvEnrollment', () => Model.EvvEnrollmentModel.deleteMany(filter)],
    ['VisitSchedule', () => Model.VisitScheduleModel.deleteMany(filter)],
    ['Visit', () => Model.VisitModel.deleteMany(filter)],
    ['EvvSettings', () => Model.EvvSettingsModel.deleteMany(filter)],
    ['ClientInvoice', () => Model.ClientInvoiceModel.deleteMany(filter)],
    ['AgencySubscriptionInvoice', () => Model.AgencySubscriptionInvoiceModel.deleteMany(filter)],
    ['AgencyDocument', () => Model.AgencyDocumentModel.deleteMany(filter)],
    ['AgencyNote', () => Model.AgencyNoteModel.deleteMany(filter)],
    ['Holiday', () => Model.HolidayModel.deleteMany(filter)],
    ['LeavePolicy', () => Model.LeavePolicyModel.deleteMany(filter)],
    ['CaregiverLeaveBalance', () => Model.CaregiverLeaveBalanceModel.deleteMany(filter)],
    ['LeaveRequest', () => Model.LeaveRequestModel.deleteMany(filter)],
  ];

  for (const [name, run] of ops) {
    // eslint-disable-next-line no-await-in-loop
    const result = await run();
    deleted[name] = result?.deletedCount || 0;
  }

  // Detach from subscription plan denormalized list
  if (agency.subscriptionPlanId) {
    await Model.SubscriptionPlanModel.updateOne(
      { _id: agency.subscriptionPlanId },
      { $pull: { assignedAgencies: { id: String(id) } } },
    );
  }

  // Best-effort filesystem cleanup
  await Promise.all([
    safeUnlinkUpload(agency.logoPath),
    ...documents.map((doc) => safeUnlinkUpload(doc.filePath)),
    ...formSubmissions.map((row) => safeUnlinkUpload(row.filledPdfPath)),
  ]);

  return deleted;
};

module.exports = {
  purgeAgencyRelatedData,
  toOid,
};
