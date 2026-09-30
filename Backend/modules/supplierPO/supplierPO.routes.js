const ctrl = require('./supplierPO.controller');
const { requirePermission } = require('../../utils/permissions');

// Reuses the 'supplierMaster' permission code — same mapping the frontend
// sidebar already uses for this screen (see sidebar.component.ts), there's
// no dedicated 'supplierPo' permission row seeded.
module.exports = [
  { method: 'GET', path: '/api/supplier-pos', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.getPurchaseOrders },
  { method: 'GET', path: '/api/supplier-pos/raw-material-options', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.getRawMaterialOptions },
  { method: 'GET', path: '/api/supplier-pos/{poNumber*}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.getPurchaseOrder },
  { method: 'POST', path: '/api/supplier-pos', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.createPurchaseOrder },
  { method: 'PUT', path: '/api/supplier-pos/{poNumber*}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.updatePurchaseOrder },
  { method: 'DELETE', path: '/api/supplier-pos/{poNumber*}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.deletePurchaseOrder }
];
