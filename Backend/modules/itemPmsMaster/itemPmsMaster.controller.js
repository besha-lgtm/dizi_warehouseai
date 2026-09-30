const service = require('./itemPmsMaster.service');

exports.getItems = async (req, h) => {
  const data = await service.getItems();
  return h.response({ success: true, data }).code(200);
};

exports.getItem = async (req, h) => {
  const data = await service.getItem(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.createItem = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createItem(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.updateItem = async (req, h) => {
  const updatedBy = req.auth.credentials.employeeName;
  const data = await service.updateItem(req.params.id, req.payload, updatedBy);
  return h.response({ success: true, data }).code(200);
};

exports.deleteItem = async (req, h) => {
  await service.deleteItem(req.params.id);
  return h.response({ success: true }).code(200);
};

exports.getReferenceOptions = async (req, h) => {
  const data = await service.getReferenceOptions();
  return h.response({ success: true, data }).code(200);
};

exports.approveItem = async (req, h) => {
  const actionBy = req.auth.credentials.employeeName;
  const data = await service.approveItem(req.params.id, req.payload?.remarks, actionBy);
  return h.response({ success: true, data }).code(200);
};

exports.rejectItem = async (req, h) => {
  const actionBy = req.auth.credentials.employeeName;
  const data = await service.rejectItem(req.params.id, req.payload?.remarks, actionBy);
  return h.response({ success: true, data }).code(200);
};
