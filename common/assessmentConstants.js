const ASSESSMENT_TYPES = [
  'Initial Assessment',
  'Reassessment',
  'Hospital Discharge',
  'Annual Review',
  'Change in Condition',
];

const ASSESSMENT_STATUSES = ['Enquiry', 'Quoted', 'Accepted', 'Declined'];

const QUOTE_STATUSES = ['Quoted', 'Accepted', 'Declined'];

const ADL_ITEMS = ['Bathing', 'Dressing', 'Grooming', 'Toileting', 'Transfers', 'Walking', 'Feeding', 'Continence'];

const IADL_ITEMS = ['Shopping', 'Meal Preparation', 'Laundry', 'Transportation', 'Housekeeping', 'Financial Management'];

const HOME_SAFETY_ITEMS = [
  'Smoke Detectors', 'Trip Hazards', 'Fire Extinguisher', 'Emergency Exit Plan',
  'Grab Bars', 'Pets', 'Working Telephone',
];

const REQUESTED_SERVICES = [
  'Personal Care', 'Bathing', 'Dressing', 'Grooming', 'Toileting', 'Meal Preparation',
  'Laundry', 'Light Housekeeping', 'Shopping', 'Transportation', 'Medication Reminder',
  'Companionship', 'Dementia Care', 'Respite Care', 'Overnight Care', 'Live-In Care',
];

const RISK_LEVELS = ['Low', 'Moderate', 'High'];

const buildEmptyMedicationRow = () => ({
  name: '', dosage: '', frequency: '', purpose: '', selfManaged: false,
});

const buildEmptyAdls = () => Object.fromEntries(ADL_ITEMS.map((item) => [item, '']));

/** Clinical snapshot used by quote / client / care-plan seeding (packet lives in formData.forms). */
const buildEmptyFormData = () => ({
  packetVersion: 1,
  forms: {},
  clientInfo: {
    firstName: '', lastName: '', clientName: '', dob: '', age: '', gender: '', ssn: '', primaryLanguage: '', religion: '',
    height: '', weight: '', interpreterNeeded: false, maritalStatus: '',
    primaryDiagnosis: '', secondaryDiagnoses: '',
  },
  contactInfo: {
    homeAddress: '', city: '', state: '', zip: '', homePhone: '', mobile: '', email: '',
    preferredContactMethods: [],
  },
  responsibleParty: {
    name: '', relationship: '', phone: '', email: '',
    powerOfAttorney: false, medicalPoa: false, guardian: false,
  },
  physicianInfo: {
    primaryPhysician: '', primaryPhysicianPhone: '', specialists: '',
    preferredHospital: '', pharmacy: '', pharmacyPhone: '',
  },
  insurance: {
    types: [], policyNumber: '', authorizationNumber: '', hoursAuthorized: '', startDate: '',
  },
  emergencyInfo: {
    primaryName: '', primaryRelationship: '', primaryPhone: '',
    backupName: '', backupRelationship: '', backupPhone: '',
  },
  medicalHistory: [],
  medicalHistoryOther: '',
  allergies: { types: [], details: '' },
  medications: Array.from({ length: 6 }, buildEmptyMedicationRow),
  adls: buildEmptyAdls(),
  adlComments: '',
  iadls: {
    ...Object.fromEntries(IADL_ITEMS.filter((i) => i !== 'Financial Management').map((i) => [i, 'Independent'])),
    'Financial Management': 'Not Needed',
  },
  medicationReminder: 'Not Needed',
  mobility: {
    ambulation: [], transferAssistance: [], fallHistory: false, fallCount: '',
  },
  cognitiveStatus: {
    orientation: '', memory: '', decisionMaking: '', confusion: false, wandering: false,
    behaviorConcerns: '',
  },
  homeSafety: Object.fromEntries(HOME_SAFETY_ITEMS.map((item) => [item, false])),
  nutrition: {
    dietTypes: [], weightLoss: false, mealAssistance: false, fluidRestrictions: false,
  },
  painAssessment: {
    painToday: false, painScore: '', location: '', painMedication: '',
  },
  mentalHealth: {
    depression: false, anxiety: false, behavioralConcerns: '',
  },
  clientGoals: [],
  clientGoalsOther: '',
  requestedServices: [],
  schedule: {
    daysNeeded: [], preferredStart: '', preferredEnd: '',
  },
  coordinatorNotes: '',
  carePlanSummary: {
    primaryNeeds: '', recommendedWeeklyHours: '', startOfCareDate: '', riskLevel: '',
  },
  signatures: {
    clientSignature: '', clientDate: '',
    responsiblePartySignature: '', responsiblePartyDate: '',
    coordinatorSignature: '', coordinatorDate: '',
    rnSignature: '', rnDate: '',
  },
});

module.exports = {
  ASSESSMENT_TYPES,
  ASSESSMENT_STATUSES,
  QUOTE_STATUSES,
  REQUESTED_SERVICES,
  RISK_LEVELS,
  buildEmptyMedicationRow,
  buildEmptyAdls,
  buildEmptyFormData,
  getOptions: () => ({
    assessmentTypes: ASSESSMENT_TYPES,
    statuses: ASSESSMENT_STATUSES,
    requestedServices: REQUESTED_SERVICES,
    riskLevels: RISK_LEVELS,
  }),
};
