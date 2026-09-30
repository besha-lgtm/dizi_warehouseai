const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToUom(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    status: row.status
  };
}

exports.getUoms = async () => {
  const [rows] = await db.query('SELECT * FROM uoms ORDER BY category, name');
  return rows.map(rowToUom);
};

// Feeds UOM dropdowns across the app (Supplier PO Creation, QC Incoming
// Inspection, etc.) — Active only, formatted as { label, value }.
exports.getActiveUomOptions = async () => {
  const [rows] = await db.query(`SELECT code, name FROM uoms WHERE status = 'Active' ORDER BY name`);
  return rows.map(r => ({ label: r.code, value: r.code, name: r.name }));
};

exports.createUom = async (data, createdBy) => {
  if (!data.code) throw Boom.badRequest('code is required');
  if (!data.name) throw Boom.badRequest('name is required');
  try {
    const [result] = await db.query(
      `INSERT INTO uoms (code, name, category, status, created_by) VALUES (?, ?, ?, ?, ?)`,
      [data.code, data.name, data.category || 'General', data.status || 'Active', createdBy || 'system']
    );
    const [rows] = await db.query('SELECT * FROM uoms WHERE id = ?', [result.insertId]);
    return rowToUom(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A UOM with this code already exists');
    throw err;
  }
};

exports.updateUom = async (id, data, updatedBy) => {
  const [rows] = await db.query('SELECT * FROM uoms WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('UOM not found');
  const existing = rows[0];
  await db.query(
    `UPDATE uoms SET code=?, name=?, category=?, status=?, last_updated_by=? WHERE id=?`,
    [data.code || existing.code, data.name || existing.name, data.category ?? existing.category,
      data.status || existing.status, updatedBy || 'system', id]
  );
  const [updated] = await db.query('SELECT * FROM uoms WHERE id = ?', [id]);
  return rowToUom(updated[0]);
};

exports.deleteUom = async (id) => {
  const [rows] = await db.query('SELECT id FROM uoms WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('UOM not found');
  await db.query(`UPDATE uoms SET status = 'Inactive' WHERE id = ?`, [id]);
};
