const ctrl = require('./stagewiseQc.controller');
const { requirePermission } = require('../../utils/permissions');

const perm = { pre: [requirePermission('stagewiseQc')] };

module.exports = [
  { method: 'GET', path: '/api/stagewise-qc', options: perm, handler: ctrl.getQCJobs },

  // Sub-resource routes registered ahead of the {batchNo*} wildcard below,
  // same slash-safety convention as productionExecution's routes.
  { method: 'PUT', path: '/api/stagewise-qc/{batchNo}/stages/{stageName}', options: perm, handler: ctrl.saveStageDecision },
  { method: 'POST', path: '/api/stagewise-qc/{batchNo}/photos', options: perm, handler: ctrl.addPhoto },
  { method: 'DELETE', path: '/api/stagewise-qc/{batchNo}/photos/{photoId}', options: perm, handler: ctrl.deletePhoto },

  { method: 'GET', path: '/api/stagewise-qc/{batchNo*}', options: perm, handler: ctrl.getQCJob }
];