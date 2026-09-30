const service = require('./stagewiseQc.service');

exports.getQCJobs = async (req, h) => {
  const data = await service.getQCJobs();
  return h.response({ success: true, data }).code(200);
};

exports.getQCJob = async (req, h) => {
  const data = await service.getQCJob(req.params.batchNo);
  return h.response({ success: true, data }).code(200);
};

exports.saveStageDecision = async (req, h) => {
  const data = await service.saveStageDecision(
    req.params.batchNo,
    req.params.stageName,
    req.payload,
    req.auth.credentials.employeeName
  );
  return h.response({ success: true, data }).code(200);
};

exports.addPhoto = async (req, h) => {
  const data = await service.addPhoto(req.params.batchNo, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.deletePhoto = async (req, h) => {
  const data = await service.deletePhoto(req.params.batchNo, req.params.photoId);
  return h.response({ success: true, data }).code(200);
};