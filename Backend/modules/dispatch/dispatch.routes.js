const ctrl = require('./dispatch.controller');
const { requirePermission } = require('../../utils/permissions');

const perm = { pre: [requirePermission('dispatch')] };

module.exports = [
  { method: 'GET', path: '/api/dispatches', options: perm, handler: ctrl.getDispatches },
  { method: 'GET', path: '/api/dispatches/{id}', options: perm, handler: ctrl.getDispatch },
  { method: 'POST', path: '/api/dispatches', options: perm, handler: ctrl.createDispatch },
  { method: 'PUT', path: '/api/dispatches/{id}', options: perm, handler: ctrl.updateDispatch },
  { method: 'DELETE', path: '/api/dispatches/{id}', options: perm, handler: ctrl.deleteDispatch }
];
