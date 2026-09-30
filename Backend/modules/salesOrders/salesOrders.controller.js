const service = require('./salesOrders.service');

exports.getSalesOrders = async (req, h) => {
  const data = await service.getSalesOrders();
  return h.response({ success: true, data }).code(200);
};

exports.getSalesOrder = async (req, h) => {
  const data = await service.getSalesOrder(req.params.soNo);
  return h.response({ success: true, data }).code(200);
};
