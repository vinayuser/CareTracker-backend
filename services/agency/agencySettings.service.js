const Model = require('../../models/index');
const constants = require('../../common/constants');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const { resolveAgencyLogoPath } = require('../../common/profilePicUpload');

const getAgencyId = (req) => {
  const account = req.agency_owner || req.hr;
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const assertAgencyOwner = (req) => {
  if (!req.agency_owner) {
    throw new Error('Only agency owners can update agency settings');
  }
};

const trim = (value) => String(value || '').trim();

const formatSettings = (agency) => ({
  id: String(agency._id),
  name: agency.name || '',
  email: agency.email || '',
  phone: agency.phone || '',
  fax: agency.fax || '',
  website: agency.website || '',
  address: agency.address || '',
  city: agency.city || '',
  state: agency.state || '',
  logoUrl: agency.logoPath ? buildUploadUrl(agency.logoPath) : '',
});

const getSettings = async (req) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);
  const agency = await Model.AgencyModel.findById(agencyId);
  if (!agency) throw new Error('Agency not found');
  return formatSettings(agency);
};

const updateSettings = async (req, payload = {}) => {
  assertAgencyOwner(req);
  const agencyId = getAgencyId(req);
  const agency = await Model.AgencyModel.findById(agencyId);
  if (!agency) throw new Error('Agency not found');

  if (payload.email !== undefined) {
    const email = trim(payload.email).toLowerCase();
    if (!email) throw new Error('Agency email is required');
    agency.email = email;
  }
  if (payload.phone !== undefined) agency.phone = trim(payload.phone);
  if (payload.fax !== undefined) agency.fax = trim(payload.fax);
  if (payload.website !== undefined) agency.website = trim(payload.website);
  if (payload.address !== undefined) agency.address = trim(payload.address);
  if (payload.city !== undefined) agency.city = trim(payload.city);
  if (payload.state !== undefined) agency.state = trim(payload.state);

  const nextLogoPath = resolveAgencyLogoPath(payload.logo);
  if (nextLogoPath !== null) {
    agency.logoPath = nextLogoPath;
  }

  await agency.save();
  return formatSettings(agency);
};

module.exports = {
  getSettings,
  updateSettings,
  MESSAGE: constants.MESSAGE.AGENCY_SETTINGS,
};
