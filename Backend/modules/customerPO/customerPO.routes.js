const ctrl = require('./customerPO.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/customer-pos', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.getPurchaseOrders },
  // {poNo*} (wildcard) captures the FULL rest of the path, including embedded slashes —
  // Customer PO numbers are supplied by the customer and commonly contain them
  // (e.g. "PODR/6100674"). A plain {poNo} segment would silently 404 on those.
  { method: 'GET', path: '/api/customer-pos/{poNo*}', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.getPurchaseOrder },
  { method: 'POST', path: '/api/customer-pos', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.createPurchaseOrder },
  { method: 'PUT', path: '/api/customer-pos/{poNo*}', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.updatePurchaseOrder },
  { method: 'DELETE', path: '/api/customer-pos/{poNo*}', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.deletePurchaseOrder }
];
