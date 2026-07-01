const mongoose = require('mongoose');
const { CLIENT_STATUSES } = require('../common/clientConstants');

const ClientSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    clientCode: { type: String, required: true },

    // Header
    intakeDate: { type: String, default: '' },
    intakeId: { type: String, default: '' },

    // Section 1 — Client Information
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    preferredName: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    gender: { type: String, default: '' },
    maritalStatus: { type: String, default: '' },
    ssnLast4: { type: String, default: '' },
    streetAddress: { type: String, default: '' },
    aptSuite: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    country: { type: String, default: 'United States' },
    phone: { type: String, default: '' },
    phoneHome: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true },
    preferredLanguage: { type: String, default: '' },
    ethnicity: { type: String, default: '' },
    race: { type: String, default: '' },

    // Section 2 — Emergency Contact
    emergencyContactName: { type: String, default: '' },
    emergencyContactRelationship: { type: String, default: '' },
    emergencyContactPhone: { type: String, default: '' },
    alternateContactName: { type: String, default: '' },
    alternateContactRelationship: { type: String, default: '' },
    alternateContactPhone: { type: String, default: '' },

    // Section 3 — Health Information
    physicianName: { type: String, default: '' },
    physicianPhone: { type: String, default: '' },
    lastVisitDate: { type: String, default: '' },
    pharmacyName: { type: String, default: '' },
    pharmacyPhone: { type: String, default: '' },
    insuranceProvider: { type: String, default: '' },
    insuranceMemberId: { type: String, default: '' },
    insuranceGroupNumber: { type: String, default: '' },
    medicalConditions: { type: String, default: '' },
    primaryDiagnosis: { type: String, default: '' },
    allergies: { type: String, default: '' },
    currentMedications: { type: String, default: '' },
    specialDiet: { type: String, default: '' },
    mobility: { type: String, default: '' },

    // Section 4 — Living Situation
    livingArrangements: [{ type: String }],
    livingArrangement: { type: String, default: '' },
    homeAccessibility: [{ type: String }],
    residenceType: { type: String, default: '' },
    assistiveDevices: [{ type: String }],
    hasPets: { type: Boolean, default: false },
    petsDescription: { type: String, default: '' },
    fallHistory: { type: Boolean, default: false },
    fallHistoryDescription: { type: String, default: '' },

    // Section 5 — Care & Support Needs
    serviceTypes: [{ type: String }],
    mobilityAssistanceNeeded: { type: Boolean, default: false },
    mobilityAssistanceDescription: { type: String, default: '' },
    personalCareAssistanceNeeded: { type: Boolean, default: false },
    personalCareAssistanceDescription: { type: String, default: '' },
    careFrequency: { type: String, default: '' },
    preferredDays: [{ type: String }],
    preferredTimes: [{ type: String }],
    careNotes: { type: String, default: '' },

    // Section 6 — Financial & Payment
    paymentResponsibility: { type: String, default: '' },
    paymentResponsibilityOther: { type: String, default: '' },
    billingStreetAddress: { type: String, default: '' },
    billingCity: { type: String, default: '' },
    billingState: { type: String, default: '' },
    billingZip: { type: String, default: '' },
    paymentMethods: [{ type: String }],

    // Section 7 — Authorization & Consent
    authorizationSignature: { type: String, default: '' },
    authorizationDate: { type: String, default: '' },
    authorizationPrintedName: { type: String, default: '' },
    authorizationRelationship: { type: String, default: '' },

    // Section 8 — Office Use Only
    intakeCompletedBy: { type: String, default: '' },
    intakeCompletedDate: { type: String, default: '' },
    assignedTo: { type: String, default: '' },
    admissionDate: { type: String, default: '' },
    carePlanStartDate: { type: String, default: '' },

    profilePicPath: { type: String, default: '' },
    status: {
      type: String,
      enum: CLIENT_STATUSES,
      default: 'Pending',
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

ClientSchema.index({ agencyId: 1, clientCode: 1 }, { unique: true });
ClientSchema.index({ agencyId: 1, lastName: 1, firstName: 1 });

module.exports = mongoose.model('Client', ClientSchema);
