/**
 * One-off / ops: hard-delete an agency by owner email (and related records).
 *
 * Usage (on server, from backend root):
 *   node scripts/purgeAgencyByEmail.js vineet.anand03@gmail.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '../config/.env') });
const mongoose = require('mongoose');
const Model = require('../models/index');
const { purgeAgencyRelatedData } = require('../services/admin/agencyPurge.service');

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/purgeAgencyByEmail.js <owner-email>');
  process.exit(1);
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const agencies = await Model.AgencyModel.find({
    email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }).select('_id name email status');

  const accounts = await Model.AgencyAccountModel.find({
    $or: [{ email }, { userId: email }],
  }).select('_id email userId role agencyId');

  const agencyIds = [
    ...new Set([
      ...agencies.map((a) => String(a._id)),
      ...accounts.map((a) => (a.agencyId ? String(a.agencyId) : '')).filter(Boolean),
    ]),
  ];

  console.log('Matched agencies:', agencies.map((a) => ({ id: String(a._id), name: a.name, email: a.email })));
  console.log('Matched accounts:', accounts.map((a) => ({
    id: String(a._id),
    email: a.email,
    role: a.role,
    agencyId: a.agencyId ? String(a.agencyId) : null,
  })));

  if (!agencyIds.length && !accounts.length) {
    // Still wipe invites for this email
    const inviteResult = await Model.InvitationModel.deleteMany({ email });
    console.log('No agency/account found. Deleted invitations:', inviteResult.deletedCount || 0);
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const agencyId of agencyIds) {
    const agency = await Model.AgencyModel.findById(agencyId).select('_id name email');
    if (!agency) {
      console.log('Agency already gone:', agencyId);
      continue;
    }
    console.log('Purging agency', String(agency._id), agency.name, agency.email);
    const purged = await purgeAgencyRelatedData(agency._id);
    await Model.AgencyModel.findByIdAndDelete(agency._id);
    console.log('Purged counts:', purged);
  }

  // Catch orphan accounts / invites for this email
  const orphanAccounts = await Model.AgencyAccountModel.deleteMany({
    $or: [{ email }, { userId: email }],
  });
  const invites = await Model.InvitationModel.deleteMany({ email });
  console.log('Extra orphan accounts removed:', orphanAccounts.deletedCount || 0);
  console.log('Invitations removed:', invites.deletedCount || 0);

  await mongoose.disconnect();
  console.log('Done.');
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
