const db = require('../../config/db');
const Boom = require('@hapi/boom');

exports.getRoles = async () => {
  const [rows] = await db.query(`
    SELECT r.id AS roleId, r.role_code AS roleCode, r.role_name AS name, r.description, r.status,
      COUNT(ur.user_id) AS userCount
    FROM roles r
    LEFT JOIN user_roles ur ON ur.role_id = r.id
    GROUP BY r.id, r.role_code, r.role_name, r.description, r.status
    ORDER BY r.role_name
  `);
  return rows;
};

function slugCode(name) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40);
}

exports.createRole = async (payload) => {
  if (!payload.name) throw Boom.badRequest('name is required');

  const [existing] = await db.query('SELECT id FROM roles WHERE role_name = ?', [payload.name]);
  if (existing.length) throw Boom.conflict('A role with this name already exists');

  const roleCode = payload.roleCode || slugCode(payload.name);
  const [result] = await db.query(
    'INSERT INTO roles (role_code, role_name, description, status) VALUES (?, ?, ?, ?)',
    [roleCode, payload.name, payload.description || null, payload.status || 'Active']
  );

  return { roleId: result.insertId, name: payload.name };
};

exports.updateRole = async (roleId, payload) => {
  const [existing] = await db.query('SELECT id FROM roles WHERE id = ?', [roleId]);
  if (!existing.length) throw Boom.notFound('Role not found');
  if (!payload.name) throw Boom.badRequest('name is required');

  const [nameClash] = await db.query('SELECT id FROM roles WHERE role_name = ? AND id != ?', [payload.name, roleId]);
  if (nameClash.length) throw Boom.conflict('A role with this name already exists');

  await db.query(
    'UPDATE roles SET role_name = ?, description = ?, status = ? WHERE id = ?',
    [payload.name, payload.description || null, payload.status || 'Active', roleId]
  );
};

exports.deleteRole = async (roleId) => {
  const [inUse] = await db.query('SELECT COUNT(*) as c FROM user_roles WHERE role_id = ?', [roleId]);
  if (inUse[0].c > 0) throw Boom.conflict('Cannot delete a role that is still assigned to users');

  const [result] = await db.query('DELETE FROM roles WHERE id = ?', [roleId]);
  if (result.affectedRows === 0) throw Boom.notFound('Role not found');
};

/** Returns every permission grouped by module_name, with isGranted flags for this role. */
exports.getRolePermissions = async (roleId) => {
  const [rows] = await db.query(`
    SELECT p.id, p.permission_code, p.permission_name, p.module_name,
      CASE WHEN rp.permission_id IS NOT NULL THEN 1 ELSE 0 END AS isGranted
    FROM permissions p
    LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = ?
    WHERE p.status = 'Active'
    ORDER BY p.module_name, p.permission_name
  `, [roleId]);

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.module_name]) {
      grouped[row.module_name] = { moduleName: row.module_name, permissions: [] };
    }
    grouped[row.module_name].permissions.push({
      permissionId: row.id,
      code: row.permission_code,
      name: row.permission_name,
      isGranted: !!row.isGranted
    });
  }
  return Object.values(grouped);
};

/** permissionIds: array of permission id values to grant — replaces the role's current set. */
exports.saveRolePermissions = async (roleId, permissionIds) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    if (permissionIds && permissionIds.length) {
      const values = permissionIds.map(pid => [roleId, pid]);
      await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
