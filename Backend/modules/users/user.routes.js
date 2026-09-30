const ctrl = require('./user.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/users', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.getUsers },
  { method: 'GET', path: '/api/users/{id}', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.getUserById },
  { method: 'POST', path: '/api/users', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.createUser },
  { method: 'PUT', path: '/api/users/{id}', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.updateUser },
  { method: 'DELETE', path: '/api/users/{id}', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.deleteUser }
];
