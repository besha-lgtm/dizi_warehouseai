const ctrl = require('./uomMaster.controller');
const { requirePermission } = require('../../utils/permissions');

// UOM is referenced from several screens (Supplier PO Creation, QC Incoming
// Inspection, Item PMS Master...) — allow any of their permissions through
// rather than seeding a dedicated 'uomMaster' permission row.
const READ_PERMS = ['itemPmsMaster', 'supplierMaster', 'qcManagement', 'productionPlanning'];

module.exports = [
  { method: 'GET', path: '/api/uoms', options: { pre: [requirePermission(READ_PERMS)] }, handler: ctrl.getUoms },
  { method: 'GET', path: '/api/uoms/active-options', options: { pre: [requirePermission(READ_PERMS)] }, handler: ctrl.getActiveUomOptions },
  { method: 'POST', path: '/api/uoms', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.createUom },
  { method: 'PUT', path: '/api/uoms/{id}', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.updateUom },
  { method: 'DELETE', path: '/api/uoms/{id}', options: { pre: [requirePermission('itemPmsMaster')] }, handler: ctrl.deleteUom }
];
