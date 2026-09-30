const ctrl = require('./assistant.controller');

module.exports = [
  {
    method: 'POST',
    path: '/api/assistant/chat',
    handler: ctrl.chat
  }
];
