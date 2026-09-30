const ctrl = require('./qcIncoming.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/qc-incoming-inspections', options: { pre: [requirePermission('qcManagement')] }, handler: ctrl.getInspections },
  { method: 'GET', path: '/api/qc-incoming-inspections/{inspectionNo}', options: { pre: [requirePermission('qcManagement')] }, handler: ctrl.getInspection },
  { method: 'POST', path: '/api/qc-incoming-inspections', options: { pre: [requirePermission('qcManagement')] }, handler: ctrl.createInspection },
  { method: 'PUT', path: '/api/qc-incoming-inspections/{inspectionNo}', options: { pre: [requirePermission('qcManagement')] }, handler: ctrl.updateInspection },
  { method: 'DELETE', path: '/api/qc-incoming-inspections/{inspectionNo}', options: { pre: [requirePermission('qcManagement')] }, handler: ctrl.deleteInspection }
];
