const service = require('./qcIncoming.service');

exports.getInspections = async (req, h) => {
  const data = await service.getInspections();
  return h.response({ success: true, data }).code(200);
};

exports.getInspection = async (req, h) => {
  const data = await service.getInspection(req.params.inspectionNo);
  return h.response({ success: true, data }).code(200);
};

exports.createInspection = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createInspection(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.updateInspection = async (req, h) => {
  const updatedBy = req.auth.credentials.employeeName;
  const data = await service.updateInspection(req.params.inspectionNo, req.payload, updatedBy);
  return h.response({ success: true, data }).code(200);
};

exports.deleteInspection = async (req, h) => {
  await service.deleteInspection(req.params.inspectionNo);
  return h.response({ success: true }).code(200);
};
