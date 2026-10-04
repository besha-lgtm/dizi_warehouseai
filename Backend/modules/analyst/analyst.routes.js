const ctrl = require('./analyst.controller');

module.exports = [
  {
    method: 'POST',
    path: '/api/analyst/query',
    handler: ctrl.query
  }
];
