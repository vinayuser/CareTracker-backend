const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');

const formatStage = (doc) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  client.order = client.stageOrder;
  client.documents = (client.documents || []).map((d) => ({
    ...d,
    documentId: d.documentId ? String(d.documentId) : undefined,
  }));
  return client;
};

const formatDocument = (doc) => functions.toClientDoc(doc);

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const assertCanManagePipeline = (req) => {
  if (!req.agency_owner && !req.hr) {
    throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  }
};

const getAvailableDocuments = async () => {
  const docs = await Model.DocumentModel.find({ isActive: true }).sort({ code: 1 });
  return docs.map(formatDocument);
};

const getStages = async (req) => {
  const agencyId = getAgencyId(req);
  const stages = await Model.AgencyStageModel.find({ agencyId, isActive: true }).sort({ stageOrder: 1 });
  return stages.map(formatStage);
};

const getPipeline = async (req) => {
  const [stages, availableDocuments] = await Promise.all([
    getStages(req),
    getAvailableDocuments(),
  ]);
  return { stages, availableDocuments };
};

const resolveStageDocuments = async (documents = []) => {
  if (!documents.length) return [];

  const codes = documents.map((d) => d.code);
  const catalog = await Model.DocumentModel.find({ code: { $in: codes }, isActive: true });
  const byCode = Object.fromEntries(catalog.map((d) => [d.code, d]));

  return documents.map((doc, index) => {
    const catalogDoc = byCode[doc.code];
    if (!catalogDoc) return null;
    return {
      documentId: catalogDoc._id,
      code: catalogDoc.code,
      name: catalogDoc.name,
      isRequired: doc.isRequired !== false,
      order: doc.order ?? index + 1,
    };
  }).filter(Boolean);
};

const savePipeline = async (req, payload) => {
  assertCanManagePipeline(req);
  const agencyId = getAgencyId(req);
  const { stages = [] } = payload;

  if (!stages.length) {
    throw new Error(constants.MESSAGE.HIRING_PIPELINE.STAGES_REQUIRED);
  }

  const stageDocs = await Promise.all(
    stages.map(async (stage, index) => ({
      agencyId,
      name: stage.name,
      type: stage.type || 'hiring',
      stageOrder: stage.order ?? index + 1,
      isActive: true,
      documents: await resolveStageDocuments(stage.documents || []),
    })),
  );

  await Model.AgencyStageModel.deleteMany({ agencyId });
  const created = await Model.AgencyStageModel.insertMany(stageDocs);
  return created.map(formatStage);
};

const createStage = async (req, payload) => {
  assertCanManagePipeline(req);
  const agencyId = getAgencyId(req);

  const maxOrder = await Model.AgencyStageModel.findOne({ agencyId }).sort({ stageOrder: -1 });
  const stageOrder = payload.stageOrder ?? (maxOrder ? maxOrder.stageOrder + 1 : 1);

  const stage = await Model.AgencyStageModel.create({
    agencyId,
    name: payload.name,
    type: payload.type || 'hiring',
    stageOrder,
    isActive: true,
    documents: await resolveStageDocuments(payload.documents || []),
  });

  return formatStage(stage);
};

const updateStage = async (req, stageId, payload) => {
  assertCanManagePipeline(req);
  const agencyId = getAgencyId(req);
  const stage = await Model.AgencyStageModel.findOne({ _id: stageId, agencyId });
  if (!stage) throw new Error(constants.MESSAGE.HIRING_PIPELINE.STAGE_NOT_FOUND);

  if (payload.name !== undefined) stage.name = payload.name;
  if (payload.type !== undefined) stage.type = payload.type;
  if (payload.stageOrder !== undefined) stage.stageOrder = payload.stageOrder;
  if (payload.isActive !== undefined) stage.isActive = payload.isActive;
  if (payload.documents !== undefined) {
    stage.documents = await resolveStageDocuments(payload.documents);
  }

  await stage.save();
  return formatStage(stage);
};

const deleteStage = async (req, stageId) => {
  assertCanManagePipeline(req);
  const agencyId = getAgencyId(req);
  const stage = await Model.AgencyStageModel.findOne({ _id: stageId, agencyId });
  if (!stage) throw new Error(constants.MESSAGE.HIRING_PIPELINE.STAGE_NOT_FOUND);

  await stage.deleteOne();
  return { deleted: true };
};

const reorderStages = async (req, payload) => {
  assertCanManagePipeline(req);
  const agencyId = getAgencyId(req);
  const { stages = [] } = payload;

  await Promise.all(
    stages.map((item) =>
      Model.AgencyStageModel.updateOne(
        { _id: item.id, agencyId },
        { stageOrder: item.order },
      ),
    ),
  );

  return getStages(req);
};

const createDefaultStages = async (agencyId) => {
  const existing = await Model.AgencyStageModel.countDocuments({ agencyId });
  if (existing > 0) return;

  const defaultStages = [
    {
      name: 'Pre-Hire',
      type: 'hiring',
      order: 1,
      documents: [
        { code: '1020', isRequired: true, order: 1 },
        { code: '1021', isRequired: true, order: 2 },
        { code: '1050', isRequired: true, order: 3 },
        { code: '1060', isRequired: true, order: 4 },
        { code: '1070', isRequired: true, order: 5 },
        { code: '1204', isRequired: true, order: 6 },
      ],
    },
    {
      name: 'Onboarding',
      type: 'onboarding',
      order: 2,
      documents: [
        { code: '1010', isRequired: true, order: 1 },
        { code: '1201', isRequired: true, order: 2 },
        { code: '1202', isRequired: true, order: 3 },
        { code: '1203', isRequired: true, order: 4 },
        { code: '1220', isRequired: true, order: 5 },
        { code: '1530', isRequired: true, order: 6 },
        { code: '1600', isRequired: true, order: 7 },
        { code: '1720', isRequired: true, order: 8 },
        { code: '1740', isRequired: true, order: 9 },
        { code: '2900', isRequired: true, order: 10 },
        { code: '4000', isRequired: true, order: 11 },
        { code: 'I-9', isRequired: true, order: 12 },
        { code: 'W-4', isRequired: true, order: 13 },
      ],
    },
  ];

  const stageDocs = await Promise.all(
    defaultStages.map(async (stage) => ({
      agencyId,
      name: stage.name,
      type: stage.type,
      stageOrder: stage.order,
      isActive: true,
      documents: await resolveStageDocuments(stage.documents),
    })),
  );

  await Model.AgencyStageModel.insertMany(stageDocs);
};

module.exports = {
  getAvailableDocuments,
  getStages,
  getPipeline,
  savePipeline,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  createDefaultStages,
  formatStage,
};
