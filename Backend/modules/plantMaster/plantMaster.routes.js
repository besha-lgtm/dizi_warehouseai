const ctrl = require('./plantMaster.controller');
const { requirePermission } = require('../../utils/permissions');

const READ_PERMS = ['supplierMaster', 'materialReceipt', 'dispatch', 'productionPlanning'];

module.exports = [
  { method: 'GET', path: '/api/plants', options: { pre: [requirePermission(READ_PERMS)] }, handler: ctrl.getPlants },
  { method: 'GET', path: '/api/plants/active-options', options: { pre: [requirePermission(READ_PERMS)] }, handler: ctrl.getActivePlantOptions },
  { method: 'POST', path: '/api/plants', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.createPlant },
  { method: 'PUT', path: '/api/plants/{id}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.updatePlant },
  { method: 'DELETE', path: '/api/plants/{id}', options: { pre: [requirePermission('supplierMaster')] }, handler: ctrl.deletePlant }
];
