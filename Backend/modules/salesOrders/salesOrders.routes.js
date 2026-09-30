const ctrl = require('./salesOrders.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/sales-orders', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.getSalesOrders },
  // {soNo*} — Sales Order numbers use a slash-separated format (e.g. "VISI/26-27/511"),
  // so this must be a wildcard, same reasoning as customer-pos/{poNo*}.
  { method: 'GET', path: '/api/sales-orders/{soNo*}', options: { pre: [requirePermission('customerPo')] }, handler: ctrl.getSalesOrder }
];
