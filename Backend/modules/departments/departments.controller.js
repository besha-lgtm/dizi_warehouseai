const service = require('./departments.service');

exports.getDepartments = async (req, h) => {
  const data = await service.getDepartments();
  return h.response({ success: true, data }).code(200);
};

exports.getDesignations = async (req, h) => {
  const data = await service.getDesignations(req.query.department);
  return h.response({ success: true, data }).code(200);
};
