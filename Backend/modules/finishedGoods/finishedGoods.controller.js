const service = require('./finishedGoods.service');

exports.getFinishedGoods = async (req, h) => {
  const data = await service.getFinishedGoods();
  return h.response({ success: true, data }).code(200);
};

exports.getFinishedGood = async (req, h) => {
  const data = await service.getFinishedGood(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.updateFinishedGood = async (req, h) => {
  const data = await service.updateFinishedGood(req.params.id, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(200);
};