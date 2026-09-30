const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Boom = require('@hapi/boom');
const config = require('../../config/server');
const repo = require('../users/user.repository');

exports.login = async ({ email, password }) => {
  const row = await repo.findByEmail(email);
  if (!row) throw Boom.unauthorized('Invalid email or password');

  if (row.status !== 'Active') {
    throw Boom.forbidden('This account has been deactivated. Contact your administrator.');
  }

  const match = await bcrypt.compare(password, row.password_hash || '');
  if (!match) throw Boom.unauthorized('Invalid email or password');

  const roles = await repo.getRolesForUser(row.user_pk);
  const permissions = await repo.getPermissionCodesForUser(row.user_pk);
  const user = repo.toPublicUser(row, roles, permissions);

  const token = jwt.sign(
    {
      userId: user.userId,
      employeeName: user.employeeName,
      email: user.email,
      roles: roles.map(r => r.roleName),
      permissions
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return { token, user };
};

exports.me = async (userId) => {
  const row = await repo.findByUserId(userId);
  if (!row) throw Boom.notFound('User not found');
  const roles = await repo.getRolesForUser(row.user_pk);
  const permissions = await repo.getPermissionCodesForUser(row.user_pk);
  return repo.toPublicUser(row, roles, permissions);
};
