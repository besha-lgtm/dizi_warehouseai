const db = require('../../config/db');

// Flattens the joined row back into the same JSON shape the Angular UI already expects,
// so no frontend changes are needed despite the underlying normalization.
function toPublicUser(row, roles = [], permissions = []) {
  return {
    userId: row.user_id,
    employeeCode: row.emp_code,
    employeeName: row.emp_name,
    email: row.email,
    mobileNo: row.mobile_no,
    department: row.department_name,
    designation: row.designation_name,
    reportingManager: row.manager_name,
    roleId: roles[0]?.id ?? null,
    role: roles.map(r => r.roleName).join(', '),
    status: row.status,
    avatarColor: row.avatar_color,
    security: {
      mfaEnabled: !!row.mfa_enabled,
      authMethod: row.auth_method
    },
    permissions
  };
}

const BASE_SELECT = `
  SELECT
    u.id AS user_pk, u.user_id, u.employee_id, u.email, u.mobile_no, u.password_hash,
    u.mfa_enabled, u.auth_method, u.status, u.avatar_color, u.last_login_at,
    e.emp_code, e.emp_name,
    d.department_name, ds.designation_name,
    mgr.emp_name AS manager_name
  FROM users u
  JOIN employees e ON e.id = u.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations ds ON ds.id = e.designation_id
  LEFT JOIN employees mgr ON mgr.id = e.reporting_manager_id
`;

async function getAll() {
  const [rows] = await db.query(`${BASE_SELECT} ORDER BY u.user_id`);
  return rows;
}

async function findByUserId(userId) {
  const [rows] = await db.query(`${BASE_SELECT} WHERE u.user_id = ?`, [userId]);
  return rows[0];
}

async function findByEmail(email) {
  const [rows] = await db.query(`${BASE_SELECT} WHERE u.email = ?`, [email]);
  return rows[0];
}

async function getRolesForUser(userPk) {
  const [rows] = await db.query(
    `SELECT r.id, r.role_name AS roleName
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?
     ORDER BY r.role_name`,
    [userPk]
  );
  return rows;
}

/** Resolves final granted permission codes: role-granted, then user_permissions overrides applied on top. */
async function getPermissionCodesForUser(userPk) {
  const [roleGranted] = await db.query(
    `SELECT DISTINCT p.permission_code
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ? AND p.status = 'Active'`,
    [userPk]
  );

  const [overrides] = await db.query(
    `SELECT p.permission_code, up.allowed
     FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = ?`,
    [userPk]
  );

  const granted = new Set(roleGranted.map(r => r.permission_code));
  for (const o of overrides) {
    if (o.allowed) granted.add(o.permission_code);
    else granted.delete(o.permission_code);
  }
  return [...granted];
}

async function nextUserId() {
  const [rows] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(user_id, 2) AS UNSIGNED)) AS maxId FROM users`
  );
  const next = (rows[0].maxId || 0) + 1;
  return 'U' + String(next).padStart(3, '0');
}

const AVATAR_COLORS = ['#2e90fa', '#7a5af8', '#12b76a', '#f79009', '#f04438', '#0794ad', '#ee46bc', '#16b364'];
function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

async function create(data) {
  const [result] = await db.query(
    `INSERT INTO users (user_id, employee_id, email, mobile_no, password_hash, mfa_enabled, auth_method,
      status, avatar_color, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.userId, data.employeeId, data.email, data.mobileNo, data.passwordHash, data.mfaEnabled ? 1 : 0,
      data.authMethod || 'Password Only', data.status || 'Active', data.avatarColor, data.createdBy || 'system']
  );
  const userPk = result.insertId;
  await db.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userPk, data.roleId]);
  return userPk;
}

async function update(userPk, data) {
  await db.query(
    `UPDATE users SET employee_id=?, email=?, mobile_no=?, mfa_enabled=?, auth_method=?, status=?,
      last_updated_by=?
     WHERE id = ?`,
    [data.employeeId, data.email, data.mobileNo, data.mfaEnabled ? 1 : 0, data.authMethod || 'Password Only',
      data.status, data.updatedBy || 'system', userPk]
  );

  await db.query('DELETE FROM user_roles WHERE user_id = ?', [userPk]);
  await db.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userPk, data.roleId]);
}

async function updatePassword(userPk, passwordHash) {
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userPk]);
}

async function remove(userPk) {
  const [result] = await db.query('DELETE FROM users WHERE id = ?', [userPk]);
  return result.affectedRows > 0;
}

async function findEmployeeIdByCode(empCode) {
  const [rows] = await db.query('SELECT id FROM employees WHERE emp_code = ?', [empCode]);
  return rows[0]?.id ?? null;
}

module.exports = {
  toPublicUser, getAll, findByUserId, findByEmail, getRolesForUser, getPermissionCodesForUser,
  nextUserId, randomAvatarColor, create, update, updatePassword, remove, findEmployeeIdByCode
};