const service = require('./customers.service');

exports.getCustomers = async (req, h) => {
  const data = await service.getCustomers();
  return h.response({ success: true, data }).code(200);
};

exports.getCustomerById = async (req, h) => {
  const data = await service.getCustomerById(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.getActiveCustomers = async (req, h) => {
  const data = await service.getActiveCustomers();
  return h.response({ success: true, data }).code(200);
};

exports.createCustomer = async (req, h) => {
  const data = await service.createCustomer(req.payload);
  return h.response({ success: true, data }).code(201);
};

exports.updateCustomer = async (req, h) => {
  const data = await service.updateCustomer(req.params.id, req.payload);
  return h.response({ success: true, data }).code(200);
};

exports.deleteCustomer = async (req, h) => {
  await service.deleteCustomer(req.params.id);
  return h.response({ success: true }).code(200);
};
