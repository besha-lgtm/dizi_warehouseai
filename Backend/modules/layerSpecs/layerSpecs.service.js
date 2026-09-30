const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToLayerSpec(row) {
  return {
    layerId: row.layer_id,
    itemCode: row.item_code,
    layerNo: row.layer_no,
    material: row.material,
    size: row.size,
    gsm: row.gsm,
    bf: row.bf,
    flute: row.flute,
    shade: row.shade,
    remarks: row.remarks,
    status: row.status
  };
}

async function nextLayerId() {
  const [rows] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(layer_id, 3) AS UNSIGNED)) AS maxId FROM layer_specifications`
  );
  const next = (rows[0].maxId || 0) + 1;
  return 'LS' + String(next).padStart(3, '0');
}

// The Angular form only captures an item code (free text) — no real item picker yet.
// Resolve-or-create a matching `items` row so the real FK-based schema works without
// a frontend rework right now.
async function resolveItemId(conn, itemCode) {
  if (!itemCode) return null;
  const [rows] = await conn.query('SELECT id FROM items WHERE item_code = ?', [itemCode]);
  if (rows.length) return rows[0].id;
  const [result] = await conn.query(
    'INSERT INTO items (item_code, item_name, status) VALUES (?, ?, ?)',
    [itemCode, itemCode, 'Active']
  );
  return result.insertId;
}

async function getRowByBusinessId(layerId) {
  const [rows] = await db.query('SELECT * FROM layer_specifications WHERE layer_id = ? LIMIT 1', [layerId]);
  return rows[0];
}

exports.getLayerSpecs = async () => {
  const [rows] = await db.query('SELECT * FROM layer_specifications ORDER BY item_code, layer_no');
  return rows.map(rowToLayerSpec);
};

exports.getLayerSpecById = async (layerId) => {
  const row = await getRowByBusinessId(layerId);
  if (!row) throw Boom.notFound('Layer specification not found');
  return rowToLayerSpec(row);
};

exports.createLayerSpec = async (data) => {
  if (!data.itemCode) throw Boom.badRequest('itemCode is required');
  if (!data.layerNo) throw Boom.badRequest('layerNo is required');
  if (!data.material) throw Boom.badRequest('material is required');

  const layerId = await nextLayerId();

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const itemId = await resolveItemId(conn, data.itemCode);
    await conn.query(
      `INSERT INTO layer_specifications (layer_id, item_id, item_code, layer_no, material, size, gsm, bf,
        shade, status, flute, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [layerId, itemId, data.itemCode, data.layerNo, data.material, data.size, data.gsm, data.bf,
        data.shade, data.status || 'Active', data.flute, data.remarks]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('This item already has a layer with that layer number');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getLayerSpecById(layerId);
};

exports.updateLayerSpec = async (layerId, data) => {
  const existing = await getRowByBusinessId(layerId);
  if (!existing) throw Boom.notFound('Layer specification not found');
  if (!data.itemCode) throw Boom.badRequest('itemCode is required');
  if (!data.layerNo) throw Boom.badRequest('layerNo is required');
  if (!data.material) throw Boom.badRequest('material is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const itemId = await resolveItemId(conn, data.itemCode);
    await conn.query(
      `UPDATE layer_specifications SET item_id=?, item_code=?, layer_no=?, material=?, size=?, gsm=?, bf=?,
        shade=?, status=?, flute=?, remarks=?
       WHERE id = ?`,
      [itemId, data.itemCode, data.layerNo, data.material, data.size, data.gsm, data.bf, data.shade,
        data.status, data.flute, data.remarks, existing.id]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('This item already has a layer with that layer number');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getLayerSpecById(layerId);
};

// Soft delete — matches the Master modules convention (status flip, not a hard DELETE).
exports.deleteLayerSpec = async (layerId) => {
  const existing = await getRowByBusinessId(layerId);
  if (!existing) throw Boom.notFound('Layer specification not found');
  await db.query(`UPDATE layer_specifications SET status = 'Inactive' WHERE id = ?`, [existing.id]);
};
