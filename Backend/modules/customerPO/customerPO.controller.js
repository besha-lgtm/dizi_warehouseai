const service = require('./customerPO.service');

exports.getPurchaseOrders = async (req, h) => {
  const data = await service.getPurchaseOrders();
  return h.response({ success: true, data }).code(200);
};

exports.getPurchaseOrder = async (req, h) => {
  const data = await service.getPurchaseOrder(req.params.poNo);
  return h.response({ success: true, data }).code(200);
};

exports.createPurchaseOrder = async (req, h) => {
  const requestedBy = req.auth.credentials.employeeName;
  const data = await service.createPurchaseOrder(req.payload, requestedBy);
  return h.response({ success: true, data }).code(201);
};

exports.updatePurchaseOrder = async (req, h) => {
  const data = await service.updatePurchaseOrder(req.params.poNo, req.payload);
  return h.response({ success: true, data }).code(200);
};

exports.deletePurchaseOrder = async (req, h) => {
  await service.deletePurchaseOrder(req.params.poNo);
  return h.response({ success: true }).code(200);
};
