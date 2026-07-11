require('module-alias/register');
require('dotenv').config({ path: require('path').resolve(__dirname, '../config/.env') });

const connection = require('../common/connection');
const { DEFAULT_HR_MODULES } = require('../common/agencyModules');
const Model = require('../models/index');
const { HiringPipelineService } = require('../services');
const HIRING_DOCUMENTS = require('./documents');

const DEFAULT_PLANS = [
  {
    name: 'Basic Plan',
    description: 'Standard features for small teams',
    iconColor: 'bg-violet-100 text-violet-600',
    price: 99,
    billingCycle: 'monthly',
    status: 'Active',
    startDate: '2024-05-01',
    endDate: '2025-05-01',
    limits: { maxClients: 50, maxCaregivers: 25, maxUsers: 5, maxBranches: 1 },
    duration: { type: 'dueDate', dueDate: '2025-05-01', value: 12, unit: 'months' },
    selectedFeatures: ['Client Management', 'Scheduling & Appointments'],
    customFeatures: [],
    features: ['Client Management', 'Scheduling & Appointments'],
    assignedAgencies: [],
    isActive: true,
    createdAt: '2024-05-01',
  },
  {
    name: 'Pro Plan',
    description: 'Advanced features for growing agencies',
    iconColor: 'bg-blue-100 text-blue-600',
    price: 199,
    billingCycle: 'monthly',
    status: 'Active',
    startDate: '2024-06-15',
    endDate: '2025-06-15',
    limits: { maxClients: 200, maxCaregivers: 100, maxUsers: 15, maxBranches: 3 },
    duration: { type: 'dueDate', dueDate: '2025-06-15', value: 12, unit: 'months' },
    selectedFeatures: ['Client Management', 'Care Plan Management', 'Scheduling & Appointments', 'Reports & Analytics'],
    customFeatures: [],
    features: ['Client Management', 'Care Plan Management', 'Scheduling & Appointments', 'Reports & Analytics'],
    assignedAgencies: [],
    isActive: true,
    createdAt: '2024-06-15',
  },
  {
    name: 'Enterprise Plan',
    description: 'Full platform access for large organizations',
    iconColor: 'bg-emerald-100 text-emerald-600',
    price: 399,
    billingCycle: 'monthly',
    status: 'Active',
    startDate: '2024-07-01',
    endDate: '2025-07-01',
    limits: { maxClients: null, maxCaregivers: null, maxUsers: null, maxBranches: null },
    duration: { type: 'ongoing', dueDate: null, value: 12, unit: 'months' },
    selectedFeatures: [
      'Client Management',
      'Care Plan Management',
      'Scheduling & Appointments',
      'Billing & Invoicing',
      'Reports & Analytics',
      'Mobile App Access',
      'Custom Branding',
    ],
    customFeatures: [],
    features: [
      'Client Management',
      'Care Plan Management',
      'Scheduling & Appointments',
      'Billing & Invoicing',
      'Reports & Analytics',
      'Mobile App Access',
      'Custom Branding',
    ],
    assignedAgencies: [],
    isActive: true,
    createdAt: '2024-07-01',
  },
];

const DEFAULT_AGENCIES = [
  {
    name: 'Sunshine Home Care',
    legalName: 'Sunshine Home Care LLC',
    email: 'contact@sunshinehomecare.com',
    phone: '(555) 234-5678',
    city: 'Los Angeles',
    state: 'CA',
    ownerName: 'Sarah Johnson',
    status: 'Active',
    usage: { clients: 42, caregivers: 18, users: 4, branches: 1 },
    registeredAt: '2024-03-15',
    iconColor: 'bg-amber-100 text-amber-600',
  },
  {
    name: 'Happy Hearts Care',
    legalName: 'Happy Hearts Care Inc.',
    email: 'info@happyhearts.com',
    phone: '(555) 345-6789',
    city: 'San Diego',
    state: 'CA',
    ownerName: 'Michael Chen',
    status: 'Active',
    usage: { clients: 128, caregivers: 56, users: 12, branches: 2 },
    registeredAt: '2024-01-20',
    iconColor: 'bg-pink-100 text-pink-600',
  },
];

async function seedDatabase() {
  const adminCount = await Model.AdminModel.countDocuments();
  if (adminCount === 0) {
    const admin = new Model.AdminModel({
      name: 'Super Admin',
      email: 'admin@caretraker.com',
      role: 'SUPER_ADMIN',
      password: 'placeholder',
    });
    await admin.setPassword('Admin@123');
    await admin.save();
    console.log('Seeded default admin: admin@caretraker.com / Admin@123');
  }

  const planCount = await Model.SubscriptionPlanModel.countDocuments();
  if (planCount === 0) {
    await Model.SubscriptionPlanModel.insertMany(DEFAULT_PLANS);
    console.log('Seeded default subscription plans');
  }

  const agencyCount = await Model.AgencyModel.countDocuments();
  if (agencyCount === 0) {
    const plans = await Model.SubscriptionPlanModel.find().sort({ price: 1 });
    const agencies = DEFAULT_AGENCIES.map((agency, index) => ({
      ...agency,
      subscriptionPlanId: plans[index % plans.length]?._id,
    }));
    await Model.AgencyModel.insertMany(agencies);
    console.log('Seeded sample agencies');
  }

  await seedHiringDocuments();
  await seedBrightCarePortal();
}

async function seedHiringDocuments() {
  for (const doc of HIRING_DOCUMENTS) {
    await Model.DocumentModel.updateOne({ code: doc.code }, { $set: doc }, { upsert: true });
  }
  const count = await Model.DocumentModel.countDocuments();
  console.log(`Seeded ${count} hiring pipeline documents`);
}

async function seedBrightCarePortal() {
  const plans = await Model.SubscriptionPlanModel.find().sort({ price: 1 });
  let brightCare = await Model.AgencyModel.findOne({ name: 'BrightCare Home Health' });
  if (!brightCare) {
    brightCare = await Model.AgencyModel.create({
      name: 'BrightCare Home Health',
      legalName: 'BrightCare Home Health LLC',
      email: 'owner@brightcare.com',
      phone: '(555) 111-2222',
      city: 'Springfield',
      state: 'IL',
      ownerName: 'John Smith',
      status: 'Active',
      usage: { clients: 128, caregivers: 86, users: 8, branches: 1 },
      registeredAt: '2023-06-01',
      iconColor: 'bg-blue-100 text-blue-600',
      subscriptionPlanId: plans[1]?._id || plans[0]?._id,
    });
    console.log('Seeded BrightCare Home Health agency');
  }

  let ownerAccount = await Model.AgencyAccountModel.findOne({ email: 'owner@brightcare.com' });
  if (!ownerAccount) {
    ownerAccount = new Model.AgencyAccountModel({
      userId: 'owner@brightcare.com',
      email: 'owner@brightcare.com',
      fullName: 'John Smith',
      role: 'AGENCY_OWNER',
      status: 'Active',
      agencyId: brightCare._id,
      password: 'placeholder',
    });
    await ownerAccount.setPassword('Owner@123');
    await ownerAccount.save();
    console.log('Seeded agency owner: rowner@brightcae.com / Owner@123');
  } else if (!ownerAccount.agencyId) {
    ownerAccount.agencyId = brightCare._id;
    ownerAccount.role = 'AGENCY_OWNER';
    await ownerAccount.save();
  }

  const hrExists = await Model.HrStaffModel.findOne({ email: 'emily.rodriguez@brightcare.com' });
  if (!hrExists) {
    let hrAccount = await Model.AgencyAccountModel.findOne({ email: 'emily.rodriguez@brightcare.com' });
    if (!hrAccount) {
      hrAccount = new Model.AgencyAccountModel({
        userId: 'emily.rodriguez@brightcare.com',
        email: 'emily.rodriguez@brightcare.com',
        fullName: 'Emily Rodriguez',
        role: 'HR',
        status: 'Active',
        agencyId: brightCare._id,
        password: 'placeholder',
      });
      await hrAccount.setPassword('Hr@123456');
      await hrAccount.save();
    }

    const hrModules = [...DEFAULT_HR_MODULES];
    if (!hrAccount.moduleAccess?.length) {
      hrAccount.moduleAccess = hrModules;
      await hrAccount.save();
    }

    await Model.HrStaffModel.create({
      agencyId: brightCare._id,
      accountId: hrAccount._id,
      firstName: 'Emily',
      lastName: 'Rodriguez',
      email: 'emily.rodriguez@brightcare.com',
      phone: '(555) 234-5678',
      dateOfBirth: '1988-04-12',
      gender: 'Female',
      employeeId: 'HR-1001',
      jobTitle: 'HR Manager',
      department: 'Human Resources',
      hireDate: '2022-03-15',
      employmentType: 'Full-time',
      workLocation: 'Main Office',
      reportsTo: 'John Smith',
      streetAddress: '1200 Oak Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      country: 'United States',
      emergencyContactName: 'Carlos Rodriguez',
      emergencyContactRelationship: 'Spouse',
      emergencyContactPhone: '(555) 987-6543',
      emergencyContactEmail: 'carlos.r@gmail.com',
      educationLevel: 'Master\'s Degree',
      yearsOfExperience: '8',
      certifications: 'SHRM-CP, PHR',
      specializations: 'Recruiting, Compliance, Onboarding',
      userId: 'emily.rodriguez@brightcare.com',
      status: 'Active',
      notes: 'Primary HR contact for caregiver hiring and credential tracking.',
      role: 'HR',
      moduleAccess: [...DEFAULT_HR_MODULES],
    });
    console.log('Seeded HR staff: emily.rodriguez@brightcare.com / Hr@123456');
  } else {
    const hrModules = [...DEFAULT_HR_MODULES];
    await Model.HrStaffModel.updateOne(
      { email: 'emily.rodriguez@brightcare.com' },
      { $set: { moduleAccess: hrModules } },
    );
    await Model.AgencyAccountModel.updateOne(
      { email: 'emily.rodriguez@brightcare.com' },
      { $set: { moduleAccess: hrModules } },
    );
  }

  await HiringPipelineService.createDefaultStages(brightCare._id);
  const stageCount = await Model.AgencyStageModel.countDocuments({ agencyId: brightCare._id });
  if (stageCount > 0) {
    console.log(`Seeded default hiring pipeline (${stageCount} stages) for BrightCare`);
  }

  const jobExists = await Model.JobPostModel.findOne({ agencyId: brightCare._id, jobCode: 'CG-001' });
  if (!jobExists && stageCount > 0) {
    const stages = await Model.AgencyStageModel.find({ agencyId: brightCare._id, isActive: true }).sort({ stageOrder: 1 });
    await Model.JobPostModel.create({
      agencyId: brightCare._id,
      jobTitle: 'Caregiver',
      jobCode: 'CG-001',
      jobWorkplace: 'onsite',
      jobLocation: 'Springfield, IL',
      description: 'Provide compassionate in-home care to clients.',
      requirements: 'CNA certification preferred. Valid driver license.',
      benefits: 'Competitive pay, flexible schedule, training provided.',
      jobDepartment: 'Caregiving',
      jobFunction: 'Direct Client Care',
      employmentType: 'Full Time',
      experience: 'Entry Level',
      education: 'High School',
      keywords: 'Caregiving, Compassion, Patient Care',
      fromSalary: 32000,
      toSalary: 42000,
      currency: 'USD',
      stageIds: stages.map((s) => s._id),
      status: 'Active',
      createdBy: ownerAccount?._id,
    });
    console.log('Seeded sample job: Caregiver (CG-001)');
  }

  let caregiverAccount = await Model.AgencyAccountModel.findOne({ email: 'caregiver@brightcare.com' });
  if (!caregiverAccount) {
    caregiverAccount = new Model.AgencyAccountModel({
      userId: 'caregiver@brightcare.com',
      email: 'caregiver@brightcare.com',
      fullName: 'Sarah Johnson',
      role: 'CAREGIVER',
      status: 'Active',
      agencyId: brightCare._id,
      password: 'placeholder',
    });
    await caregiverAccount.setPassword('Care@123');
    await caregiverAccount.save();
    console.log('Seeded caregiver: caregiver@brightcare.com / Care@123');
  } else if (!caregiverAccount.agencyId) {
    caregiverAccount.agencyId = brightCare._id;
    caregiverAccount.role = 'CAREGIVER';
    await caregiverAccount.save();
  }
}

module.exports = seedDatabase;

if (require.main === module) {
  connection.mongodb().then(seedDatabase).then(() => process.exit(0));
}
