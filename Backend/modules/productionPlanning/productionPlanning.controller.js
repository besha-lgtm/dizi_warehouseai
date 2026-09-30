const service = require('./productionPlanning.service');

exports.getPlanningBatches = async (req, h) => {
  const data = await service.getPlanningBatches();
  return h.response({ success: true, data }).code(200);
};

exports.getAvailableJobs = async (req, h) => {
  const data = await service.getAvailableJobs();
  return h.response({ success: true, data }).code(200);
};

exports.getPlanningBatch = async (req, h) => {
  const data = await service.getPlanningBatch(req.params.batchNo);
  return h.response({ success: true, data }).code(200);
};

exports.createPlanningBatch = async (req, h) => {
  const data = await service.createPlanningBatch(req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.updatePlanningBatch = async (req, h) => {
  const data = await service.updatePlanningBatch(req.params.batchNo, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(200);
};

exports.getPlanningHistory = async (req, h) => {
  const data = await service.getPlanningHistory(req.params.batchNo);
  return h.response({ success: true, data }).code(200);
};