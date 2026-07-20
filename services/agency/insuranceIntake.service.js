const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');
const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const insuranceConstants = require('../../common/insuranceIntakeConstants');
const { formatClient } = require('./client.service');
const { DOC_KEYS } = require('../../middleware/insuranceIntakeUpload');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const getAccountId = (req) => {
  const account = getAgencyAccount(req);
  return account?._id || account?.id;
};

const syncSummaryFields = (formData = {}) => {
  const ci = formData.clientInfo || {};
  return {
    clientName: ci.clientFullName || '',
    clientPhone: ci.phoneMobile || ci.phoneHome || '',
    clientEmail: ci.email || '',
  };
};

const normalizeDocEntry = (value) => {
  if (!value || value === true || value === false) return null;
  if (typeof value !== 'object') return null;
  const filePath = String(value.path || '').trim();
  if (!filePath) return null;
  return {
    path: filePath,
    originalName: String(value.originalName || '').trim(),
    mimeType: String(value.mimeType || '').trim(),
    size: Number(value.size) || 0,
    uploadedAt: value.uploadedAt || null,
  };
};

const normalizeRequiredDocuments = (docs = {}) => {
  const next = {};
  DOC_KEYS.forEach((key) => {
    next[key] = normalizeDocEntry(docs?.[key]);
  });
  return next;
};

const enrichDocuments = (docs = {}, req) => {
  const normalized = normalizeRequiredDocuments(docs);
  const enriched = {};
  DOC_KEYS.forEach((key) => {
    const entry = normalized[key];
    if (!entry) {
      enriched[key] = null;
      return;
    }
    enriched[key] = {
      ...entry,
      url: functions.buildUploadUrl(entry.path, req),
    };
  });
  return enriched;
};

const absoluteUploadPath = (relativePath) => {
  let clean = String(relativePath || '').replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) clean = clean.slice('uploads/'.length);
  return path.join(__dirname, '../../uploads', clean);
};

const unlinkQuiet = (relativePath) => {
  if (!relativePath) return;
  try {
    const abs = absoluteUploadPath(relativePath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    // ignore
  }
};

const formatInsuranceIntake = (doc, client = null, req = null) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.clientId = doc.clientId ? String(doc.clientId._id || doc.clientId || '') : null;
  if (item.formData) {
    item.formData = {
      ...item.formData,
      requiredDocuments: enrichDocuments(item.formData.requiredDocuments, req),
    };
  }
  item.documentCount = DOC_KEYS.filter((key) => item.formData?.requiredDocuments?.[key]?.path).length;
  if (client) {
    item.client = typeof client === 'object' && client.firstName
      ? formatClient(client)
      : client;
  }
  return item;
};

const generateIntakeCode = async (agencyId) => {
  const count = await Model.ClientInsuranceIntakeModel.countDocuments({ agencyId });
  return `INS-${String(10001 + count).padStart(5, '0')}`;
};

const getOptions = async () => ({
  statuses: insuranceConstants.INSURANCE_INTAKE_STATUSES,
  primary_insurance_types: insuranceConstants.PRIMARY_INSURANCE_TYPES,
  genders: insuranceConstants.GENDERS,
  marital_statuses: insuranceConstants.MARITAL_STATUSES,
  relationships: insuranceConstants.RELATIONSHIPS,
  medicare_types: insuranceConstants.MEDICARE_TYPES,
  auth_statuses: insuranceConstants.AUTH_STATUSES,
  required_documents: insuranceConstants.REQUIRED_DOCUMENTS,
});

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.ClientInsuranceIntakeModel.find({ agencyId });
  return {
    total: list.length,
    draft: list.filter((i) => i.status === 'Draft').length,
    submitted: list.filter((i) => i.status === 'Submitted').length,
    verified: list.filter((i) => i.status === 'Verified').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };

  if (query.status && query.status !== 'All') {
    filter.status = query.status;
  }
  if (query.client_id) {
    filter.clientId = query.client_id;
  }
  if (query.search) {
    const search = String(query.search).trim();
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { intakeCode: regex },
      { clientName: regex },
      { clientEmail: regex },
      { clientPhone: regex },
    ];
  }

  const list = await Model.ClientInsuranceIntakeModel.find(filter)
    .populate('clientId')
    .sort({ createdAt: -1 });

  return list.map((doc) => formatInsuranceIntake(doc, doc.clientId, req));
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);
  return formatInsuranceIntake(doc, doc.clientId, req);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  let client = null;
  if (payload.clientId) {
    client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  }

  const formData = {
    ...(payload.formData || {}),
    requiredDocuments: normalizeRequiredDocuments(payload.formData?.requiredDocuments),
  };
  const summary = syncSummaryFields(formData);
  const intakeCode = await generateIntakeCode(agencyId);

  const doc = await Model.ClientInsuranceIntakeModel.create({
    agencyId,
    intakeCode,
    status: payload.status || 'Draft',
    intakeDate: payload.intakeDate || new Date().toISOString().split('T')[0],
    clientId: client?._id || null,
    ...summary,
    formData,
    createdByAccountId: getAccountId(req),
  });

  const populated = await Model.ClientInsuranceIntakeModel.findById(doc._id).populate('clientId');
  return formatInsuranceIntake(populated, populated.clientId || null, req);
};

const mergeRequiredDocumentsOnUpdate = (existing = {}, incoming = {}) => {
  const prev = normalizeRequiredDocuments(existing);
  const nextIncoming = normalizeRequiredDocuments(incoming);
  const merged = {};
  DOC_KEYS.forEach((key) => {
    // Keep previous file unless client sends a replacement path object
    merged[key] = nextIncoming[key]?.path ? nextIncoming[key] : prev[key];
  });
  return merged;
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);

  if (payload.clientId) {
    const client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
    doc.clientId = client._id;
  }

  if (payload.status !== undefined) doc.status = payload.status;
  if (payload.intakeDate !== undefined) doc.intakeDate = payload.intakeDate;
  if (payload.formData) {
    const prevDocs = doc.formData?.requiredDocuments || {};
    doc.formData = {
      ...payload.formData,
      requiredDocuments: mergeRequiredDocumentsOnUpdate(
        prevDocs,
        payload.formData.requiredDocuments,
      ),
    };
    const summary = syncSummaryFields(doc.formData);
    doc.clientName = summary.clientName;
    doc.clientPhone = summary.clientPhone;
    doc.clientEmail = summary.clientEmail;
  }

  await doc.save();
  const populated = await Model.ClientInsuranceIntakeModel.findById(doc._id).populate('clientId');
  return formatInsuranceIntake(populated, populated.clientId || null, req);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);

  const docs = normalizeRequiredDocuments(doc.formData?.requiredDocuments);
  DOC_KEYS.forEach((key) => unlinkQuiet(docs[key]?.path));

  await Model.ClientInsuranceIntakeModel.deleteOne({ _id: id });
  return { id: String(id) };
};

const uploadDocument = async (req, id, docKey) => {
  if (!DOC_KEYS.includes(docKey)) {
    throw new Error(constants.MESSAGE.INSURANCE_INTAKE.DOCUMENT_INVALID);
  }
  if (!req.file) throw new Error('Document file is required');

  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);

  const formData = doc.formData || {};
  const requiredDocuments = normalizeRequiredDocuments(formData.requiredDocuments);
  const previous = requiredDocuments[docKey];
  if (previous?.path) unlinkQuiet(previous.path);

  const relativePath = `insurance-intakes/${id}/${req.file.filename}`;
  requiredDocuments[docKey] = {
    path: relativePath,
    originalName: req.file.originalname || req.file.filename,
    mimeType: req.file.mimetype || '',
    size: req.file.size || 0,
    uploadedAt: new Date().toISOString(),
  };

  doc.formData = { ...formData, requiredDocuments };
  doc.markModified('formData');
  await doc.save();

  const populated = await Model.ClientInsuranceIntakeModel.findById(doc._id).populate('clientId');
  return formatInsuranceIntake(populated, populated.clientId || null, req);
};

const removeDocument = async (req, id, docKey) => {
  if (!DOC_KEYS.includes(docKey)) {
    throw new Error(constants.MESSAGE.INSURANCE_INTAKE.DOCUMENT_INVALID);
  }

  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);

  const formData = doc.formData || {};
  const requiredDocuments = normalizeRequiredDocuments(formData.requiredDocuments);
  const previous = requiredDocuments[docKey];
  if (previous?.path) unlinkQuiet(previous.path);
  requiredDocuments[docKey] = null;

  doc.formData = { ...formData, requiredDocuments };
  doc.markModified('formData');
  await doc.save();

  const populated = await Model.ClientInsuranceIntakeModel.findById(doc._id).populate('clientId');
  return formatInsuranceIntake(populated, populated.clientId || null, req);
};

const streamDocumentsZip = async (req, res, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);

  const requiredDocuments = normalizeRequiredDocuments(doc.formData?.requiredDocuments);
  const files = DOC_KEYS
    .map((key) => {
      const entry = requiredDocuments[key];
      if (!entry?.path) return null;
      const abs = absoluteUploadPath(entry.path);
      if (!fs.existsSync(abs)) return null;
      const label = insuranceConstants.REQUIRED_DOCUMENTS.find((d) => d.key === key)?.label || key;
      const ext = path.extname(entry.originalName || entry.path) || path.extname(abs) || '';
      const safeLabel = String(label).replace(/[^\w.\- ]+/g, '').trim() || key;
      return {
        abs,
        name: `${safeLabel}${ext}`,
      };
    })
    .filter(Boolean);

  if (!files.length) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.DOCUMENTS_EMPTY);

  const zipName = `${doc.intakeCode || 'insurance-intake'}-documents.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message || 'Failed to create zip' });
    } else {
      res.end();
    }
  });
  archive.pipe(res);
  files.forEach((file) => archive.file(file.abs, { name: file.name }));
  await archive.finalize();
};

module.exports = {
  getOptions,
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
  uploadDocument,
  removeDocument,
  streamDocumentsZip,
};
