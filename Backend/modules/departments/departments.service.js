const db = require('../../config/db');

exports.getDepartments = async () => {
  const [rows] = await db.query(
    `SELECT id, department_code, department_name FROM departments WHERE status = 'Active' ORDER BY department_name`
  );
  return rows.map(r => ({ id: r.id, code: r.department_code, name: r.department_name }));
};

/** departmentName is optional — if given, only returns designations under that department. */
exports.getDesignations = async (departmentName) => {
  let query = `
    SELECT ds.id, ds.designation_name, ds.department_id
    FROM designations ds
    JOIN departments d ON d.id = ds.department_id
    WHERE ds.status = 'Active'
  `;
  const params = [];
  if (departmentName) {
    query += ` AND d.department_name = ?`;
    params.push(departmentName);
  }
  query += ` ORDER BY ds.designation_name`;

  const [rows] = await db.query(query, params);
  return rows.map(r => ({ id: r.id, name: r.designation_name, departmentId: r.department_id }));
};
