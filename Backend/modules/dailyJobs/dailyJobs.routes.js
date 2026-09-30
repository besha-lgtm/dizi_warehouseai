const ctrl = require('./dailyJobs.controller');
const { requirePermission } = require('../../utils/permissions');

// Note: /po-options and /item-options must be registered before the
// /{jobId} wildcard route family isn't an issue here since there is no
// GET /{jobId} route (the frontend only ever fetches the full list), but
// keep static paths above any future wildcard additions to avoid shadowing.
module.exports = [
  { method: 'GET', path: '/api/daily-jobs', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.getJobs },
  { method: 'GET', path: '/api/daily-jobs/po-options', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.getPoOptions },
  { method: 'GET', path: '/api/daily-jobs/item-options', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.getItemOptions },
  { method: 'GET', path: '/api/daily-jobs/machine-options', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.getMachineOptions },
  { method: 'POST', path: '/api/daily-jobs', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.createJob },
  { method: 'PUT', path: '/api/daily-jobs/{jobId*}', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.updateJob },
  { method: 'DELETE', path: '/api/daily-jobs/{jobId*}', options: { pre: [requirePermission('dailyJobs')] }, handler: ctrl.deleteJob }
];
