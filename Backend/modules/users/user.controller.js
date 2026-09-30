const service = require('./user.service');

exports.getUsers = async (req, h) => {
  const data = await service.getUsers();
  return h.response({ success: true, data }).code(200);
};

exports.getUserById = async (req, h) => {
  const data = await service.getUserById(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.createUser = async (req, h) => {
  const data = await service.createUser(req.payload);
  return h.response({ success: true, data }).code(201);
};

exports.updateUser = async (req, h) => {
  const data = await service.updateUser(req.params.id, req.payload);
  return h.response({ success: true, data }).code(200);
};

exports.deleteUser = async (req, h) => {
  await service.deleteUser(req.params.id);
  return h.response({ success: true }).code(200);
};
