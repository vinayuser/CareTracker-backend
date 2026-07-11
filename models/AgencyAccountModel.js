const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const AgencyAccountSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    role: {
      type: String,
      enum: ['AGENCY_OWNER', 'HR', 'CAREGIVER'],
      default: 'AGENCY_OWNER',
    },
    status: {
      type: String,
      enum: ['Active', 'Pending', 'Inactive'],
      default: 'Active',
    },
    jti: { type: String, default: '', index: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    invitationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invitation' },
    moduleAccess: { type: [String], default: [] },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    sourceJobPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPost' },
    employeeId: { type: String, default: '' },
    phone: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
  },
  {
    timestamps: true,
  },
);

AgencyAccountSchema.methods.setPassword = function (password) {
  return new Promise((resolve, reject) => {
    if (!password) reject(new Error('Missing Password'));
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) reject(err);
      this.password = hash;
      resolve(this);
    });
  });
};

AgencyAccountSchema.methods.authenticate = function (password) {
  return new Promise((resolve, reject) => {
    if (!password) reject(new Error('MISSING_PASSWORD'));
    bcrypt.compare(password, this.password, (error, result) => {
      if (!result) reject(new Error('Invalid Password'));
      resolve(this);
    });
  });
};

module.exports = mongoose.model('AgencyAccount', AgencyAccountSchema);
