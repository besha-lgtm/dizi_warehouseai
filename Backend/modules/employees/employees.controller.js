const service = require('./employees.service');

exports.getEmployees = async (req, h) => {
  const data = await service.getEmployees();
  return h.response({ success: true, data }).code(200);
};

exports.getEmployeeById = async (req, h) => {
  const data = await service.getEmployeeById(req.params.id);
  return h.response({ success: true, data }).code(200);
};

exports.createEmployee = async (req, h) => {
  const data = await service.createEmployee(req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(201);
};

exports.updateEmployee = async (req, h) => {
  const data = await service.updateEmployee(req.params.id, req.payload, req.auth.credentials.employeeName);
  return h.response({ success: true, data }).code(200);
};

exports.deleteEmployee = async (req, h) => {
  await service.deleteEmployee(req.params.id);
  return h.response({ success: true }).code(200);
};
