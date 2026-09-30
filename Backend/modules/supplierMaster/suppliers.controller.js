const service = require('./suppliers.service');

exports.getSuppliers = async (req, h) => {
  const data = await service.getSuppliers();
  return h.response({ success: true, data }).code(200);
};

exports.getSupplierById = async (req, h) => {
  const data = await service.getSupplierById(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.getActiveSuppliers = async (req, h) => {
  const data = await service.getActiveSuppliers();
  return h.response({ success: true, data }).code(200);
};

exports.createSupplier = async (req, h) => {
  const data = await service.createSupplier(req.payload);
  return h.response({ success: true, data }).code(201);
};

exports.updateSupplier = async (req, h) => {
  const data = await service.updateSupplier(req.params.id, req.payload);
  return h.response({ success: true, data }).code(200);
};

exports.deleteSupplier = async (req, h) => {
  await service.deleteSupplier(req.params.id);
  return h.response({ success: true }).code(200);
};
