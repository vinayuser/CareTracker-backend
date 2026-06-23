const router = require('express').Router();
const Controller = require('../controller');
const Auth = require('../common/authenticate');

// Unified auth
router.post('/auth/login', Controller.AdminAuthController.login);

// Public registration
router.get('/registration/check-user-id', Controller.RegistrationController.checkUserId);
router.post('/registration/account', Controller.RegistrationController.createAccount);
router.post('/registration/submit', Controller.RegistrationController.submit);
router.post('/registration/payment', Controller.RegistrationController.processPayment);
router.get('/invitations/validate', Controller.InvitationController.validate);

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
router.patch('/agency/caregivers/:id/password', Auth.authenticate('agency_owner'), Controller.AgencyCaregiverController.setPassword);

router.get('/agency/clients/stats', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getStats);
router.get('/agency/clients', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getAll);
router.get('/agency/clients/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.getById);
router.post('/agency/clients', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.create);
router.put('/agency/clients/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.update);
router.delete('/agency/clients/:id', Auth.authenticate('agency_owner', 'hr'), Controller.ClientController.remove);

router.get('/agency/care-plans/options', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getOptions);
router.get('/agency/care-plans/stats', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getStats);
router.get('/agency/care-plans', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getAll);
router.get('/agency/care-plans/:id', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.getById);
router.post('/agency/care-plans', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.create);
router.put('/agency/care-plans/:id', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.update);
router.delete('/agency/care-plans/:id', Auth.authenticate('agency_owner', 'hr'), Controller.CarePlanController.remove);

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

// Caregiver portal — /api/caregiver/*
router.get('/caregiver/profile', Auth.authenticate('caregiver'), Controller.CaregiverController.getProfile);

module.exports = router;
