const ctrl = require('./layerSpecs.controller');
const { requirePermission } = require('../../utils/permissions');

module.exports = [
  { method: 'GET', path: '/api/layer-specs', options: { pre: [requirePermission('layerSpecs')] }, handler: ctrl.getLayerSpecs },
  { method: 'GET', path: '/api/layer-specs/{id}', options: { pre: [requirePermission('layerSpecs')] }, handler: ctrl.getLayerSpecById },
  { method: 'POST', path: '/api/layer-specs', options: { pre: [requirePermission('layerSpecs')] }, handler: ctrl.createLayerSpec },
  { method: 'PUT', path: '/api/layer-specs/{id}', options: { pre: [requirePermission('layerSpecs')] }, handler: ctrl.updateLayerSpec },
  { method: 'DELETE', path: '/api/layer-specs/{id}', options: { pre: [requirePermission('layerSpecs')] }, handler: ctrl.deleteLayerSpec }
];
