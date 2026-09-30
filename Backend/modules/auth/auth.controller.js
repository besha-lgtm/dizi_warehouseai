const service = require('./auth.service');

exports.login = async (req, h) => {
  const result = await service.login(req.payload);
  return h.response({ success: true, data: result }).code(200);
};

exports.me = async (req, h) => {
  const data = await service.me(req.auth.credentials.userId);
  return h.response({ success: true, data }).code(200);
};
