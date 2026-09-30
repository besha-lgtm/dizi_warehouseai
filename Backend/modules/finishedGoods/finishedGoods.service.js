const db = require('../../config/db');
const Boom = require('@hapi/boom');

function formatDisplayDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// finished_goods rows are written by stagewiseQc.service.js#saveStageDecision once
// every stage on a batch is Approved — this module only reads/manages that stock,
// it never creates rows itself (mirrors how QC Incoming doesn't create batches).
function rowToFGStock(row) {
  return {
    id: row.id,
    fgId: `FG-${row.batch_no}-${row.item_code}`,
    fgDate: formatDisplayDate(row.created_at),
    jobId: row.job_id,
    batchNo: row.batch_no,
    customer: row.customer,
    itemCode: row.item_code,
    itemDescription: row.item_description,
    customerPo: row.customer_po,
    boxType: row.box_type || '',
    jobQty: Number(row.planned_qty) || 0,
    qtyInStock: Number(row.qty_in_stock) || 0,
    availableQty: Number(row.qty_in_stock) || 0,
    uom: row.uom,
    status: row.status,
    remarks: row.remarks || '',
    createdBy: row.created_by,
    lastUpdatedBy: row.last_updated_by || row.created_by,
    lastUpdatedOn: formatDisplayDate(row.last_updated_date)
  };
}

const BASE_SELECT = `
  SELECT fg.*, pei.planned_qty
  FROM finished_goods fg
  LEFT JOIN production_execution_items pei ON pei.id = fg.execution_item_id
`;

exports.getFinishedGoods = async () => {
  const [rows] = await db.query(`${BASE_SELECT} ORDER BY fg.created_at DESC`);
  return rows.map(rowToFGStock);
};

exports.getFinishedGood = async (id) => {
  const [rows] = await db.query(`${BASE_SELECT} WHERE fg.id = ?`, [id]);
  if (!rows.length) throw Boom.notFound('Finished goods record not found');
  return rowToFGStock(rows[0]);
};

// Manual stock adjustment (e.g. correcting a count, or writing off damaged stock) —
// distinct from the automatic insert on QC completion, same way QC's addPhoto is a
// separate endpoint from the main stage decision save.
exports.updateFinishedGood = async (id, data, updatedBy) => {
  const [[existing]] = await db.query('SELECT id FROM finished_goods WHERE id = ?', [id]);
  if (!existing) throw Boom.notFound('Finished goods record not found');

  await db.query(
    `UPDATE finished_goods SET qty_in_stock = ?, status = ?, remarks = ?, last_updated_by = ? WHERE id = ?`,
    [data.qtyInStock ?? 0, data.status || 'In Stock', data.remarks || null, updatedBy || 'system', id]
  );
  return exports.getFinishedGood(id);
};