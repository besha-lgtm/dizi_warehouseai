const service = require('./dispatch.service');

exports.getDispatches = async (req, h) => {
  const data = await service.getDispatches();
  return h.response({ success: true, data }).code(200);
};

exports.getDispatch = async (req, h) => {
  const data = await service.getDispatch(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.createDispatch = async (req, h) => {
  const data = await service.createDispatch(req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.updateDispatch = async (req, h) => {
  const data = await service.updateDispatch(req.params.id, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(200);
};

exports.deleteDispatch = async (req, h) => {
  await service.deleteDispatch(req.params.id);
  return h.response({ success: true }).code(200);
};
