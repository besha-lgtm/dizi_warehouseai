const ctrl = require('./productionPlanning.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/production-planning', options: { pre: [requirePermission('productionPlanning')] }, handler: ctrl.getPlanningBatches },
  // Static path — must be registered ahead of the {batchNo*} wildcard below so it
  // isn't swallowed by it (Hapi prioritizes static segments, but keep the order
  // explicit for readability/consistency with the existing convention here).
  { method: 'GET', path: '/api/production-planning/available-jobs', options: { pre: [requirePermission('productionPlanning')] }, handler: ctrl.getAvailableJobs },
  // {batchNo*} wildcard — same slash-safety reasoning as customer-pos/{poNo*}: batch numbers
  // are unlikely to contain slashes today, but this avoids repeating that bug if they ever do.
  { method: 'GET', path: '/api/production-planning/{batchNo*}', options: { pre: [requirePermission('productionPlanning')] }, handler: ctrl.getPlanningBatch },
  { method: 'POST', path: '/api/production-planning', options: { pre: [requirePermission('productionPlanning')] }, handler: ctrl.createPlanningBatch },
  { method: 'PUT', path: '/api/production-planning/{batchNo*}', options: { pre: [requirePermission('productionPlanning')] }, handler: ctrl.updatePlanningBatch },
  { method: 'GET', path: '/api/production-planning-history/{batchNo*}', options: { pre: [requirePermission('productionPlanning')] }, handler: ctrl.getPlanningHistory }
];