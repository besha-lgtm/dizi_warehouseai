const service = require('./layerSpecs.service');

exports.getLayerSpecs = async (req, h) => {
  const data = await service.getLayerSpecs();
  return h.response({ success: true, data }).code(200);
};

exports.getLayerSpecById = async (req, h) => {
  const data = await service.getLayerSpecById(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.createLayerSpec = async (req, h) => {
  const data = await service.createLayerSpec(req.payload);
  return h.response({ success: true, data }).code(201);
};

exports.updateLayerSpec = async (req, h) => {
  const data = await service.updateLayerSpec(req.params.id, req.payload);
  return h.response({ success: true, data }).code(200);
};

exports.deleteLayerSpec = async (req, h) => {
  await service.deleteLayerSpec(req.params.id);
  return h.response({ success: true }).code(200);
};
