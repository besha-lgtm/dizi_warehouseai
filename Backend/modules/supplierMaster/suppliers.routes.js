const ctrl = require('./suppliers.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/suppliers', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.getSuppliers },
  { method: 'GET', path: '/api/suppliers/active', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.getActiveSuppliers },
  { method: 'GET', path: '/api/suppliers/{id}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.getSupplierById },
  { method: 'POST', path: '/api/suppliers', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.createSupplier },
  { method: 'PUT', path: '/api/suppliers/{id}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.updateSupplier },
  { method: 'DELETE', path: '/api/suppliers/{id}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.deleteSupplier }
];
