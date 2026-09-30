const service = require('./uomMaster.service');

exports.getUoms = async (req, h) => {
  const data = await service.getUoms();
  return h.response({ success: true, data }).code(200);
};

exports.getActiveUomOptions = async (req, h) => {
  const data = await service.getActiveUomOptions();
  return h.response({ success: true, data }).code(200);
};

exports.createUom = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createUom(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.updateUom = async (req, h) => {
  const updatedBy = req.auth.credentials.employeeName;
  const data = await service.updateUom(req.params.id, req.payload, updatedBy);
  return h.response({ success: true, data }).code(200);
};

exports.deleteUom = async (req, h) => {
  await service.deleteUom(req.params.id);
  return h.response({ success: true }).code(200);
};
