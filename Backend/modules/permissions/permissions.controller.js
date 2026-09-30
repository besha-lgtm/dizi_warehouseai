const service = require('./permissions.service');

exports.getPermissions = async (req, h) => {
  const data = await service.getPermissions();
  return h.response({ success: true, data }).code(200);
};
