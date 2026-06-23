const mongoose = require('mongoose');

const HrStaffSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    gender: { type: String, default: '' },
    employeeId: { type: String, required: true },
    jobTitle: { type: String, required: true },
    department: { type: String, default: 'Human Resources' },
    hireDate: { type: String, default: '' },
    employmentType: { type: String, default: 'Full-time' },
    workLocation: { type: String, default: '' },
    reportsTo: { type: String, default: '' },
    streetAddress: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    country: { type: String, default: 'United States' },
    emergencyContactName: { type: String, default: '' },
    emergencyContactRelationship: { type: String, default: '' },
    emergencyContactPhone: { type: String, default: '' },
    emergencyContactEmail: { type: String, default: '' },
    educationLevel: { type: String, default: '' },
    yearsOfExperience: { type: String, default: '' },
    certifications: { type: String, default: '' },
    specializations: { type: String, default: '' },
    userId: { type: String, required: true, lowercase: true },
    status: {
      type: String,
      enum: ['Active', 'Pending', 'Inactive'],
      default: 'Active',
    },
    notes: { type: String, default: '' },
    role: { type: String, default: 'HR' },
    moduleAccess: { type: [String], default: [] },
  },
  {
    timestamps: true,
  },
);

HrStaffSchema.index({ agencyId: 1, employeeId: 1 }, { unique: true });
HrStaffSchema.index({ agencyId: 1, email: 1 });

module.exports = mongoose.model('HrStaff', HrStaffSchema);
