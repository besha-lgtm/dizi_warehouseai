const ctrl = require('./itemPmsMaster.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/item-pms-master', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.getItems },
  // Read-only, shared with Supplier PO Creation's "Reels" reference dropdown —
  // allow either permission so that screen doesn't need itemPmsMaster access too.
  { method: 'GET', path: '/api/item-pms-master/reference-options', options: { pre: [requirePermission(['itemPmsMaster', 'supplierMaster'])] }, handler: ctrl.getReferenceOptions },
  { method: 'GET', path: '/api/item-pms-master/{id}', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.getItem },
  { method: 'POST', path: '/api/item-pms-master', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.createItem },
  { method: 'PUT', path: '/api/item-pms-master/{id}', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.updateItem },
  { method: 'DELETE', path: '/api/item-pms-master/{id}', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.deleteItem },
  { method: 'PATCH', path: '/api/item-pms-master/{id}/approve', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.approveItem },
  { method: 'PATCH', path: '/api/item-pms-master/{id}/reject', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.rejectItem }
];
