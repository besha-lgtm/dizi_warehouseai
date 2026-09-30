const ctrl = require('./poApproval.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/po-approvals', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.getApprovalsQueue },
  // poNo (the customer's own PO number) commonly contains slashes, and a wildcard
  // segment must be the LAST part of a path — so "approve"/"reject" now come first,
  // with {poNo*} at the end capturing the rest, slashes included.
  { method: 'POST', path: '/api/po-approvals/approve/{poNo*}', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.approveRequest },
  { method: 'POST', path: '/api/po-approvals/reject/{poNo*}', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.rejectRequest }
];
