const INSURANCE_INTAKE_STATUSES = ['Draft', 'Submitted', 'Verified'];

const PRIMARY_INSURANCE_TYPES = [
  'Medicare',
  'Medicaid',
  'Private Insurance',
  'VA Benefits',
  'Long Term Care Insurance',
  'Other',
];

const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL_STATUSES = ['Single', 'Married', 'Widowed', 'Divorced'];
const RELATIONSHIPS = ['Self', 'Spouse', 'Parent', 'Other'];
const MEDICARE_TYPES = [
  'Original Medicare (Part A & B)',
  'Medicare Advantage (Part C)',
  'Part D Prescription Plan',
];
const AUTH_STATUSES = ['Approved', 'Pending', 'Denied'];

const REQUIRED_DOCUMENTS = [
  { key: 'insuranceCard', label: 'Insurance Card (Front & Back)' },
  { key: 'photoId', label: 'Photo ID' },
  { key: 'medicareCard', label: 'Medicare Card (If Applicable)' },
  { key: 'medicaidCard', label: 'Medicaid Card (If Applicable)' },
  { key: 'prescriptionCard', label: 'Prescription Card (If Applicable)' },
  { key: 'otherDocuments', label: 'Other Documents' },
];

const buildEmptyFormData = () => ({
  clientInfo: {
    clientFullName: '',
    dob: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phoneHome: '',
    phoneMobile: '',
    email: '',
    maritalStatus: '',
    ssnLast4: '',
    preferredLanguage: '',
    emergencyContactName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
  },
  primaryInsurance: {
    types: [],
    otherType: '',
    companyName: '',
    planName: '',
    memberId: '',
    groupNumber: '',
    policyHolderName: '',
    policyHolderRelationship: '',
    policyHolderRelationshipOther: '',
    policyHolderDob: '',
    effectiveDate: '',
    insurancePhone: '',
    claimsAddress: '',
  },
  secondaryInsurance: {
    companyName: '',
    memberId: '',
    groupNumber: '',
    policyHolderName: '',
    dob: '',
    relationship: '',
    relationshipOther: '',
  },
  prescriptionCoverage: {
    companyName: '',
    memberId: '',
    groupNumber: '',
    bin: '',
    pcn: '',
    phone: '',
    copayStructure: '',
  },
  medicare: {
    number: '',
    types: [],
    partAEffectiveDate: '',
    partBEffectiveDate: '',
    advantagePlanName: '',
    planIdNumber: '',
  },
  medicaid: {
    number: '',
    state: '',
    managedCarePlan: '',
    memberId: '',
    effectiveDate: '',
    caseWorkerName: '',
    caseWorkerPhone: '',
  },
  additionalCoverage: {
    vaBenefits: null,
    vaClaimNumber: '',
    longTermCare: null,
    ltcPolicyClaimNumber: '',
    ltcCompany: '',
  },
  authorization: {
    signature: '',
    printName: '',
    date: '',
  },
  requiredDocuments: {
    insuranceCard: null,
    photoId: null,
    medicareCard: null,
    medicaidCard: null,
    prescriptionCard: null,
    otherDocuments: null,
  },
  officeUse: {
    verifiedBy: '',
    date: '',
    coverageConfirmed: null,
    notes: '',
    copay: '',
    deductible: '',
    coinsurance: '',
    authorizationRequired: null,
    authStatus: '',
    nextReviewDate: '',
  },
});

module.exports = {
  INSURANCE_INTAKE_STATUSES,
  PRIMARY_INSURANCE_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  RELATIONSHIPS,
  MEDICARE_TYPES,
  AUTH_STATUSES,
  REQUIRED_DOCUMENTS,
  buildEmptyFormData,
};
