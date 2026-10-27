const Model = require('../../models/index');

const DEFAULTS = {
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: `CareTraker Privacy Policy

Last updated: ${new Date().toISOString().slice(0, 10)}

CareTraker ("we", "us", or "our") provides software for home care agencies. This Privacy Policy explains how we collect, use, and protect information when you use our website and platform.

1. Information we collect
We may collect account details, contact information, and usage data needed to operate the platform and support agencies, caregivers, and clients.

2. How we use information
We use information to provide and improve CareTraker, communicate with you, support compliance workflows, and keep the service secure.

3. Sharing
We do not sell personal information. We may share data with service providers that help us run CareTraker, or when required by law.

4. Security
We use administrative, technical, and physical safeguards designed to protect information. No method of transmission over the internet is completely secure.

5. Your choices
You may request access, updates, or deletion of account information by contacting support, subject to legal and operational requirements.

6. Contact
For privacy questions, contact support@caretraker.com.

Replace this default text from the admin Legal Pages screen.`,
  },
  terms: {
    slug: 'terms',
    title: 'Terms & Conditions',
    content: `CareTraker Terms & Conditions

Last updated: ${new Date().toISOString().slice(0, 10)}

These Terms & Conditions govern your use of the CareTraker website and platform.

1. Acceptance
By accessing or using CareTraker, you agree to these terms. If you do not agree, do not use the service.

2. Accounts
You are responsible for maintaining the confidentiality of your login credentials and for activity under your account.

3. Acceptable use
You may use CareTraker only for lawful home care operations and must not misuse the platform, attempt unauthorized access, or interfere with other users.

4. Agency data
Agencies remain responsible for the accuracy of client, caregiver, and care records entered into CareTraker.

5. Intellectual property
CareTraker software, branding, and content are owned by CareTraker or its licensors and may not be copied without permission.

6. Disclaimers
CareTraker is provided on an "as available" basis. It is software for operational workflows and is not a substitute for professional clinical judgment.

7. Limitation of liability
To the fullest extent permitted by law, CareTraker is not liable for indirect, incidental, or consequential damages arising from use of the service.

8. Changes
We may update these terms. Continued use after changes means you accept the updated terms.

9. Contact
Questions about these terms: support@caretraker.com.

Replace this default text from the admin Legal Pages screen.`,
  },
};

const ALLOWED = new Set(Object.keys(DEFAULTS));

const format = (doc) => {
  if (!doc) return null;
  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    content: doc.content || '',
    updatedAt: doc.updatedAt?.toISOString?.() || doc.updatedAt || null,
  };
};

const ensureDefaults = async () => {
  const existing = await Model.LegalPageModel.find({ slug: { $in: [...ALLOWED] } }).lean();
  const have = new Set(existing.map((row) => row.slug));
  const missing = [...ALLOWED].filter((slug) => !have.has(slug));
  if (!missing.length) return;
  await Model.LegalPageModel.insertMany(
    missing.map((slug) => ({
      slug,
      title: DEFAULTS[slug].title,
      content: DEFAULTS[slug].content,
    })),
  );
};

const listPages = async () => {
  await ensureDefaults();
  const rows = await Model.LegalPageModel.find({ slug: { $in: [...ALLOWED] } })
    .sort({ slug: 1 })
    .lean();
  return rows.map(format);
};

const getBySlug = async (rawSlug) => {
  const slug = String(rawSlug || '').trim().toLowerCase();
  if (!ALLOWED.has(slug)) {
    const error = new Error('Legal page not found');
    error.statusCode = 404;
    throw error;
  }
  await ensureDefaults();
  let doc = await Model.LegalPageModel.findOne({ slug }).lean();
  if (!doc) {
    doc = (await Model.LegalPageModel.create(DEFAULTS[slug])).toObject();
  }
  return format(doc);
};

const savePage = async (rawSlug, payload = {}, adminId = null) => {
  const slug = String(rawSlug || '').trim().toLowerCase();
  if (!ALLOWED.has(slug)) {
    const error = new Error('Legal page not found');
    error.statusCode = 404;
    throw error;
  }
  const title = String(payload.title || DEFAULTS[slug].title).trim() || DEFAULTS[slug].title;
  const content = String(payload.content ?? '');
  const doc = await Model.LegalPageModel.findOneAndUpdate(
    { slug },
    {
      $set: {
        title,
        content,
        updatedBy: adminId || null,
      },
      $setOnInsert: { slug },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return format(doc);
};

module.exports = {
  listPages,
  getBySlug,
  savePage,
  DEFAULTS,
};
