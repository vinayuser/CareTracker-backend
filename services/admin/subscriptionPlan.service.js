const Model = require('../../models/index');
const functions = require('../../common/functions');

const formatPlan = (plan) => functions.toClientDoc(plan);

const getAll = async () => {
  const plans = await Model.SubscriptionPlanModel.find().sort({ createdAt: -1 });
  return functions.toClientList(plans).map(formatPlan);
};

const getActive = async () => {
  const plans = await Model.SubscriptionPlanModel.find({ status: 'Active', isActive: true }).sort({
    price: 1,
  });
  return functions.toClientList(plans).map(formatPlan);
};

const getById = async (id) => {
  const plan = await Model.SubscriptionPlanModel.findById(id);
  if (!plan) throw new Error('Subscription Plan Not Found');
  return formatPlan(plan);
};

const create = async (payload) => {
  const plan = await Model.SubscriptionPlanModel.create(payload);
  return formatPlan(plan);
};

const update = async (id, payload) => {
  const plan = await Model.SubscriptionPlanModel.findByIdAndUpdate(id, payload, { new: true });
  if (!plan) throw new Error('Subscription Plan Not Found');
  return formatPlan(plan);
};

const remove = async (id) => {
  const plan = await Model.SubscriptionPlanModel.findByIdAndDelete(id);
  if (!plan) throw new Error('Subscription Plan Not Found');
  return true;
};

module.exports = {
  getAll,
  getActive,
  getById,
  create,
  update,
  remove,
  formatPlan,
};
