const service = require('./supplierPO.service');

exports.getPurchaseOrders = async (req, h) => {
  const data = await service.getPurchaseOrders();
  return h.response({ success: true, data }).code(200);
};

exports.getPurchaseOrder = async (req, h) => {
  const data = await service.getPurchaseOrder(req.params.poNumber);
  return h.response({ success: true, data }).code(200);
};

exports.createPurchaseOrder = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createPurchaseOrder(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.updatePurchaseOrder = async (req, h) => {
  const updatedBy = req.auth.credentials.employeeName;
  const data = await service.updatePurchaseOrder(req.params.poNumber, { ...req.payload, updatedBy });
  return h.response({ success: true, data }).code(200);
};

exports.deletePurchaseOrder = async (req, h) => {
  await service.deletePurchaseOrder(req.params.poNumber);
  return h.response({ success: true }).code(200);
};

exports.getRawMaterialOptions = async (req, h) => {
  const data = await service.getRawMaterialOptions(req.query.category);
  return h.response({ success: true, data }).code(200);
};
