const service = require('./materialReceipt.service');

exports.getDeliveries = async (req, h) => {
  const data = await service.getDeliveries();
  return h.response({ success: true, data }).code(200);
};

exports.getDelivery = async (req, h) => {
  const data = await service.getDelivery(req.params.grnNo);
  return h.response({ success: true, data }).code(200);
};

exports.createReceipt = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createReceipt(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.decideDelivery = async (req, h) => {
  const decidedBy = req.auth.credentials.employeeName;
  const data = await service.decideDelivery(req.params.grnNo, req.payload, decidedBy);
  return h.response({ success: true, data }).code(200);
};

exports.getStockSummary = async (req, h) => {
  const data = await service.getStockSummary();
  return h.response({ success: true, data }).code(200);
};
