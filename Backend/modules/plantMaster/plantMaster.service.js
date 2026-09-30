const db = require('../../config/db');
const Boom = require('@hapi/boom');

// "Plant" in the UI maps to the existing `warehouses` table (code/name/location) —
// there's no separate plants table in the schema, and a plant is really just
// the physical delivery/storage location these screens need.
function rowToPlant(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location,
    status: row.status
  };
}

exports.getPlants = async () => {
  const [rows] = await db.query('SELECT * FROM warehouses ORDER BY name');
  return rows.map(rowToPlant);
};

// Feeds "Plant Location" dropdowns (Supplier PO Creation, Material Receipt,
// Dispatch...) — Active only, label combines name + location like the old
// hardcoded list did ("Plant 1 - Pune").
exports.getActivePlantOptions = async () => {
  const [rows] = await db.query(`SELECT code, name, location FROM warehouses WHERE status = 'Active' ORDER BY name`);
  return rows.map(r => ({
    label: r.location ? `${r.name} - ${r.location}` : r.name,
    value: r.location ? `${r.name} - ${r.location}` : r.name,
    code: r.code
  }));
};

exports.createPlant = async (data, createdBy) => {
  if (!data.code) throw Boom.badRequest('code is required');
  if (!data.name) throw Boom.badRequest('name is required');
  try {
    const [result] = await db.query(
      `INSERT INTO warehouses (code, name, location, status, created_by) VALUES (?, ?, ?, ?, ?)`,
      [data.code, data.name, data.location || null, data.status || 'Active', createdBy || 'system']
    );
    const [rows] = await db.query('SELECT * FROM warehouses WHERE id = ?', [result.insertId]);
    return rowToPlant(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A plant/warehouse with this code already exists');
    throw err;
  }
};

exports.updatePlant = async (id, data, updatedBy) => {
  const [rows] = await db.query('SELECT * FROM warehouses WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('Plant/warehouse not found');
  const existing = rows[0];
  await db.query(
    `UPDATE warehouses SET code=?, name=?, location=?, status=?, last_updated_by=? WHERE id=?`,
    [data.code || existing.code, data.name || existing.name, data.location ?? existing.location,
      data.status || existing.status, updatedBy || 'system', id]
  );
  const [updated] = await db.query('SELECT * FROM warehouses WHERE id = ?', [id]);
  return rowToPlant(updated[0]);
};

exports.deletePlant = async (id) => {
  const [rows] = await db.query('SELECT id FROM warehouses WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('Plant/warehouse not found');
  await db.query(`UPDATE warehouses SET status = 'Inactive' WHERE id = ?`, [id]);
};
