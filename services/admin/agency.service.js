const Model = require('../../models/index');
const functions = require('../../common/functions');

const formatPlan = (plan) => {
  const client = functions.toClientDoc(plan);
  if (client && plan.subscriptionPlanId) {
    client.subscriptionPlanId = String(plan.subscriptionPlanId);
  }
  if (client && client.subscriptionPlanId && typeof client.subscriptionPlanId === 'object') {
    client.subscriptionPlanId = String(client.subscriptionPlanId);
  }
  return client;
};

const formatAgency = (agency) => {
  const client = functions.toClientDoc(agency);
  if (client?.subscriptionPlanId) {
    client.subscriptionPlanId = String(client.subscriptionPlanId);
  }
  return client;
};

const getAll = async () => {
  const agencies = await Model.AgencyModel.find().sort({ createdAt: -1 });
  return functions.toClientList(agencies).map(formatAgency);
};

const getById = async (id) => {
  const agency = await Model.AgencyModel.findById(id);
  if (!agency) throw new Error('Agency Not Found');
  return formatAgency(agency);
};

const create = async (payload) => {
  const agency = await Model.AgencyModel.create(payload);
  return formatAgency(agency);
};

const update = async (id, payload) => {
  const agency = await Model.AgencyModel.findByIdAndUpdate(id, payload, { new: true });
  if (!agency) throw new Error('Agency Not Found');
  return formatAgency(agency);
};

const remove = async (id) => {
  const agency = await Model.AgencyModel.findByIdAndDelete(id);
  if (!agency) throw new Error('Agency Not Found');
  return true;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  formatAgency,
};
