const service = require('./productionExecution.service');

exports.getExecutionBatches = async (req, h) => {
  const data = await service.getExecutionBatches();
  return h.response({ success: true, data }).code(200);
};

exports.getAvailablePlans = async (req, h) => {
  const data = await service.getAvailablePlans();
  return h.response({ success: true, data }).code(200);
};

exports.getExecutionBatch = async (req, h) => {
  const data = await service.getExecutionBatch(req.params.batchNo);
  return h.response({ success: true, data }).code(200);
};

exports.createExecutionBatch = async (req, h) => {
  const data = await service.createExecutionBatch(req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.updateExecutionBatch = async (req, h) => {
  const data = await service.updateExecutionBatch(req.params.batchNo, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(200);
};

exports.addDowntimeLog = async (req, h) => {
  const data = await service.addDowntimeLog(req.params.batchNo, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.deleteDowntimeLog = async (req, h) => {
  const data = await service.deleteDowntimeLog(req.params.batchNo, req.params.logId);
  return h.response({ success: true, data }).code(200);
};

exports.addMaterialConsumption = async (req, h) => {
  const data = await service.addMaterialConsumption(req.params.batchNo, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.deleteMaterialConsumption = async (req, h) => {
  const data = await service.deleteMaterialConsumption(req.params.batchNo, req.params.logId);
  return h.response({ success: true, data }).code(200);
};