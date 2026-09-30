const ctrl = require('./roles.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/roles', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.getRoles },
  { method: 'POST', path: '/api/roles', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.createRole },
  { method: 'PUT', path: '/api/roles/{id}', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.updateRole },
  { method: 'DELETE', path: '/api/roles/{id}', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.deleteRole },
  { method: 'GET', path: '/api/roles/{id}/permissions', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.getRolePermissions },
  { method: 'PUT', path: '/api/roles/{id}/permissions', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.saveRolePermissions }
];
