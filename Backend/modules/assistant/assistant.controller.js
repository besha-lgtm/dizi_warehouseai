const service = require('./assistant.service');

exports.chat = async (req, h) => {
  const { message, history } = req.payload || {};
  const result = await service.handleMessage({ message, history });
  return h.response({ success: true, data: result }).code(200);
};
