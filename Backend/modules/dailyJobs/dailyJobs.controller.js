const service = require('./dailyJobs.service');

exports.getJobs = async (req, h) => {
  const data = await service.getJobs();
  return h.response({ success: true, data }).code(200);
};

exports.createJob = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createJob(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.updateJob = async (req, h) => {
  const updatedBy = req.auth.credentials.employeeName;
  const data = await service.updateJob(req.params.jobId, req.payload, updatedBy);
  return h.response({ success: true, data }).code(200);
};

exports.deleteJob = async (req, h) => {
  await service.deleteJob(req.params.jobId);
  return h.response({ success: true }).code(200);
};

exports.getPoOptions = async (req, h) => {
  const data = await service.getPoOptions(req.query.customer);
  return h.response({ success: true, data }).code(200);
};

exports.getItemOptions = async (req, h) => {
  const data = await service.getItemOptions(req.query.customer, req.query.poNo);
  return h.response({ success: true, data }).code(200);
};

exports.getMachineOptions = async (req, h) => {
  const data = await service.getMachineOptions();
  return h.response({ success: true, data }).code(200);
};
