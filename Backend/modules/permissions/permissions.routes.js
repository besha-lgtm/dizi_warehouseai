const ctrl = require('./permissions.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/permissions', options: { pre: [requirePermission('usersAndRoles')] }, handler: ctrl.getPermissions }
];
