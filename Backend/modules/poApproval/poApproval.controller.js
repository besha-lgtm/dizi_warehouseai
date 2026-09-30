const service = require('./poApproval.service');

exports.getApprovalsQueue = async (req, h) => {
  const [queue, stats] = await Promise.all([service.getApprovalsQueue(), service.getTodayStats()]);
  return h.response({ success: true, data: { queue, ...stats } }).code(200);
};

exports.approveRequest = async (req, h) => {
  const actionBy = req.auth.credentials.employeeName;
  const data = await service.approveRequest(req.params.poNo, req.payload?.remarks, actionBy);
  return h.response({ success: true, data }).code(200);
};

exports.rejectRequest = async (req, h) => {
  const actionBy = req.auth.credentials.employeeName;
  const data = await service.rejectRequest(req.params.poNo, req.payload?.remarks, actionBy);
  return h.response({ success: true, data }).code(200);
};
