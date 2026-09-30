const service = require('./plantMaster.service');

exports.getPlants = async (req, h) => {
  const data = await service.getPlants();
  return h.response({ success: true, data }).code(200);
};

exports.getActivePlantOptions = async (req, h) => {
  const data = await service.getActivePlantOptions();
  return h.response({ success: true, data }).code(200);
};

exports.createPlant = async (req, h) => {
  const createdBy = req.auth.credentials.employeeName;
  const data = await service.createPlant(req.payload, createdBy);
  return h.response({ success: true, data }).code(201);
};

exports.updatePlant = async (req, h) => {
  const updatedBy = req.auth.credentials.employeeName;
  const data = await service.updatePlant(req.params.id, req.payload, updatedBy);
  return h.response({ success: true, data }).code(200);
};

exports.deletePlant = async (req, h) => {
  await service.deletePlant(req.params.id);
  return h.response({ success: true }).code(200);
};
