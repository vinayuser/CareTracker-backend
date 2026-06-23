const { getAgencyId } = require('./jobPost.service');
const Model = require('../../models/index');

const FIELD_LABELS = {
  job_title: 'Job title',
  job_code: 'Job code',
  job_workplace: 'Workplace',
  job_location: 'Location',
  job_department: 'Department',
  job_function: 'Job function',
  employment_type: 'Employment type',
  experience: 'Experience',
  education: 'Education',
  currency: 'Currency',
  annual_salary_from: 'Salary from',
  annual_salary_to: 'Salary to',
  keywords: 'Keywords',
};

const parseGroqJson = (content) => {
  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed.description && parsed.requirements && parsed.benefits) {
      return {
        job_description: String(parsed.description).slice(0, 600),
        job_requirements: String(parsed.requirements).slice(0, 600),
        job_benefits: String(parsed.benefits).slice(0, 600),
      };
    }
  } catch {
    return null;
  }
  return null;
};

const groqChatCompletion = async (apiKey, body) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Groq API error ${response.status}`);
  }
  return response.json();
};

const buildContext = (payload) => {
  const context = {};
  const allowed = [
    'job_title', 'job_code', 'job_workplace', 'job_location', 'job_department',
    'job_function', 'employment_type', 'experience', 'education', 'keywords',
    'annual_salary_from', 'annual_salary_to', 'currency',
  ];
  allowed.forEach((key) => {
    const val = payload[key];
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val) && val.length === 0) return;
    context[key] = val;
  });
  return context;
};

const generateJobContent = async (req, payload) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const err = new Error('AI generation is not configured. Set GROQ_API_KEY in the server environment.');
    err.statusCode = 503;
    throw err;
  }

  const context = buildContext(payload);
  if (Object.keys(context).length === 0) {
    const err = new Error('Fill at least one job detail (for example job title or job code) before generating with AI.');
    err.statusCode = 422;
    throw err;
  }

  const agencyId = getAgencyId(req);
  const agency = await Model.AgencyModel.findById(agencyId);
  const companyName = agency?.name || 'the agency';

  const lines = Object.entries(context).map(([key, val]) => {
    const value = Array.isArray(val) ? val.join(', ') : val;
    return `- ${FIELD_LABELS[key] || key}: ${value}`;
  });

  const system = 'You are an expert HR copywriter. Respond with ONLY a single JSON object, no markdown, no code fences. '
    + 'The JSON must have exactly these keys: "description", "requirements", "benefits". '
    + 'Each value is a string: professional job posting text for that section. '
    + 'Use plain text; line breaks are allowed inside strings. '
    + 'Keep each value at most 550 characters. Do not include URLs or application links.';

  const userPrompt = `Company name: ${companyName}.\n`
    + 'The employer provided only the following details (use every relevant item; infer reasonable professional tone where helpful):\n'
    + `${lines.join('\n')}\n\n`
    + 'Write: (1) description — "About the role" overview; (2) requirements — skills, experience, qualifications as readable text; '
    + '(3) benefits — compensation culture perks as readable text. Output JSON only.';

  const groqJson = await groqChatCompletion(apiKey, {
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.55,
    max_tokens: 4096,
  });

  const content = groqJson?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error('Empty response from AI.');
    err.statusCode = 502;
    throw err;
  }

  const parsed = parseGroqJson(content);
  if (!parsed) {
    const err = new Error('Could not parse AI response. Try again.');
    err.statusCode = 502;
    throw err;
  }

  return parsed;
};

module.exports = { generateJobContent };
