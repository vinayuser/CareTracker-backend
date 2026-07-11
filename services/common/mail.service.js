const { getFrontendUrl } = require('../../common/functions');

const PRIMARY = '#0055d4';
const SIDEBAR = '#001529';
const PAGE_BG = '#f5f7fa';

const isConfigured = () => Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Light branded wrapper — header, body, footer */
const wrapEmail = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:28px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:${SIDEBAR};padding:18px 24px;">
            <span style="font-size:17px;font-weight:700;letter-spacing:-0.02em;">
              <span style="color:#fff;">Care</span><span style="color:#6ee7b7;">Traker</span>
            </span>
          </td>
        </tr>
        <tr><td style="height:3px;background:${PRIMARY};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:28px 24px;color:#0f172a;font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(title)}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
            Powered by CareTraker · Home Care Platform
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

const ctaButton = (href, label) => `
  <p style="margin:24px 0 8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;background:${PRIMARY};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
      ${escapeHtml(label)}
    </a>
  </p>`.trim();

const sendMail = async ({ to, subject, html, text }) => {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@caretraker.com';

  if (!isConfigured()) {
    console.log('\n--- [mail:dev] ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html);
    console.log('---\n');
    return { sent: false, devMode: true };
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.warn('[mail] nodemailer not installed; logging email instead');
    console.log(text || html);
    return { sent: false, devMode: true };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({ from, to, subject, html, text });
  return { sent: true, devMode: false };
};

/** When a candidate is added to a job */
const sendCandidateApplicationEmail = async ({
  to,
  candidateName,
  jobTitle,
  agencyName,
  stageName,
}) => {
  const agency = agencyName || 'Your agency';
  const role = jobTitle || 'Position';
  const stage = stageName || 'Application';
  const subject = `Application received — ${role}`;

  const text = [
    `Hello ${candidateName},`,
    '',
    `${agency} has added you as a candidate for ${role}.`,
    stage ? `Your application is currently in the "${stage}" stage.` : '',
    '',
    'We will follow up if any forms or next steps are required.',
    '',
    'Thank you,',
    agency,
  ].filter(Boolean).join('\n');

  const html = wrapEmail('Application received', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(candidateName)},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agency)}</strong> has added you as a candidate for
      <strong>${escapeHtml(role)}</strong>.
    </p>
    <p style="margin:0 0 12px;">
      Your application is currently in the <strong>${escapeHtml(stage)}</strong> stage.
      We will email you if forms or next steps are required.
    </p>
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">
      Thank you,<br /><strong style="color:#0f172a;">${escapeHtml(agency)}</strong>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Stage forms invite (onboarding / stage moves) */
const sendCandidateStageFormsEmail = async ({
  to,
  candidateName,
  jobTitle,
  stageName,
  agencyName,
  formUrl,
}) => {
  const agency = agencyName || 'Your agency';
  const subject = `Complete your ${stageName} forms — ${jobTitle}`;

  const text = [
    `Hello ${candidateName},`,
    '',
    `${agency} has invited you to complete required forms for the "${stageName}" stage of your application for ${jobTitle}.`,
    '',
    'Open your secure form link:',
    formUrl,
    '',
    'This link is unique to you. Please do not share it.',
    '',
    'Thank you,',
    agency,
  ].join('\n');

  const html = wrapEmail(`Complete your ${stageName} forms`, `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(candidateName)},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agency)}</strong> has invited you to complete required forms for the
      <strong>${escapeHtml(stageName)}</strong> stage of your application for
      <strong>${escapeHtml(jobTitle)}</strong>.
    </p>
    ${ctaButton(formUrl, 'Complete Forms')}
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;">
      Or copy this link:<br />
      <a href="${escapeHtml(formUrl)}" style="color:${PRIMARY};word-break:break-all;">${escapeHtml(formUrl)}</a>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">This link is unique to you. Please do not share it.</p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Ask candidate to resubmit one form */
const sendCandidateFormResetEmail = async ({
  to,
  candidateName,
  jobTitle,
  stageName,
  documentName,
  agencyName,
  formUrl,
}) => {
  const agency = agencyName || 'Your agency';
  const subject = `Please resubmit: ${documentName} — ${jobTitle}`;

  const text = [
    `Hello ${candidateName},`,
    '',
    `${agency} has asked you to complete "${documentName}" again for the "${stageName}" stage of your application for ${jobTitle}.`,
    '',
    'Open your secure form link:',
    formUrl,
    '',
    'Thank you,',
    agency,
  ].join('\n');

  const html = wrapEmail(`Please resubmit ${documentName}`, `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(candidateName)},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agency)}</strong> has asked you to complete
      <strong>${escapeHtml(documentName)}</strong> again for the
      <strong>${escapeHtml(stageName)}</strong> stage of your application for
      <strong>${escapeHtml(jobTitle)}</strong>.
    </p>
    ${ctaButton(formUrl, 'Open Forms')}
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;">
      Or copy this link:<br />
      <a href="${escapeHtml(formUrl)}" style="color:${PRIMARY};word-break:break-all;">${escapeHtml(formUrl)}</a>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Welcome email when hired candidate becomes a caregiver */
const sendCaregiverWelcomeEmail = async ({
  to,
  caregiverName,
  agencyName,
  jobTitle,
  email,
  password,
  loginUrl,
}) => {
  const agency = agencyName || 'Your agency';
  const portalUrl = loginUrl || `${getFrontendUrl()}/login`;
  const subject = `Welcome to ${agency} — your caregiver account`;

  const credsText = password
    ? [`Login email: ${email}`, `Temporary password: ${password}`, '', 'Please change your password after signing in.']
    : ['You can sign in with your existing CareTraker caregiver credentials.'];

  const text = [
    `Hello ${caregiverName},`,
    '',
    `Congratulations! ${agency} has hired you${jobTitle ? ` for ${jobTitle}` : ''} and created your caregiver account.`,
    '',
    ...credsText,
    '',
    `Sign in: ${portalUrl}`,
    '',
    'Thank you,',
    agency,
  ].join('\n');

  const credsHtml = password
    ? `
      <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <tr><td style="padding:14px 16px;font-size:14px;">
          <p style="margin:0 0 8px;"><span style="color:#64748b;">Login email</span><br /><strong>${escapeHtml(email)}</strong></p>
          <p style="margin:0;"><span style="color:#64748b;">Temporary password</span><br /><strong style="font-family:Consolas,Monaco,monospace;letter-spacing:0.02em;">${escapeHtml(password)}</strong></p>
        </td></tr>
      </table>
      <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Please change your password after signing in.</p>
    `
    : `<p style="margin:0 0 12px;">You can sign in with your existing CareTraker caregiver credentials.</p>`;

  const html = wrapEmail('Welcome aboard', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(caregiverName)},</p>
    <p style="margin:0 0 12px;">
      Congratulations! <strong>${escapeHtml(agency)}</strong> has hired you
      ${jobTitle ? ` for <strong>${escapeHtml(jobTitle)}</strong>` : ''}
      and set up your caregiver account.
    </p>
    ${credsHtml}
    ${ctaButton(portalUrl, 'Sign in to CareTraker')}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">
      Thank you,<br /><strong style="color:#0f172a;">${escapeHtml(agency)}</strong>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

/** When an EVV enrollment form is assigned to a caregiver */
const sendEvvEnrollmentAssignedEmail = async ({
  to,
  caregiverName,
  agencyName,
  clientName,
  enrollmentCode,
  formUrl,
}) => {
  const agency = agencyName || 'Your agency';
  const subject = `EVV enrollment assigned${clientName ? ` — ${clientName}` : ''}`;
  const portalUrl = formUrl || `${getFrontendUrl()}/caregiver/evv-enrollments`;

  const text = [
    `Hello ${caregiverName},`,
    '',
    `${agency} has assigned you an EVV enrollment form${clientName ? ` for client ${clientName}` : ''}.`,
    enrollmentCode ? `Enrollment code: ${enrollmentCode}` : '',
    '',
    `Open your EVV forms: ${portalUrl}`,
    '',
    'Thank you,',
    agency,
  ].filter(Boolean).join('\n');

  const html = wrapEmail('EVV enrollment assigned', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(caregiverName)},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agency)}</strong> has assigned you an EVV enrollment form
      ${clientName ? ` for client <strong>${escapeHtml(clientName)}</strong>` : ''}.
    </p>
    ${enrollmentCode ? `<p style="margin:0 0 12px;font-size:14px;color:#64748b;">Enrollment code: <strong style="color:#0f172a;">${escapeHtml(enrollmentCode)}</strong></p>` : ''}
    ${ctaButton(portalUrl, 'Complete EVV Form')}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">
      Thank you,<br /><strong style="color:#0f172a;">${escapeHtml(agency)}</strong>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

module.exports = {
  sendMail,
  sendCandidateApplicationEmail,
  sendCandidateStageFormsEmail,
  sendCandidateFormResetEmail,
  sendCaregiverWelcomeEmail,
  sendEvvEnrollmentAssignedEmail,
  isConfigured,
};
