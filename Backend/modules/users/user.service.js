const bcrypt = require('bcrypt');
const Boom = require('@hapi/boom');
const db = require('../../config/db');
const repo = require('./user.repository');

async function toFullPublicUser(row) {
  const roles = await repo.getRolesForUser(row.user_pk);
  const permissions = await repo.getPermissionCodesForUser(row.user_pk);
  return repo.toPublicUser(row, roles, permissions);
}

exports.getUsers = async () => {
  const rows = await repo.getAll();
  return Promise.all(rows.map(toFullPublicUser));
};

exports.getUserById = async (userId) => {
  const row = await repo.findByUserId(userId);
  if (!row) throw Boom.notFound('User not found');
  return toFullPublicUser(row);
};

exports.createUser = async (payload) => {
  if (!payload.employeeName) throw Boom.badRequest('employeeName is required');
  if (!payload.email) throw Boom.badRequest('email is required');
  if (!payload.roleId) throw Boom.badRequest('roleId is required');
  if (!payload.employeeCode) throw Boom.badRequest('employeeCode is required — pick an employee');

  const existingEmail = await repo.findByEmail(payload.email);
  if (existingEmail) throw Boom.conflict('A user with this email already exists');

  const employeeId = await repo.findEmployeeIdByCode(payload.employeeCode);
  if (!employeeId) throw Boom.badRequest('No employee found with that employee code');

  const [existingUserForEmployee] = await db.query('SELECT id FROM users WHERE employee_id = ?', [employeeId]);
  if (existingUserForEmployee.length) throw Boom.conflict('This employee already has a user account');

  const [roleExists] = await db.query('SELECT id FROM roles WHERE id = ?', [payload.roleId]);
  if (!roleExists.length) throw Boom.badRequest('Invalid roleId');

  const userId = await repo.nextUserId();
  const plainPassword = payload.password || 'Welcome@123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await repo.create({
    userId,
    employeeId,
    email: payload.email,
    mobileNo: payload.mobileNo,
    passwordHash,
    mfaEnabled: payload.security?.mfaEnabled,
    authMethod: payload.security?.authMethod,
    status: payload.status,
    avatarColor: repo.randomAvatarColor(),
    roleId: payload.roleId
  });

  const created = await exports.getUserById(userId);
  return { ...created, temporaryPassword: payload.password ? undefined : plainPassword };
};

exports.updateUser = async (userId, payload) => {
  const existing = await repo.findByUserId(userId);
  if (!existing) throw Boom.notFound('User not found');
  if (!payload.employeeName) throw Boom.badRequest('employeeName is required');
  if (!payload.email) throw Boom.badRequest('email is required');
  if (!payload.roleId) throw Boom.badRequest('roleId is required');

  let employeeId = existing.employee_id;
  if (payload.employeeCode) {
    const resolved = await repo.findEmployeeIdByCode(payload.employeeCode);
    if (!resolved) throw Boom.badRequest('No employee found with that employee code');
    if (resolved !== existing.employee_id) {
      const [conflict] = await db.query('SELECT id FROM users WHERE employee_id = ? AND id != ?', [resolved, existing.user_pk]);
      if (conflict.length) throw Boom.conflict('This employee already has a user account');
    }
    employeeId = resolved;
  }

  await repo.update(existing.user_pk, {
    employeeId,
    email: payload.email,
    mobileNo: payload.mobileNo,
    mfaEnabled: payload.security?.mfaEnabled,
    authMethod: payload.security?.authMethod,
    status: payload.status,
    roleId: payload.roleId
  });

  if (payload.password) {
    const passwordHash = await bcrypt.hash(payload.password, 10);
    await repo.updatePassword(existing.user_pk, passwordHash);
  }

  return exports.getUserById(userId);
};

exports.deleteUser = async (userId) => {
  const existing = await repo.findByUserId(userId);
  if (!existing) throw Boom.notFound('User not found');
  await repo.remove(existing.user_pk);
};
