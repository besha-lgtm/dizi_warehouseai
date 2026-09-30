const ctrl = require('./employees.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/employees', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.getEmployees },
  { method: 'GET', path: '/api/employees/{id}', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.getEmployeeById },
  { method: 'POST', path: '/api/employees', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.createEmployee },
  { method: 'PUT', path: '/api/employees/{id}', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.updateEmployee },
  { method: 'DELETE', path: '/api/employees/{id}', options: { pre: [requirePermission('employeeMaster')] }, handler: ctrl.deleteEmployee }
];
