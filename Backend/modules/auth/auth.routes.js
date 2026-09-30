const ctrl = require('./auth.controller');

module.exports = [
  {
    method: 'POST',
    path: '/api/auth/login',
    handler: ctrl.login,
    options: { auth: false }
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    handler: ctrl.me
  }
];
