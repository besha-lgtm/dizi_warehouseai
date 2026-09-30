const ctrl = require('./customers.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/customers', options: { pre: [requirePermission('customerMaster')] }, handler: ctrl.getCustomers },
  { method: 'GET', path: '/api/customers/active', options: { pre: [requirePermission(['customerMaster', 'customerPo'])] }, handler: ctrl.getActiveCustomers },
  { method: 'GET', path: '/api/customers/{id}', options: { pre: [requirePermission('customerMaster')] }, handler: ctrl.getCustomerById },
  { method: 'POST', path: '/api/customers', options: { pre: [requirePermission('customerMaster')] }, handler: ctrl.createCustomer },
  { method: 'PUT', path: '/api/customers/{id}', options: { pre: [requirePermission('customerMaster')] }, handler: ctrl.updateCustomer },
  { method: 'DELETE', path: '/api/customers/{id}', options: { pre: [requirePermission('customerMaster')] }, handler: ctrl.deleteCustomer }
];
