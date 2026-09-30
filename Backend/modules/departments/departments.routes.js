const ctrl = require('./departments.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/departments', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.getDepartments },
  { method: 'GET', path: '/api/designations', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.getDesignations }
];
