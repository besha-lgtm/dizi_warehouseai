const ctrl = require('./materialReceipt.controller');
const { requirePermission } = require('../../utils/permissions');

// This module backs two screens with different sidebar permKeys — Raw Material
// Stock ('stockVerification') and QC Incoming Approval ('qcManagement') — so
// routes accept either.
const viewOrDecide = requirePermission(['stockVerification', 'qcManagement']);

module.exports = [
  { method: 'GET', path: '/api/material-receipts', options: { pre: [viewOrDecide] }, handler: ctrl.getDeliveries },
  { method: 'GET', path: '/api/material-receipts/stock-summary', options: { pre: [viewOrDecide] }, handler: ctrl.getStockSummary },
  { method: 'GET', path: '/api/material-receipts/{grnNo}', options: { pre: [viewOrDecide] }, handler: ctrl.getDelivery },
  { method: 'POST', path: '/api/material-receipts', options: { pre: [viewOrDecide] }, handler: ctrl.createReceipt },
  { method: 'PUT', path: '/api/material-receipts/{grnNo}/decision', options: { pre: [viewOrDecide] }, handler: ctrl.decideDelivery }
];
