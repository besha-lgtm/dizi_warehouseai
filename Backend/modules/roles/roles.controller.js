const service = require('./roles.service');

exports.getRoles = async (req, h) => {
  const data = await service.getRoles();
  return h.response({ success: true, data }).code(200);
};

exports.createRole = async (req, h) => {
  const data = await service.createRole(req.payload);
  return h.response({ success: true, data }).code(201);
};

exports.updateRole = async (req, h) => {
  await service.updateRole(req.params.id, req.payload);
  return h.response({ success: true }).code(200);
};

exports.deleteRole = async (req, h) => {
  await service.deleteRole(req.params.id);
  return h.response({ success: true }).code(200);
};

exports.getRolePermissions = async (req, h) => {
  const data = await service.getRolePermissions(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.saveRolePermissions = async (req, h) => {
  await service.saveRolePermissions(req.params.id, req.payload.permissionIds);
  return h.response({ success: true }).code(200);
};
