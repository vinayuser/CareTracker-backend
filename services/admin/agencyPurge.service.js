/**
 * Hard-delete cascade for an agency.
 *
 * Deletes every agency-scoped Mongo document and best-effort upload files
 * so no orphan records remain after the Agency document is removed.
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
  const raw = String(relativePath).trim();
  // Skip data URLs / remote URLs — only local upload paths
  if (!raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return;
  try {
    const full = path.join(uploadsRoot, raw.replace(/^uploads\//, ''));
    await fs.unlink(full);
  } catch {
    // File may already be gone
  }
};

/** Match agencyId whether stored as ObjectId or string (legacy / edge cases). */
const agencyFilter = (id) => {
  const idStr = String(id);
  return { $or: [{ agencyId: id }, { agencyId: idStr }] };
};

const collectPaths = (rows, ...fields) => {
  const out = [];
  for (const row of rows || []) {
    for (const field of fields) {
      const value = row?.[field];
      if (value) out.push(value);
    }
  }
  return out;
};

const collectInsuranceDocPaths = (intakes) => {
  const out = [];
  for (const intake of intakes || []) {
    const docs = intake?.formData?.requiredDocuments || {};
    for (const entry of Object.values(docs)) {
      if (entry?.path) out.push(entry.path);
    }
  }
  return out;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

  const filter = agencyFilter(id);
  const deleted = {};

  const agency = await Model.AgencyModel.findById(id)
    .select('logoPath subscriptionPlanId name email')
    .lean();
  if (!agency) throw new Error('Agency Not Found');

  const idStr = String(id);
  const agencyEmail = String(agency.email || '').trim().toLowerCase();
  const agencyName = String(agency.name || '').trim();

  // Include owner accounts linked only by email (legacy rows with missing agencyId)
  const accountLookup = {
    $or: [
      ...filter.$or,
      ...(agencyEmail
        ? [{ email: agencyEmail }, { userId: agencyEmail }]
        : []),
    ],
  };

  // Collect upload paths before wiping documents
  const [
    documents,
    formSubmissions,
    accounts,
    clients,
    candidates,
    invoices,
    assessments,
    insuranceIntakes,
  ] = await Promise.all([
    Model.AgencyDocumentModel.find(filter).select('filePath').lean(),
    Model.CandidateFormSubmissionModel.find(filter).select('filledPdfPath').lean(),
    Model.AgencyAccountModel.find(accountLookup).select('profilePicPath invitationId email userId role').lean(),
    Model.ClientModel.find(filter).select('profilePicPath').lean(),
    Model.CandidateModel.find(filter).select('resumePath profilePicPath').lean(),
    Model.ClientInvoiceModel.find(filter).select('pdfPath').lean(),
    Model.ClientAssessmentModel.find(filter).select('assessorPhoto').lean(),
    Model.ClientInsuranceIntakeModel.find(filter).select('formData.requiredDocuments').lean(),
  ]);

  const ownerAccounts = (accounts || []).filter((row) => row.role === 'AGENCY_OWNER');
  const ownerEmails = [...new Set(
    [
      agencyEmail,
      ...ownerAccounts.flatMap((row) => [row.email, row.userId]),
      ...accounts.flatMap((row) => (row.role === 'AGENCY_OWNER' ? [row.email, row.userId] : [])),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  )];

  // Delete login accounts by agencyId OR owner/agency email (prevents re-invite blocks)
  const accountDeleteFilter = {
    $or: [
      ...filter.$or,
      ...ownerEmails.flatMap((email) => [{ email }, { userId: email }]),
    ],
  };

  const uploadPaths = [
    agency.logoPath,
    ...collectPaths(documents, 'filePath'),
    ...collectPaths(formSubmissions, 'filledPdfPath'),
    ...collectPaths(accounts, 'profilePicPath'),
    ...collectPaths(clients, 'profilePicPath'),
    ...collectPaths(candidates, 'resumePath', 'profilePicPath'),
    ...collectPaths(invoices, 'pdfPath'),
    ...collectPaths(assessments, 'assessorPhoto'),
    ...collectInsuranceDocPaths(insuranceIntakes),
  ].filter(Boolean);

  // --- Cascade targets: every model keyed by agencyId ---
  const ops = [
    ['AgencyAccount', Model.AgencyAccountModel, accountDeleteFilter],
    ['HrStaff', Model.HrStaffModel, {
      $or: [
        ...filter.$or,
        ...(ownerEmails.length ? [{ email: { $in: ownerEmails } }] : []),
      ],
    }],
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
  ];

  for (const [name, model, customFilter] of ops) {
    // eslint-disable-next-line no-await-in-loop
    const result = await model.deleteMany(customFilter || filter);
    deleted[name] = result?.deletedCount || 0;
  }

  // Remove invitations for this agency (email / agencyId / invitationId / name)
  const invitationIds = [...new Set(
    [...ownerAccounts, ...accounts]
      .map((row) => row.invitationId)
      .filter(Boolean)
      .map((value) => String(value)),
  )]
    .map((value) => toOid(value))
    .filter(Boolean);

  const inviteClauses = [];
  if (ownerEmails.length) {
    inviteClauses.push({ email: { $in: ownerEmails } });
  }
  inviteClauses.push({ agencyId: id }, { agencyId: idStr });
  if (invitationIds.length) inviteClauses.push({ _id: { $in: invitationIds } });
  if (agencyName) {
    inviteClauses.push({ agencyName: new RegExp(`^${escapeRegex(agencyName)}$`, 'i') });
  }

  const inviteResult = inviteClauses.length
    ? await Model.InvitationModel.deleteMany({ $or: inviteClauses })
    : { deletedCount: 0 };
  deleted.Invitation = inviteResult?.deletedCount || 0;

  // Detach from every subscription plan denormalized list (not only current plan)
  const planResult = await Model.SubscriptionPlanModel.updateMany(
    { 'assignedAgencies.id': idStr },
    { $pull: { assignedAgencies: { id: idStr } } },
  );
  deleted.SubscriptionPlanAssigned = planResult?.modifiedCount || 0;

  // Best-effort filesystem cleanup
  await Promise.all(uploadPaths.map((p) => safeUnlinkUpload(p)));

  // Verify nothing agency-scoped remains
  const leftoverChecks = await Promise.all(
    ops.map(async ([name, model]) => {
      const count = await model.countDocuments(filter);
      return count > 0 ? { name, count } : null;
    }),
  );
  const leftovers = leftoverChecks.filter(Boolean);
  if (leftovers.length) {
    const detail = leftovers.map((row) => `${row.name}:${row.count}`).join(', ');
    throw new Error(`Agency purge incomplete — remaining records: ${detail}`);
  }

  return deleted;
};

module.exports = {
  purgeAgencyRelatedData,
  toOid,
};
