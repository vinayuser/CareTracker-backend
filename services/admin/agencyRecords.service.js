const fs = require('fs');
const path = require('path');
const Model = require('../../models/index');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');

const DOCUMENT_CATEGORIES = ['Legal', 'Insurance', 'Tax', 'Policy', 'Finance', 'HR', 'Other'];
const NOTE_CATEGORIES = ['Onboarding', 'Billing', 'Operations', 'Compliance', 'Review', 'Other'];
const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

const toIsoDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : null;
  }
  return d.toISOString().slice(0, 10);
};

const assertAgency = async (agencyId) => {
  const agency = await Model.AgencyModel.findById(agencyId).select('_id name');
  if (!agency) throw new Error('Agency Not Found');
  return agency;
};

const actorName = (req) => req.super_admin?.name || req.super_admin?.email || 'Super Admin';
const actorId = (req) => req.super_admin?._id || req.super_admin?.id || null;

const resolveStatus = (expiryDate, status) => {
  if (status === 'Archived') return 'Archived';
  if (!expiryDate) return status || 'Active';
  const expiry = new Date(`${String(expiryDate).slice(0, 10)}T12:00:00`);
  if (!Number.isNaN(expiry.getTime()) && expiry < new Date()) return 'Expired';
  return status || 'Active';
};

const formatDocument = (doc) => {
  const client = functions.toClientDoc(doc);
  return {
    id: client.id,
    name: client.name,
    originalName: client.originalName || client.name,
    category: client.category || 'Other',
    fileUrl: buildUploadUrl(client.filePath),
    mimeType: client.mimeType || '',
    fileSize: client.fileSize || 0,
    expiryDate: client.expiryDate || '',
    status: resolveStatus(client.expiryDate, client.status),
    isFavorite: Boolean(client.isFavorite),
    uploadedByName: client.uploadedByName || '—',
    uploadedAt: client.createdAt,
    uploadDate: toIsoDate(client.createdAt),
  };
};

const formatNote = (note) => {
  const client = functions.toClientDoc(note);
  return {
    id: client.id,
    title: client.title,
    body: client.body || '',
    preview: String(client.body || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    category: client.category || 'Other',
    tags: Array.isArray(client.tags) ? client.tags.filter(Boolean) : [],
    isFavorite: Boolean(client.isFavorite),
    createdByName: client.createdByName || '—',
    createdAt: client.createdAt,
    createdOn: client.createdAt,
  };
};

const paginate = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 7));
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  from: total === 0 ? 0 : (page - 1) * limit + 1,
  to: Math.min(page * limit, total),
});

const documentFilter = (agencyId, query = {}) => {
  const filter = { agencyId };
  const category = String(query.category || 'All').trim();
  const status = String(query.status || 'All').trim();
  const search = String(query.search || '').trim();
  const favorites = String(query.favorites || '') === 'true';

  if (category && category !== 'All') filter.category = category;
  if (status && status !== 'All') filter.status = status;
  if (favorites) filter.isFavorite = true;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { originalName: regex }, { category: regex }];
  }
  return filter;
};

const noteFilter = (agencyId, query = {}) => {
  const filter = { agencyId };
  const category = String(query.category || 'All').trim();
  const search = String(query.search || '').trim();
  const tag = String(query.tag || '').trim();
  const favorites = String(query.favorites || '') === 'true';

  if (category && category !== 'All') filter.category = category;
  if (tag) filter.tags = tag;
  if (favorites) filter.isFavorite = true;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: regex }, { body: regex }, { createdByName: regex }, { tags: regex }];
  }
  return filter;
};

const getDocumentCategoryCounts = async (agencyId) => {
  const [total, groups] = await Promise.all([
    Model.AgencyDocumentModel.countDocuments({ agencyId }),
    Model.AgencyDocumentModel.aggregate([
      { $match: { agencyId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);
  const byName = Object.fromEntries(groups.map((row) => [row._id, row.count]));
  return {
    total,
    items: DOCUMENT_CATEGORIES.map((name) => ({ name, count: byName[name] || 0 })),
  };
};

const getStorageUsage = async (agencyId) => {
  const [agg] = await Model.AgencyDocumentModel.aggregate([
    { $match: { agencyId } },
    { $group: { _id: null, used: { $sum: '$fileSize' } } },
  ]);
  const used = agg?.used || 0;
  return {
    used,
    limit: STORAGE_LIMIT_BYTES,
    percent: STORAGE_LIMIT_BYTES ? Number(((used / STORAGE_LIMIT_BYTES) * 100).toFixed(1)) : 0,
  };
};

const getDocuments = async (agencyId, query = {}) => {
  const agency = await assertAgency(agencyId);
  const { page, limit, skip } = paginate({ ...query, limit: query.limit || 7 });
  const filter = documentFilter(agency._id, query);

  const [total, rows, categories, storage] = await Promise.all([
    Model.AgencyDocumentModel.countDocuments(filter),
    Model.AgencyDocumentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    getDocumentCategoryCounts(agency._id),
    getStorageUsage(agency._id),
  ]);

  return {
    list: rows.map(formatDocument),
    pagination: paginationMeta(page, limit, total),
    categories,
    storage,
  };
};

const createDocument = async (req, agencyId, payload = {}, file) => {
  const agency = await assertAgency(agencyId);
  if (!file) throw new Error('Document file is required');

  const relativePath = `agency-documents/${agency._id}/${file.filename}`;
  const doc = await Model.AgencyDocumentModel.create({
    agencyId: agency._id,
    name: String(payload.name || file.originalname || 'Document').trim(),
    originalName: file.originalname || '',
    category: DOCUMENT_CATEGORIES.includes(payload.category) ? payload.category : 'Other',
    filePath: relativePath,
    mimeType: file.mimetype || 'application/octet-stream',
    fileSize: file.size || 0,
    expiryDate: payload.expiryDate || '',
    status: resolveStatus(payload.expiryDate, payload.status || 'Active'),
    uploadedById: actorId(req),
    uploadedByName: actorName(req),
  });
  return formatDocument(doc);
};

const updateDocument = async (agencyId, id, payload = {}) => {
  const agency = await assertAgency(agencyId);
  const doc = await Model.AgencyDocumentModel.findOne({ _id: id, agencyId: agency._id });
  if (!doc) throw new Error('Document not found');

  if (payload.name !== undefined) doc.name = String(payload.name).trim();
  if (payload.category !== undefined && DOCUMENT_CATEGORIES.includes(payload.category)) {
    doc.category = payload.category;
  }
  if (payload.expiryDate !== undefined) doc.expiryDate = payload.expiryDate || '';
  if (payload.status !== undefined) doc.status = payload.status;
  if (payload.isFavorite !== undefined) doc.isFavorite = Boolean(payload.isFavorite);
  doc.status = resolveStatus(doc.expiryDate, doc.status);
  await doc.save();
  return formatDocument(doc);
};

const deleteDocument = async (agencyId, id) => {
  const agency = await assertAgency(agencyId);
  const doc = await Model.AgencyDocumentModel.findOne({ _id: id, agencyId: agency._id });
  if (!doc) throw new Error('Document not found');

  if (doc.filePath) {
    const full = path.join(__dirname, '../../uploads', String(doc.filePath).replace(/^uploads\//, ''));
    try {
      fs.unlinkSync(full);
    } catch {
      // file may already be gone
    }
  }
  await doc.deleteOne();
  return true;
};

const getNoteCategoryCounts = async (agencyId) => {
  const [total, groups] = await Promise.all([
    Model.AgencyNoteModel.countDocuments({ agencyId }),
    Model.AgencyNoteModel.aggregate([
      { $match: { agencyId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);
  const byName = Object.fromEntries(groups.map((row) => [row._id, row.count]));
  return {
    total,
    items: NOTE_CATEGORIES.map((name) => ({ name, count: byName[name] || 0 })),
  };
};

const getPopularTags = async (agencyId) => {
  const groups = await Model.AgencyNoteModel.aggregate([
    { $match: { agencyId } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 12 },
  ]);
  return groups.map((row) => ({ name: row._id, count: row.count }));
};

const getNotes = async (agencyId, query = {}) => {
  const agency = await assertAgency(agencyId);
  const { page, limit, skip } = paginate({ ...query, limit: query.limit || 5 });
  const filter = noteFilter(agency._id, query);

  const [total, rows, categories, tags] = await Promise.all([
    Model.AgencyNoteModel.countDocuments(filter),
    Model.AgencyNoteModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    getNoteCategoryCounts(agency._id),
    getPopularTags(agency._id),
  ]);

  return {
    list: rows.map(formatNote),
    pagination: paginationMeta(page, limit, total),
    categories,
    tags,
  };
};

const createNote = async (req, agencyId, payload = {}) => {
  const agency = await assertAgency(agencyId);
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Note title is required');
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((t) => String(t).trim()).filter(Boolean)
    : String(payload.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const note = await Model.AgencyNoteModel.create({
    agencyId: agency._id,
    title,
    body: String(payload.body || '').trim(),
    category: NOTE_CATEGORIES.includes(payload.category) ? payload.category : 'Other',
    tags,
    createdById: actorId(req),
    createdByName: actorName(req),
  });
  return formatNote(note);
};

const updateNote = async (agencyId, id, payload = {}) => {
  const agency = await assertAgency(agencyId);
  const note = await Model.AgencyNoteModel.findOne({ _id: id, agencyId: agency._id });
  if (!note) throw new Error('Note not found');

  if (payload.title !== undefined) note.title = String(payload.title).trim();
  if (payload.body !== undefined) note.body = String(payload.body).trim();
  if (payload.category !== undefined && NOTE_CATEGORIES.includes(payload.category)) {
    note.category = payload.category;
  }
  if (payload.tags !== undefined) {
    note.tags = Array.isArray(payload.tags)
      ? payload.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(payload.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (payload.isFavorite !== undefined) note.isFavorite = Boolean(payload.isFavorite);
  await note.save();
  return formatNote(note);
};

const deleteNote = async (agencyId, id) => {
  const agency = await assertAgency(agencyId);
  const note = await Model.AgencyNoteModel.findOne({ _id: id, agencyId: agency._id });
  if (!note) throw new Error('Note not found');
  await note.deleteOne();
  return true;
};

module.exports = {
  DOCUMENT_CATEGORIES,
  NOTE_CATEGORIES,
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  getNotes,
  createNote,
  updateNote,
  deleteNote,
};
