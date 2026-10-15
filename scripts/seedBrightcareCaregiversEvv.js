/**
 * Add caregivers and completed (Verified) EVV enrollments for BrightCare existing clients.
 * Usage: node scripts/seedBrightcareCaregiversEvv.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../config/.env') });
const mongoose = require('mongoose');
const Model = require('../models/index');

const SIGN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const PEOPLE = [
  { first: 'Maria', last: 'Santos', email: 'maria.santos@brightcare.com', phone: '(555) 201-1001', city: 'Springfield', state: 'IL', zip: '62701' },
  { first: 'James', last: 'Carter', email: 'james.carter@brightcare.com', phone: '(555) 201-1002', city: 'Springfield', state: 'IL', zip: '62702' },
  { first: 'Priya', last: 'Patel', email: 'priya.patel@brightcare.com', phone: '(555) 201-1003', city: 'Decatur', state: 'IL', zip: '62521' },
  { first: 'David', last: 'Wilson', email: 'david.wilson@brightcare.com', phone: '(555) 201-1004', city: 'Champaign', state: 'IL', zip: '61820' },
  { first: 'Angela', last: 'Brooks', email: 'angela.brooks@brightcare.com', phone: '(555) 201-1005', city: 'Peoria', state: 'IL', zip: '61602' },
  { first: 'Omar', last: 'Hassan', email: 'omar.hassan@brightcare.com', phone: '(555) 201-1006', city: 'Bloomington', state: 'IL', zip: '61701' },
];

const AREAS = [
  { key: 'personalCare', label: 'Personal Care' },
  { key: 'nutrition', label: 'Nutrition' },
];

function formData({ client, caregiver, agency, plan, area }) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    clientInfo: {
      clientFullName: `${client.firstName} ${client.lastName}`.trim(),
      dob: client.dateOfBirth || '',
      gender: client.gender || '',
      address: client.streetAddress || '',
      aptSuite: '',
      city: client.city || 'Springfield',
      state: client.state || 'IL',
      zip: client.zipCode || '',
      phone: client.phone || '',
      email: client.email || '',
      preferredLanguage: client.preferredLanguage || 'English',
      clientId: client.clientCode || '',
    },
    caregiverInfo: {
      isSelf: false,
      fullName: caregiver.fullName,
      employeeId: caregiver.employeeId,
      phone: caregiver.phone,
      email: caregiver.email,
      dob: caregiver.dateOfBirth,
      address: '120 Care Lane',
      aptSuite: '',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      relationship: 'Self',
      relationshipOther: '',
    },
    serviceInfo: {
      agencyName: agency.name,
      agencyPhone: agency.phone || '',
      evvVendor: 'CareTracker EVV',
      medicaidProgram: client.insuranceProvider || 'Medicaid',
      assignedServices: area.label,
      planCode: plan.planCode,
    },
    evvMethods: { methods: ['Mobile App (Smartphone)'], other: '' },
    mobileEnrollment: {
      smartphoneType: 'Android',
      mobileNumber: caregiver.phone,
      email: caregiver.email,
    },
    landlineEnrollment: { primaryPhone: '', phoneType: '', alternatePhone: '' },
    authorization: {
      clientSignature: SIGN,
      clientDate: today,
      caregiverSignature: SIGN,
      caregiverDate: today,
    },
    trainingAck: { caregiverSignature: SIGN, date: today },
    officeUse: {
      evvSystem: 'CareTracker',
      enrollmentDate: today,
      staffInitials: 'JS',
      methodSetUpBy: 'John Smith',
      verifiedBy: 'John Smith',
      verificationDate: today,
      notes: 'Completed enrollment for existing client.',
    },
  };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const owner = await Model.AgencyAccountModel.findOne({ email: 'owner@brightcare.com' });
  if (!owner?.agencyId) throw new Error('BrightCare owner not found');
  const agency = await Model.AgencyModel.findById(owner.agencyId);
  const agencyId = agency._id;
  const clients = await Model.ClientModel.find({ agencyId }).sort({ createdAt: 1 });
  if (!clients.length) throw new Error('No clients');

  const caregivers = [];
  for (let i = 0; i < PEOPLE.length; i += 1) {
    const person = PEOPLE[i];
    let account = await Model.AgencyAccountModel.findOne({ email: person.email });
    if (!account) {
      account = new Model.AgencyAccountModel({
        userId: person.email,
        email: person.email,
        fullName: `${person.first} ${person.last}`,
        role: 'CAREGIVER',
        status: 'Active',
        agencyId,
        password: 'placeholder',
        phone: person.phone,
        dateOfBirth: `198${i}-0${(i % 8) + 1}-15`,
        employeeId: `CG-BC-${String(i + 1).padStart(3, '0')}`,
      });
      await account.setPassword('Care@123');
      await account.save();
      console.log('created caregiver', person.email);
    }
    caregivers.push(account);
  }

  const codes = await Model.EvvEnrollmentModel.find({ agencyId }).select('enrollmentCode').lean();
  let next = 10001;
  codes.forEach((row) => {
    const n = Number(String(row.enrollmentCode || '').replace(/\D/g, ''));
    if (n >= next) next = n + 1;
  });

  for (let c = 0; c < clients.length; c += 1) {
    const client = clients[c];
    let plan = await Model.CarePlanModel.findOne({ agencyId, clientId: client._id, status: 'Active' });
    if (!plan) {
      plan = await Model.CarePlanModel.findOne({ agencyId, clientId: client._id });
    }
    if (!plan && c === 1) {
      plan = await Model.CarePlanModel.findOne({ agencyId, planCode: 'CP-10002' });
    }
    if (!plan) {
      console.log('skip client without plan', client.firstName);
      continue;
    }
    if (!plan.clientId) plan.clientId = client._id;
    plan.status = 'Active';
    const fd = plan.formData || {};
    const needs = Array.isArray(fd.careNeeds) ? fd.careNeeds : [];
    const pair = [caregivers[(c * 2) % caregivers.length], caregivers[(c * 2 + 1) % caregivers.length]];
    AREAS.forEach((area, idx) => {
      const cg = pair[idx];
      const existing = needs.find((need) => need.areaKey === area.key);
      const patch = {
        areaKey: area.key,
        areaLabel: area.label,
        frequency: 'daily',
        responsibleStaff: cg.fullName,
        responsibleStaffId: String(cg._id),
        scheduleDays: ['Mon', 'Wed', 'Fri'],
        startTime: idx === 0 ? '09:00' : '13:00',
        endTime: idx === 0 ? '11:00' : '15:00',
        graceMinutes: 15,
      };
      if (existing) Object.assign(existing, patch);
      else needs.push({ icon: 'User', goalsOutcomes: '', interventions: {}, ...patch });
    });
    plan.formData = { ...fd, careNeeds: needs };
    plan.markModified('formData');
    await plan.save();

    for (let idx = 0; idx < AREAS.length; idx += 1) {
      const area = AREAS[idx];
      const cg = pair[idx];
      const already = await Model.EvvEnrollmentModel.findOne({
        agencyId,
        carePlanId: plan._id,
        caregiverAccountId: cg._id,
        serviceAreaKey: area.key,
      });
      if (already) {
        console.log('exists', already.enrollmentCode);
        continue;
      }
      const doc = await Model.EvvEnrollmentModel.create({
        agencyId,
        enrollmentCode: `EVV-${next}`,
        status: 'Verified',
        enrollmentDate: new Date().toISOString().slice(0, 10),
        carePlanId: plan._id,
        clientId: client._id,
        caregiverAccountId: cg._id,
        serviceAreaKey: area.key,
        planCode: plan.planCode,
        clientName: `${client.firstName} ${client.lastName}`.trim(),
        caregiverName: cg.fullName,
        serviceAreas: [area.label],
        formData: formData({ client, caregiver: cg, agency, plan, area }),
        submittedAt: new Date(),
        verifiedAt: new Date(),
        verifiedByAccountId: owner._id,
        createdByAccountId: owner._id,
      });
      next += 1;
      console.log('verified', doc.enrollmentCode, doc.clientName, doc.caregiverName, area.label);
    }
  }

  const totalCg = await Model.AgencyAccountModel.countDocuments({ agencyId, role: 'CAREGIVER' });
  const totalEvv = await Model.EvvEnrollmentModel.countDocuments({ agencyId, status: 'Verified' });
  console.log({ caregivers: totalCg, verifiedEvv: totalEvv });
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
