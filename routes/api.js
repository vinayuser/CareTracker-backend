const router = require('express').Router();
const Controller = require('../controller');
const Auth = require('../common/authenticate');

// Unified auth
router.post('/auth/login', Controller.AdminAuthController.login);
router.get(
  '/auth/me',
  Auth.authenticate('super_admin', 'agency_owner', 'hr', 'caregiver'),
  Controller.AdminAuthController.me,
);

// Public registration
router.get('/registration/check-user-id', Controller.RegistrationController.checkUserId);
router.post('/registration/account', Controller.RegistrationController.createAccount);
router.post('/registration/submit', Controller.RegistrationController.submit);
router.post('/registration/payment', Controller.RegistrationController.processPayment);
router.get('/invitations/validate', Controller.InvitationController.validate);

// Public candidate hiring forms
router.get('/candidate-forms/:token', Controller.CandidateFormController.getPortal);
router.get('/candidate-forms/:token/:documentCode', Controller.CandidateFormController.getDocument);
router.put('/candidate-forms/:token/:documentCode', Controller.CandidateFormController.saveDraft);
router.post('/candidate-forms/:token/:documentCode/submit', Controller.CandidateFormController.submit);
router.post(
  '/candidate-forms/:token/:documentCode/submit-pdf',
  (req, res, next) => {
    require('../middleware/candidateFormUpload')(req, res, (err) => {
      if (err) return next(err);
      return Controller.CandidateFormController.submitPdf(req, res, next);
    });
  },
);

// Public plans (registration flow)
router.get('/subscription-plans/active', Controller.SubscriptionPlanController.getActive);

// Super admin — /api/admin/*
router.get('/admin/agencies', Auth.authenticate('super_admin'), Controller.AgencyController.getAll);
router.get('/admin/agencies/:id', Auth.authenticate('super_admin'), Controller.AgencyController.getById);
router.post('/admin/agencies', Auth.authenticate('super_admin'), Controller.AgencyController.create);
router.put('/admin/agencies/:id', Auth.authenticate('super_admin'), Controller.AgencyController.update);
router.delete('/admin/agencies/:id', Auth.authenticate('super_admin'), Controller.AgencyController.remove);

router.get('/admin/subscription-plans', Auth.authenticate('super_admin'), Controller.SubscriptionPlanController.getAll);
router.get('/admin/subscription-plans/:id', Auth.authenticate('super_admin'), Controller.SubscriptionPlanController.getById);
router.post('/admin/subscription-plans', Auth.authenticate('super_admin'), Controller.SubscriptionPlanController.create);
router.put('/admin/subscription-plans/:id', Auth.authenticate('super_admin'), Controller.SubscriptionPlanController.update);
router.delete('/admin/subscription-plans/:id', Auth.authenticate('super_admin'), Controller.SubscriptionPlanController.remove);

router.get('/admin/invitations/stats', Auth.authenticate('super_admin'), Controller.InvitationController.getStats);
router.get('/admin/invitations', Auth.authenticate('super_admin'), Controller.InvitationController.getAll);
router.post('/admin/invitations', Auth.authenticate('super_admin'), Controller.InvitationController.send);
router.post('/admin/invitations/:id/resend', Auth.authenticate('super_admin'), Controller.InvitationController.resend);

// Agency portal — /api/agency/*
router.get('/agency/hr-staff/stats', Auth.authenticate('agency_owner', 'hr'), Controller.HrStaffController.getStats);
router.get('/agency/hr-staff', Auth.authenticate('agency_owner', 'hr'), Controller.HrStaffController.getAll);
router.get('/agency/hr-staff/:id', Auth.authenticate('agency_owner', 'hr'), Controller.HrStaffController.getById);
router.post('/agency/hr-staff', Auth.authenticate('agency_owner'), Controller.HrStaffController.create);
router.put('/agency/hr-staff/:id', Auth.authenticate('agency_owner'), Controller.HrStaffController.update);
router.patch('/agency/hr-staff/:id/status', Auth.authenticate('agency_owner'), Controller.HrStaffController.updateStatus);
router.patch('/agency/hr-staff/:id/password', Auth.authenticate('agency_owner'), Controller.HrStaffController.setPassword);
router.post('/agency/hr-staff/:id/email', Auth.authenticate('agency_owner'), Controller.HrStaffController.sendEmail);

router.get('/agency/hiring-pipeline/documents', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.getDocuments);
router.get('/agency/hiring-pipeline', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.getPipeline);
router.get('/agency/hiring-pipeline/stages', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.getStages);
router.put('/agency/hiring-pipeline', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.savePipeline);
router.post('/agency/hiring-pipeline/stages', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.createStage);
router.put('/agency/hiring-pipeline/stages/:id', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.updateStage);
router.delete('/agency/hiring-pipeline/stages/:id', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.deleteStage);
router.post('/agency/hiring-pipeline/stages/reorder', Auth.authenticate('agency_owner', 'hr'), Controller.HiringPipelineController.reorderStages);

router.get('/agency/jobs', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.getAll);
router.get('/agency/jobs/:id', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.getById);
router.post('/agency/jobs', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.create);
router.put('/agency/jobs/:id', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.update);
router.delete('/agency/jobs/:id', Auth.authenticate('agency_owner'), Controller.JobPostController.remove);
router.post('/agency/jobs/generate-ai', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.generateAi);
router.post('/agency/jobs/:id/complete-hiring', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.completeJobHiring);
router.post('/agency/jobs/:id/reopen-hiring', Auth.authenticate('agency_owner', 'hr'), Controller.JobPostController.reopenJobHiring);

router.get('/agency/caregivers/stats', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.getStats);
router.get('/agency/caregivers', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.getAll);
router.get('/agency/caregivers/:id', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.getById);
router.put('/agency/caregivers/:id', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.update);
router.patch('/agency/caregivers/:id/status', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.updateStatus);
router.patch('/agency/caregivers/:id/password', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.setPassword);
router.post('/agency/caregivers/:id/email', Auth.authenticate('agency_owner', 'hr'), Controller.AgencyCaregiverController.sendEmail);

router.get('/agency/clients/options', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getOptions);
router.get('/agency/clients/stats', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getStats);
router.get('/agency/clients', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getAll);
router.get('/agency/clients/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getById);
router.post('/agency/clients', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.create);
router.put('/agency/clients/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.update);
router.delete('/agency/clients/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.remove);

router.get('/agency/assessments/options', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.getOptions);
router.get('/agency/assessments/stats', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.getStats);
router.get('/agency/assessments', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.getAll);
router.get('/agency/assessments/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.getById);
router.post('/agency/assessments', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.create);
router.put('/agency/assessments/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.update);
router.delete('/agency/assessments/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.remove);
router.post('/agency/assessments/:id/generate-quote', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.generateQuote);
router.post('/agency/assessments/:id/accept-quote', Auth.authenticate('agency_owner', 'hr'), Controller.ClientAssessmentController.acceptQuote);

router.get('/agency/care-plans/options', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getOptions);
router.get('/agency/care-plans/stats', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getStats);
router.get('/agency/care-plans', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getAll);
router.get('/agency/care-plans/:id', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getById);
router.post('/agency/care-plans', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.create);
router.put('/agency/care-plans/:id', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.update);
router.delete('/agency/care-plans/:id', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.remove);

router.get('/agency/insurance-intakes/options', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.getOptions);
router.get('/agency/insurance-intakes/stats', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.getStats);
router.get('/agency/insurance-intakes', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.getAll);
router.get('/agency/insurance-intakes/:id', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.getById);
router.post('/agency/insurance-intakes', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.create);
router.put('/agency/insurance-intakes/:id', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.update);
router.delete('/agency/insurance-intakes/:id', Auth.authenticate('agency_owner', 'hr'), Controller.InsuranceIntakeController.remove);

router.get('/agency/evv-enrollments/options', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.getOptions);
router.get('/agency/evv-enrollments/stats', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.getStats);
router.get('/agency/evv-enrollments', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.getAll);
router.get('/agency/evv-enrollments/:id', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.getById);
router.put('/agency/evv-enrollments/:id', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.update);
router.post('/agency/evv-enrollments/:id/verify', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.verify);
router.delete('/agency/evv-enrollments/:id', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.remove);
router.post('/agency/evv-enrollments/sync/:carePlanId', Auth.authenticate('agency_owner', 'hr'), Controller.EvvEnrollmentController.syncCarePlan);

router.get('/agency/visit-schedules/options', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getOptions);
router.get('/agency/visit-schedules/stats', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getStats);
router.get('/agency/visit-schedules/care-plan/:carePlanId/sources', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getCarePlanSources);
router.get('/agency/visit-schedules', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getAll);
router.get('/agency/visit-schedules/:id', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getById);
router.post('/agency/visit-schedules', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.create);
router.put('/agency/visit-schedules/:id', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.update);
router.delete('/agency/visit-schedules/:id', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.remove);
router.post('/agency/visit-schedules/:id/regenerate', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.regenerate);
router.get('/agency/visits', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getVisits);
router.post('/agency/visits/:id/approve', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.approveVisit);
router.post('/agency/visits/:id/reject', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.rejectVisit);
router.get('/agency/evv/dashboard', Auth.authenticate('agency_owner', 'hr'), Controller.VisitScheduleController.getEvvDashboard);

router.get('/agency/job-applications/stats', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.getStats);
router.get('/agency/job-applications/job/:jobId/stage/:stageId', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.getByJobAndStage);
router.get('/agency/job-applications/job/:jobId/rejected', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.getRejectedByJob);
router.get('/agency/job-applications', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.getApplications);
router.post('/agency/job-applications', Auth.authenticate('agency_owner', 'hr'), require('../middleware/candidateUpload'), Controller.CandidateApplicationController.apply);
router.get('/agency/job-applications/hired/:jobId', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.getHired);
router.get('/agency/job-applications/:id/stage-info', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.getStageInfo);
router.post('/agency/job-applications/:id/set-stage', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.setStage);
router.post('/agency/job-applications/:id/next-stage', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.moveToNextStage);
router.post('/agency/job-applications/:id/previous-stage', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.moveToPreviousStage);
router.post('/agency/job-applications/:id/reject', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.reject);
router.post('/agency/job-applications/:id/undo-hire', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.undoHire);
router.post('/agency/job-applications/:id/complete-hire', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.completeHire);
router.get('/agency/job-applications/:id/form-submissions', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateFormController.getSubmissions);
router.get('/agency/job-applications/:id/form-submissions/:submissionId/print', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateFormController.getPrintData);
router.post('/agency/job-applications/:id/resend-form-email', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateFormController.resendEmail);
router.post('/agency/job-applications/:id/email', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateApplicationController.sendEmail);
router.post('/agency/job-applications/:id/form-submissions/:documentCode/reset', Auth.authenticate('agency_owner', 'hr'), Controller.CandidateFormController.resetSubmission);
router.get('/agency/job-applications/:id/interview-feedback', Auth.authenticate('agency_owner', 'hr'), Controller.InterviewFeedbackController.get);
router.put('/agency/job-applications/:id/interview-feedback/:stageId', Auth.authenticate('agency_owner', 'hr'), Controller.InterviewFeedbackController.save);
router.get('/agency/job-applications/:id/interview-feedback/:stageId/print', Auth.authenticate('agency_owner', 'hr'), Controller.InterviewFeedbackController.getPrint);
router.get('/agency/interview-feedback/options', Auth.authenticate('agency_owner', 'hr'), Controller.InterviewFeedbackController.getOptions);

// Caregiver portal — /api/caregiver/*
router.get('/caregiver/profile', Auth.authenticate('caregiver'), Controller.CaregiverController.getProfile);
router.get('/caregiver/dashboard', Auth.authenticate('caregiver'), Controller.VisitScheduleController.getCaregiverDashboard);
router.get('/caregiver/evv-enrollments', Auth.authenticate('caregiver'), Controller.CaregiverEvvEnrollmentController.getAll);
router.get('/caregiver/evv-enrollments/:id', Auth.authenticate('caregiver'), Controller.CaregiverEvvEnrollmentController.getById);
router.post('/caregiver/evv-enrollments/:id/submit', Auth.authenticate('caregiver'), Controller.CaregiverEvvEnrollmentController.submit);
router.get('/caregiver/visits', Auth.authenticate('caregiver'), Controller.VisitScheduleController.getCaregiverVisits);
router.post('/caregiver/visits/:id/check-in', Auth.authenticate('caregiver'), Controller.VisitScheduleController.checkIn);
router.post('/caregiver/visits/:id/check-out', Auth.authenticate('caregiver'), Controller.VisitScheduleController.checkOut);

module.exports = router;
