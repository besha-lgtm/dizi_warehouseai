const db = require('../../config/db');

exports.getPermissions = async () => {
  const [rows] = await db.query(`
    SELECT id, permission_code, permission_name, module_name, action_name, status
    FROM permissions
    ORDER BY module_name, permission_name
  `);
  return rows;
};