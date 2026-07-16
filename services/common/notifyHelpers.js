const Model = require('../../models/index');
const { getFrontendUrl } = require('../../common/functions');

const uniqueEmails = (list = []) => [...new Set(list.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];

const getAdminEmails = async () => {
  const admins = await Model.AdminModel.find({}).select('email').lean();
  return uniqueEmails(admins.map((a) => a.email));
};

const getAgencyContext = async (agencyId) => {
  const [agency, owners] = await Promise.all([
    Model.AgencyModel.findById(agencyId).select('name email ownerName').lean(),
    Model.AgencyAccountModel.find({
      agencyId,
      role: 'AGENCY_OWNER',
      status: { $ne: 'Inactive' },
    }).select('email fullName').lean(),
  ]);

  const ownerEmails = uniqueEmails([
    ...owners.map((o) => o.email),
    agency?.email,
  ]);

  return {
    agencyName: agency?.name || '',
    agencyEmail: agency?.email || '',
    ownerName: owners[0]?.fullName || agency?.ownerName || '',
    ownerEmails,
  };
};

const agencyPortalUrl = (req, path = '') => {
  const base = getFrontendUrl(req).replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : path ? `/${path}` : ''}`;
};

module.exports = {
  uniqueEmails,
  getAdminEmails,
  getAgencyContext,
  agencyPortalUrl,
};
