const ctrl = require('./finishedGoods.controller');
const { requirePermission } = require('../../utils/permissions');

const perm = { pre: [requirePermission('finishedGoods')] };

module.exports = [
  { method: 'GET', path: '/api/finished-goods', options: perm, handler: ctrl.getFinishedGoods },
  { method: 'PUT', path: '/api/finished-goods/{id}', options: perm, handler: ctrl.updateFinishedGood },
  { method: 'GET', path: '/api/finished-goods/{id}', options: perm, handler: ctrl.getFinishedGood }
];