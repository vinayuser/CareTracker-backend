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
  const from = process.env.MAIL_FROM
    || process.env.MAIL_FROM_ADDRESS
    || process.env.SMTP_USER
    || 'noreply@caretraker.com';

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
  formNames = [],
}) => {
  const agency = agencyName || 'Your agency';
  const subject = `Complete your ${stageName} forms — ${jobTitle}`;
  const formsListText = formNames.length
    ? `\nForms to complete:\n${formNames.map((n) => `• ${n}`).join('\n')}\n`
    : '';
  const formsListHtml = formNames.length
    ? `<ul style="margin:0 0 16px;padding-left:20px;color:#334155;">${formNames.map((n) => `<li style="margin:4px 0;">${escapeHtml(n)}</li>`).join('')}</ul>`
    : '';

  const text = [
    `Hello ${candidateName},`,
    '',
    `${agency} has invited you to complete forms for the "${stageName}" stage of your application for ${jobTitle}.`,
    formsListText,
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
      <strong>${escapeHtml(agency)}</strong> has invited you to complete forms for the
      <strong>${escapeHtml(stageName)}</strong> stage of your application for
      <strong>${escapeHtml(jobTitle)}</strong>.
    </p>
    ${formsListHtml}
    ${ctaButton(formUrl, 'Complete Forms')}
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;">
      Or copy this link:<br />
      <a href="${escapeHtml(formUrl)}" style="color:${PRIMARY};word-break:break-all;">${escapeHtml(formUrl)}</a>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">This link is unique to you. Please do not share it.</p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Congrats when candidate completes a round and advances to the next pipeline stage */
const sendCandidateRoundCompletedEmail = async ({
  to,
  candidateName,
  jobTitle,
  agencyName,
  completedStageName,
  nextStageName,
}) => {
  const agency = agencyName || 'Your agency';
  const role = jobTitle || 'the position';
  const completed = completedStageName || 'this round';
  const next = nextStageName || 'the next stage';
  const subject = `Congratulations — you completed ${completed}`;

  const text = [
    `Hello ${candidateName || 'there'},`,
    '',
    `Congratulations! You have successfully completed the "${completed}" round for ${role} with ${agency}.`,
    '',
    `You have been moved to the next stage: "${next}".`,
    'We will follow up if any forms or next steps are required.',
    '',
    'Thank you,',
    agency,
  ].join('\n');

  const html = wrapEmail('Round completed — congratulations!', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(candidateName || 'there')},</p>
    <p style="margin:0 0 12px;">
      Congratulations! You have successfully completed the
      <strong>${escapeHtml(completed)}</strong> round for
      <strong>${escapeHtml(role)}</strong> with
      <strong>${escapeHtml(agency)}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Completed</span><br /><strong>${escapeHtml(completed)}</strong></p>
        <p style="margin:0;"><span style="color:#64748b;">Next stage</span><br /><strong>${escapeHtml(next)}</strong></p>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;color:#64748b;font-size:14px;">
      We will email you if forms or further steps are needed for the next round.
    </p>
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">
      Thank you,<br /><strong style="color:#0f172a;">${escapeHtml(agency)}</strong>
    </p>
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

/** Welcome email when an HR account is created by the agency owner */
const sendHrWelcomeEmail = async ({
  to,
  hrName,
  agencyName,
  email,
  password,
  jobTitle,
  loginUrl,
}) => {
  const agency = agencyName || 'Your agency';
  const portalUrl = loginUrl || `${getFrontendUrl()}/login`;
  const subject = `Welcome to ${agency} — your HR account`;

  const text = [
    `Hello ${hrName},`,
    '',
    `${agency} has created your CareTraker HR account${jobTitle ? ` (${jobTitle})` : ''}.`,
    '',
    `Login email: ${email}`,
    `Password: ${password}`,
    '',
    'Please sign in and change your password after your first login.',
    '',
    `Sign in: ${portalUrl}`,
    '',
    'Thank you,',
    agency,
  ].join('\n');

  const html = wrapEmail('Welcome to CareTraker HR', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(hrName)},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agency)}</strong> has created your CareTraker HR account
      ${jobTitle ? ` for the role of <strong>${escapeHtml(jobTitle)}</strong>` : ''}.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Login email</span><br /><strong>${escapeHtml(email)}</strong></p>
        <p style="margin:0;"><span style="color:#64748b;">Password</span><br /><strong style="font-family:Consolas,Monaco,monospace;letter-spacing:0.02em;">${escapeHtml(password)}</strong></p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;font-size:13px;color:#64748b;">Please change your password after signing in.</p>
    ${ctaButton(portalUrl, 'Sign in to CareTraker')}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">
      Thank you,<br /><strong style="color:#0f172a;">${escapeHtml(agency)}</strong>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Custom message from agency staff to a recipient (HR, candidate, etc.) */
const sendCustomMessageEmail = async ({
  to,
  recipientName,
  agencyName,
  subject,
  message,
  senderName,
}) => {
  const agency = agencyName || 'Your agency';
  const emailSubject = subject || `Message from ${agency}`;
  const body = String(message || '').trim();
  const safeBodyHtml = escapeHtml(body).replace(/\n/g, '<br />');
  const name = recipientName || 'there';

  const text = [
    `Hello ${name},`,
    '',
    body,
    '',
    '—',
    senderName ? `${senderName}` : '',
    agency,
  ].filter(Boolean).join('\n');

  const html = wrapEmail(emailSubject, `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(name)},</p>
    <div style="margin:0 0 16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;color:#334155;line-height:1.55;">
      ${safeBodyHtml}
    </div>
    <p style="margin:0;color:#64748b;font-size:14px;">
      ${senderName ? `${escapeHtml(senderName)}<br />` : ''}
      <strong style="color:#0f172a;">${escapeHtml(agency)}</strong>
    </p>
  `);

  return sendMail({ to, subject: emailSubject, html, text });
};

/** Custom message from agency owner to an HR staff member */
const sendHrCustomEmail = async ({
  to,
  hrName,
  agencyName,
  subject,
  message,
  senderName,
}) => sendCustomMessageEmail({
  to,
  recipientName: hrName,
  agencyName,
  subject,
  message,
  senderName,
});

/** Custom message from agency owner/HR to a candidate */
const sendCandidateCustomEmail = async ({
  to,
  candidateName,
  agencyName,
  subject,
  message,
  senderName,
}) => sendCustomMessageEmail({
  to,
  recipientName: candidateName,
  agencyName,
  subject,
  message,
  senderName,
});

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

const money = (amount) => {
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount ?? '');
  return `$${n.toFixed(2)}`;
};

/** Admin invites an agency owner to register */
const sendAgencyInvitationEmail = async ({
  to,
  agencyName,
  planName,
  planPrice,
  message,
  inviteUrl,
  expiresAt,
}) => {
  const subject = `You're invited to join CareTraker${agencyName ? ` — ${agencyName}` : ''}`;
  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const text = [
    `Hello,`,
    '',
    `You have been invited to register ${agencyName || 'your agency'} on CareTraker.`,
    planName ? `Subscription plan: ${planName}${planPrice != null ? ` (${money(planPrice)})` : ''}` : '',
    message ? `Message: ${message}` : '',
    '',
    `Complete registration: ${inviteUrl}`,
    expiry ? `This invitation expires on ${expiry}.` : '',
    '',
    'Thank you,',
    'CareTraker',
  ].filter(Boolean).join('\n');

  const html = wrapEmail("You're invited to CareTraker", `
    <p style="margin:0 0 12px;">Hello,</p>
    <p style="margin:0 0 12px;">
      You have been invited to register
      <strong>${escapeHtml(agencyName || 'your agency')}</strong> on CareTraker.
    </p>
    ${planName ? `<p style="margin:0 0 12px;font-size:14px;color:#64748b;">Plan: <strong style="color:#0f172a;">${escapeHtml(planName)}</strong>${planPrice != null ? ` · ${escapeHtml(money(planPrice))}` : ''}</p>` : ''}
    ${message ? `<p style="margin:0 0 12px;padding:12px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;color:#334155;">${escapeHtml(message)}</p>` : ''}
    ${ctaButton(inviteUrl, 'Complete Registration')}
    ${expiry ? `<p style="margin:12px 0 0;font-size:13px;color:#94a3b8;">Invitation expires on ${escapeHtml(expiry)}.</p>` : ''}
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">
      Or copy this link:<br />
      <a href="${escapeHtml(inviteUrl)}" style="color:${PRIMARY};word-break:break-all;">${escapeHtml(inviteUrl)}</a>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Welcome email to agency owner after successful registration / payment */
const sendAgencyRegistrationWelcomeEmail = async ({
  to,
  ownerName,
  agencyName,
  planName,
  planPrice,
  loginUrl,
}) => {
  const portalUrl = loginUrl || `${getFrontendUrl()}/login`;
  const subject = `Welcome to CareTraker — ${agencyName || 'your agency'} is ready`;

  const text = [
    `Hello ${ownerName || 'there'},`,
    '',
    `Congratulations! ${agencyName || 'Your agency'} has successfully completed registration on CareTraker.`,
    planName ? `Active plan: ${planName}${planPrice != null ? ` (${money(planPrice)})` : ''}` : '',
    '',
    `Sign in: ${portalUrl}`,
    '',
    'Thank you,',
    'CareTraker',
  ].filter(Boolean).join('\n');

  const html = wrapEmail('Welcome to CareTraker', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(ownerName || 'there')},</p>
    <p style="margin:0 0 12px;">
      Congratulations! <strong>${escapeHtml(agencyName || 'Your agency')}</strong> has successfully
      completed registration and is ready to use CareTraker.
    </p>
    ${planName ? `<p style="margin:0 0 12px;font-size:14px;color:#64748b;">Active plan: <strong style="color:#0f172a;">${escapeHtml(planName)}</strong>${planPrice != null ? ` · ${escapeHtml(money(planPrice))}` : ''}</p>` : ''}
    ${ctaButton(portalUrl, 'Sign in to CareTraker')}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">
      Thank you,<br /><strong style="color:#0f172a;">CareTraker</strong>
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Notify platform admin that an agency finished onboarding */
const sendAdminAgencyOnboardedEmail = async ({
  to,
  agencyName,
  ownerName,
  ownerEmail,
  planName,
  planPrice,
  transactionId,
}) => {
  const subject = `Agency onboarded — ${agencyName || 'New agency'}`;

  const text = [
    'A new agency has completed CareTraker onboarding.',
    '',
    `Agency: ${agencyName || '—'}`,
    `Owner: ${ownerName || '—'} (${ownerEmail || '—'})`,
    planName ? `Plan: ${planName}${planPrice != null ? ` · ${money(planPrice)}` : ''}` : '',
    transactionId ? `Transaction: ${transactionId}` : '',
    '',
    'CareTraker Admin',
  ].filter(Boolean).join('\n');

  const html = wrapEmail('Agency onboarding complete', `
    <p style="margin:0 0 12px;">A new agency has completed CareTraker registration and payment.</p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Agency</span><br /><strong>${escapeHtml(agencyName || '—')}</strong></p>
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Owner</span><br /><strong>${escapeHtml(ownerName || '—')}</strong> · ${escapeHtml(ownerEmail || '—')}</p>
        ${planName ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Plan</span><br /><strong>${escapeHtml(planName)}</strong>${planPrice != null ? ` · ${escapeHtml(money(planPrice))}` : ''}</p>` : ''}
        ${transactionId ? `<p style="margin:0;"><span style="color:#64748b;">Transaction</span><br /><strong>${escapeHtml(transactionId)}</strong></p>` : ''}
      </td></tr>
    </table>
  `);

  return sendMail({ to, subject, html, text });
};

/** Payment invoice / receipt to agency owner */
const sendAgencyPaymentInvoiceEmail = async ({
  to,
  ownerName,
  agencyName,
  planName,
  amount,
  billingCycle,
  transactionId,
  paidAt,
}) => {
  const subject = `Invoice — CareTraker ${planName || 'subscription'}`;
  const paidDate = paidAt
    ? new Date(paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const text = [
    `Hello ${ownerName || 'there'},`,
    '',
    `Payment received for ${agencyName || 'your agency'} on CareTraker.`,
    '',
    `Plan: ${planName || '—'}`,
    `Amount: ${money(amount)}${billingCycle ? ` / ${billingCycle}` : ''}`,
    `Date: ${paidDate}`,
    transactionId ? `Transaction ID: ${transactionId}` : '',
    '',
    'Thank you,',
    'CareTraker Billing',
  ].filter(Boolean).join('\n');

  const html = wrapEmail('Payment invoice', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(ownerName || 'there')},</p>
    <p style="margin:0 0 12px;">
      We received payment for <strong>${escapeHtml(agencyName || 'your agency')}</strong>.
      Here is your invoice summary.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Plan</span><br /><strong>${escapeHtml(planName || '—')}</strong></p>
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Amount</span><br /><strong>${escapeHtml(money(amount))}${billingCycle ? ` / ${escapeHtml(billingCycle)}` : ''}</strong></p>
        <p style="margin:0 0 8px;"><span style="color:#64748b;">Paid on</span><br /><strong>${escapeHtml(paidDate)}</strong></p>
        ${transactionId ? `<p style="margin:0;"><span style="color:#64748b;">Transaction ID</span><br /><strong style="font-family:Consolas,Monaco,monospace;">${escapeHtml(transactionId)}</strong></p>` : ''}
      </td></tr>
    </table>
    <p style="margin:16px 0 0;color:#64748b;font-size:14px;">Thank you for choosing CareTraker.</p>
  `);

  return sendMail({ to, subject, html, text });
};

/** Assessment created — notify recipients (owner / assessor / client) */
const sendAssessmentCreatedEmail = async ({
  to,
  recipientName,
  agencyName,
  clientName,
  assessmentCode,
  assessorName,
  assessmentDate,
  portalUrl,
}) => {
  const subject = `New client assessment${clientName ? ` — ${clientName}` : ''}${assessmentCode ? ` (${assessmentCode})` : ''}`;

  const text = [
    `Hello ${recipientName || 'there'},`,
    '',
    `${agencyName || 'Your agency'} created a new client assessment.`,
    clientName ? `Client: ${clientName}` : '',
    assessmentCode ? `Assessment: ${assessmentCode}` : '',
    assessorName ? `Assessor: ${assessorName}` : '',
    assessmentDate ? `Date: ${assessmentDate}` : '',
    portalUrl ? `View in CareTraker: ${portalUrl}` : '',
    '',
    'Thank you,',
    agencyName || 'CareTraker',
  ].filter(Boolean).join('\n');

  const html = wrapEmail('New client assessment', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(recipientName || 'there')},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agencyName || 'Your agency')}</strong> created a new client assessment.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        ${clientName ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Client</span><br /><strong>${escapeHtml(clientName)}</strong></p>` : ''}
        ${assessmentCode ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Assessment code</span><br /><strong>${escapeHtml(assessmentCode)}</strong></p>` : ''}
        ${assessorName ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Assessor</span><br /><strong>${escapeHtml(assessorName)}</strong></p>` : ''}
        ${assessmentDate ? `<p style="margin:0;"><span style="color:#64748b;">Date</span><br /><strong>${escapeHtml(assessmentDate)}</strong></p>` : ''}
      </td></tr>
    </table>
    ${portalUrl ? ctaButton(portalUrl, 'Open CareTraker') : ''}
  `);

  return sendMail({ to, subject, html, text });
};

/** Quote generated for an assessment */
const sendQuoteGeneratedEmail = async ({
  to,
  recipientName,
  agencyName,
  clientName,
  assessmentCode,
  planCode,
  weeklyHours,
  hourlyRate,
  quotedMonthlyPrice,
  portalUrl,
}) => {
  const subject = `Care quote ready${clientName ? ` — ${clientName}` : ''}`;

  const text = [
    `Hello ${recipientName || 'there'},`,
    '',
    `${agencyName || 'Your agency'} generated a care quote.`,
    clientName ? `Client: ${clientName}` : '',
    assessmentCode ? `Assessment: ${assessmentCode}` : '',
    planCode ? `Care plan: ${planCode}` : '',
    weeklyHours != null ? `Weekly hours: ${weeklyHours}` : '',
    hourlyRate != null ? `Hourly rate: ${money(hourlyRate)}` : '',
    quotedMonthlyPrice != null ? `Quoted monthly: ${money(quotedMonthlyPrice)}` : '',
    portalUrl ? `View: ${portalUrl}` : '',
    '',
    'Thank you,',
    agencyName || 'CareTraker',
  ].filter(Boolean).join('\n');

  const html = wrapEmail('Care quote generated', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(recipientName || 'there')},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agencyName || 'Your agency')}</strong> has generated a care quote
      ${clientName ? ` for <strong>${escapeHtml(clientName)}</strong>` : ''}.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        ${assessmentCode ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Assessment</span><br /><strong>${escapeHtml(assessmentCode)}</strong></p>` : ''}
        ${planCode ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Care plan</span><br /><strong>${escapeHtml(planCode)}</strong></p>` : ''}
        ${weeklyHours != null ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Weekly hours</span><br /><strong>${escapeHtml(String(weeklyHours))}</strong></p>` : ''}
        ${hourlyRate != null ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Hourly rate</span><br /><strong>${escapeHtml(money(hourlyRate))}</strong></p>` : ''}
        ${quotedMonthlyPrice != null ? `<p style="margin:0;"><span style="color:#64748b;">Quoted monthly</span><br /><strong>${escapeHtml(money(quotedMonthlyPrice))}</strong></p>` : ''}
      </td></tr>
    </table>
    ${portalUrl ? ctaButton(portalUrl, 'Review quote') : ''}
  `);

  return sendMail({ to, subject, html, text });
};

/** Quote accepted / client onboarded */
const sendQuoteAcceptedEmail = async ({
  to,
  recipientName,
  agencyName,
  clientName,
  assessmentCode,
  planCode,
  quotedMonthlyPrice,
  portalUrl,
}) => {
  const subject = `Client onboarded${clientName ? ` — ${clientName}` : ''}`;

  const text = [
    `Hello ${recipientName || 'there'},`,
    '',
    `A care quote was accepted and the client is now onboarded.`,
    clientName ? `Client: ${clientName}` : '',
    assessmentCode ? `Assessment: ${assessmentCode}` : '',
    planCode ? `Care plan: ${planCode}` : '',
    quotedMonthlyPrice != null ? `Monthly price: ${money(quotedMonthlyPrice)}` : '',
    portalUrl ? `View: ${portalUrl}` : '',
    '',
    'Thank you,',
    agencyName || 'CareTraker',
  ].filter(Boolean).join('\n');

  const html = wrapEmail('Client onboarded', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(recipientName || 'there')},</p>
    <p style="margin:0 0 12px;">
      The care quote was accepted and
      ${clientName ? `<strong>${escapeHtml(clientName)}</strong> is` : 'the client is'} now onboarded
      with <strong>${escapeHtml(agencyName || 'your agency')}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        ${assessmentCode ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Assessment</span><br /><strong>${escapeHtml(assessmentCode)}</strong></p>` : ''}
        ${planCode ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Care plan</span><br /><strong>${escapeHtml(planCode)}</strong></p>` : ''}
        ${quotedMonthlyPrice != null ? `<p style="margin:0;"><span style="color:#64748b;">Monthly price</span><br /><strong>${escapeHtml(money(quotedMonthlyPrice))}</strong></p>` : ''}
      </td></tr>
    </table>
    ${portalUrl ? ctaButton(portalUrl, 'Open care plan') : ''}
  `);

  return sendMail({ to, subject, html, text });
};

/** Care plan created or updated */
const sendCarePlanUpdatedEmail = async ({
  to,
  recipientName,
  agencyName,
  clientName,
  planCode,
  status,
  action = 'updated',
  portalUrl,
}) => {
  const label = action === 'created' ? 'created' : 'updated';
  const subject = `Care plan ${label}${clientName ? ` — ${clientName}` : ''}${planCode ? ` (${planCode})` : ''}`;

  const text = [
    `Hello ${recipientName || 'there'},`,
    '',
    `${agencyName || 'Your agency'} ${label} a care plan.`,
    clientName ? `Client: ${clientName}` : '',
    planCode ? `Plan code: ${planCode}` : '',
    status ? `Status: ${status}` : '',
    portalUrl ? `View: ${portalUrl}` : '',
    '',
    'Thank you,',
    agencyName || 'CareTraker',
  ].filter(Boolean).join('\n');

  const html = wrapEmail(`Care plan ${label}`, `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(recipientName || 'there')},</p>
    <p style="margin:0 0 12px;">
      <strong>${escapeHtml(agencyName || 'Your agency')}</strong> has ${escapeHtml(label)} a care plan
      ${clientName ? ` for <strong>${escapeHtml(clientName)}</strong>` : ''}.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:12px 0;width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;font-size:14px;">
        ${planCode ? `<p style="margin:0 0 8px;"><span style="color:#64748b;">Plan code</span><br /><strong>${escapeHtml(planCode)}</strong></p>` : ''}
        ${status ? `<p style="margin:0;"><span style="color:#64748b;">Status</span><br /><strong>${escapeHtml(status)}</strong></p>` : ''}
      </td></tr>
    </table>
    ${portalUrl ? ctaButton(portalUrl, 'View care plan') : ''}
  `);

  return sendMail({ to, subject, html, text });
};

/** Password reset link for any portal user */
const sendPasswordResetEmail = async ({
  to,
  name,
  resetUrl,
  expiresAt,
  req,
}) => {
  const subject = 'Reset your CareTraker password';
  const displayName = name || 'there';
  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    : '1 hour';
  const link = resetUrl || `${getFrontendUrl(req)}/reset-password`;

  const text = [
    `Hello ${displayName},`,
    '',
    'We received a request to reset your CareTraker password.',
    '',
    `Reset your password: ${link}`,
    `This link expires at ${expiry}.`,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    'Thank you,',
    'CareTraker',
  ].join('\n');

  const html = wrapEmail('Reset your password', `
    <p style="margin:0 0 12px;">Hello ${escapeHtml(displayName)},</p>
    <p style="margin:0 0 12px;">
      We received a request to reset your CareTraker password. Click the button below to choose a new password.
    </p>
    ${ctaButton(link, 'Reset Password')}
    <p style="margin:12px 0 0;font-size:13px;color:#94a3b8;">
      This link expires at ${escapeHtml(String(expiry))}.
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;">
      Or copy this link:<br />
      <a href="${escapeHtml(link)}" style="color:${PRIMARY};word-break:break-all;">${escapeHtml(link)}</a>
    </p>
    <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;">
      If you did not request a password reset, you can safely ignore this email.
    </p>
  `);

  return sendMail({ to, subject, html, text });
};

module.exports = {
  sendMail,
  sendCandidateApplicationEmail,
  sendCandidateStageFormsEmail,
  sendCandidateFormResetEmail,
  sendCandidateRoundCompletedEmail,
  sendCaregiverWelcomeEmail,
  sendHrWelcomeEmail,
  sendHrCustomEmail,
  sendCandidateCustomEmail,
  sendEvvEnrollmentAssignedEmail,
  sendAgencyInvitationEmail,
  sendAgencyRegistrationWelcomeEmail,
  sendAdminAgencyOnboardedEmail,
  sendAgencyPaymentInvoiceEmail,
  sendAssessmentCreatedEmail,
  sendQuoteGeneratedEmail,
  sendQuoteAcceptedEmail,
  sendCarePlanUpdatedEmail,
  sendPasswordResetEmail,
  isConfigured,
};
