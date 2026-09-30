const ctrl = require('./productionExecution.controller');
const { requirePermission } = require('../../utils/permissions');

const perm = { pre: [requirePermission('productionExecution')] };

module.exports = [
  { method: 'GET', path: '/api/production-execution', options: perm, handler: ctrl.getExecutionBatches },
  // Static path — registered ahead of the {batchNo*} wildcard below so it isn't swallowed by it.
  { method: 'GET', path: '/api/production-execution/available-plans', options: perm, handler: ctrl.getAvailablePlans },

  // Sub-resource routes use a plain (non-greedy) {batchNo} because more path segments follow it —
  // a {batchNo*} wildcard must be the last segment in a Hapi route, so it can't be used here.
  { method: 'POST', path: '/api/production-execution/{batchNo}/downtime', options: perm, handler: ctrl.addDowntimeLog },
  { method: 'DELETE', path: '/api/production-execution/{batchNo}/downtime/{logId}', options: perm, handler: ctrl.deleteDowntimeLog },
  { method: 'POST', path: '/api/production-execution/{batchNo}/material-consumption', options: perm, handler: ctrl.addMaterialConsumption },
  { method: 'DELETE', path: '/api/production-execution/{batchNo}/material-consumption/{logId}', options: perm, handler: ctrl.deleteMaterialConsumption },

  // {batchNo*} wildcard — same slash-safety convention as productionPlanning's routes.
  { method: 'GET', path: '/api/production-execution/{batchNo*}', options: perm, handler: ctrl.getExecutionBatch },
  { method: 'POST', path: '/api/production-execution', options: perm, handler: ctrl.createExecutionBatch },
  { method: 'PUT', path: '/api/production-execution/{batchNo*}', options: perm, handler: ctrl.updateExecutionBatch }
];