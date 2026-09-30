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

// dispatches.* fields (customer/item_code/item_description/batch_no/job_id) are captured
// once at dispatch time from the finished_goods row they were picked from — same
// denormalization approach finished_goods itself uses against production_execution_items,
// so a dispatch record stays accurate even if the FG stock row is edited/consumed later.
function rowToDispatch(row) {
  return {
    id: row.id,
    dispatchId: row.dispatch_no,
    dispatchDate: row.dispatch_date,
    poNo: row.customer_po || '',
    customer: row.customer || '',
    itemCode: row.item_code || '',
    fgRefId: row.finished_good_id,
    dispatchQty: Number(row.dispatch_qty) || 0,
    bundles: row.bundles === null || row.bundles === undefined ? null : Number(row.bundles),
    vehicleNo: row.vehicle_no || '',
    driverContact: row.driver_contact || '',
    ewayBill: row.eway_bill || '',
    status: row.status,
    remarks: row.remarks || '',
    jobId: row.job_id || '',
    batchNo: row.batch_no || '',
    uom: row.uom,
    createdBy: row.created_by,
    lastUpdatedBy: row.last_updated_by || row.created_by,
    lastUpdatedOn: formatDisplayDate(row.last_updated_date)
  };
}

async function generateDispatchNo(conn) {
  const [rows] = await conn.query(
    `SELECT dispatch_no FROM dispatches WHERE dispatch_no LIKE 'D-%' ORDER BY id DESC LIMIT 1`
  );
  let next = 1;
  if (rows.length) {
    const n = parseInt(String(rows[0].dispatch_no).split('-')[1], 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `D-${String(next).padStart(3, '0')}`;
}

// Recomputes a finished_goods row's status from its remaining qty_in_stock —
// mirrors the pattern of deriving status from a quantity rather than trusting
// a separately-editable field, so it can never drift out of sync with stock.
async function syncFgStatus(conn, fgId) {
  const [[fg]] = await conn.query('SELECT qty_in_stock, status FROM finished_goods WHERE id = ?', [fgId]);
  if (!fg) return;
  const newStatus = Number(fg.qty_in_stock) <= 0 ? 'Dispatched' : 'In Stock';
  if (fg.status !== newStatus && fg.status !== 'Hold') {
    await conn.query('UPDATE finished_goods SET status = ? WHERE id = ?', [newStatus, fgId]);
  }
}

const BASE_SELECT = 'SELECT * FROM dispatches';

exports.getDispatches = async () => {
  const [rows] = await db.query(`${BASE_SELECT} ORDER BY created_at DESC`);
  return rows.map(rowToDispatch);
};

exports.getDispatch = async (id) => {
  const [rows] = await db.query(`${BASE_SELECT} WHERE id = ?`, [id]);
  if (!rows.length) throw Boom.notFound('Dispatch record not found');
  return rowToDispatch(rows[0]);
};

// Creates a dispatch against a specific finished_goods stock row and reserves
// (deducts) the dispatched quantity from that stock immediately — same "commit
// on save" behaviour as stagewiseQc.saveStageDecision, done inside a transaction
// with a row lock so two concurrent dispatches can't oversell the same stock.
exports.createDispatch = async (data, createdBy) => {
  if (!data.fgRefId) throw Boom.badRequest('fgRefId (finished goods stock reference) is required');
  const qty = Number(data.dispatchQty);
  if (!qty || qty <= 0) throw Boom.badRequest('dispatchQty must be greater than 0');
  if (!data.vehicleNo) throw Boom.badRequest('vehicleNo is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[fg]] = await conn.query('SELECT * FROM finished_goods WHERE id = ? FOR UPDATE', [data.fgRefId]);
    if (!fg) throw Boom.notFound('Finished goods stock record not found');
    if (Number(fg.qty_in_stock) < qty) {
      throw Boom.badRequest(`Only ${fg.qty_in_stock} ${fg.uom} available in stock for this item`);
    }

    const dispatchNo = data.dispatchId && data.dispatchId.trim() ? data.dispatchId.trim() : await generateDispatchNo(conn);
    const status = data.status || 'Planned';

    const [result] = await conn.query(
      `INSERT INTO dispatches
        (dispatch_no, dispatch_date, finished_good_id, job_id, batch_no, customer_po, customer,
         item_code, item_description, dispatch_qty, bundles, uom, vehicle_no, driver_contact,
         eway_bill, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dispatchNo, data.dispatchDate || new Date(), fg.id, fg.job_id, fg.batch_no, fg.customer_po, fg.customer,
        fg.item_code, fg.item_description, qty, data.bundles ?? null, fg.uom, data.vehicleNo,
        data.driverContact || null, data.ewayBill || null, status, data.remarks || null, createdBy || 'system']
    );

    // status !== 'Cancelled' means the quantity is actively reserved against stock
    if (status !== 'Cancelled') {
      await conn.query('UPDATE finished_goods SET qty_in_stock = qty_in_stock - ? WHERE id = ?', [qty, fg.id]);
      await syncFgStatus(conn, fg.id);
    }

    await conn.commit();
    return exports.getDispatch(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Handles quantity changes and status transitions (e.g. Planned -> Cancelled, or
// Cancelled -> Planned) by reconciling the delta against finished_goods.qty_in_stock,
// so the FG stock figure always reflects what's actually still available to dispatch.
exports.updateDispatch = async (id, data, updatedBy) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT * FROM dispatches WHERE id = ? FOR UPDATE', [id]);
    if (!existing) throw Boom.notFound('Dispatch record not found');

    const [[fg]] = await conn.query('SELECT * FROM finished_goods WHERE id = ? FOR UPDATE', [existing.finished_good_id]);
    if (!fg) throw Boom.notFound('Finished goods stock record not found');

    const oldQty = Number(existing.dispatch_qty);
    const oldReserved = existing.status !== 'Cancelled';
    const newQty = data.dispatchQty !== undefined ? Number(data.dispatchQty) : oldQty;
    if (!newQty || newQty <= 0) throw Boom.badRequest('dispatchQty must be greater than 0');
    const newStatus = data.status || existing.status;
    const newReserved = newStatus !== 'Cancelled';

    // How much of newQty still needs to come out of current stock, on top of what's
    // already reserved by this dispatch (0 if this dispatch is currently cancelled).
    const currentlyReserved = oldReserved ? oldQty : 0;
    const requiredReserved = newReserved ? newQty : 0;
    const delta = requiredReserved - currentlyReserved;

    if (delta > 0 && Number(fg.qty_in_stock) < delta) {
      throw Boom.badRequest(`Only ${fg.qty_in_stock} ${fg.uom} available in stock for this item`);
    }
    if (delta !== 0) {
      await conn.query('UPDATE finished_goods SET qty_in_stock = qty_in_stock - ? WHERE id = ?', [delta, fg.id]);
      await syncFgStatus(conn, fg.id);
    }

    await conn.query(
      `UPDATE dispatches SET dispatch_date = ?, dispatch_qty = ?, bundles = ?, vehicle_no = ?,
        driver_contact = ?, eway_bill = ?, status = ?, remarks = ?, last_updated_by = ? WHERE id = ?`,
      [data.dispatchDate || existing.dispatch_date, newQty, data.bundles ?? existing.bundles,
        data.vehicleNo || existing.vehicle_no, data.driverContact ?? existing.driver_contact,
        data.ewayBill ?? existing.eway_bill, newStatus, data.remarks ?? existing.remarks,
        updatedBy || 'system', id]
    );

    await conn.commit();
    return exports.getDispatch(id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Deleting a dispatch that still has stock reserved against it releases that
// quantity back to finished_goods first, same reconciliation as cancelling it.
exports.deleteDispatch = async (id) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT * FROM dispatches WHERE id = ? FOR UPDATE', [id]);
    if (!existing) throw Boom.notFound('Dispatch record not found');

    if (existing.status !== 'Cancelled') {
      await conn.query('UPDATE finished_goods SET qty_in_stock = qty_in_stock + ? WHERE id = ?', [existing.dispatch_qty, existing.finished_good_id]);
      await syncFgStatus(conn, existing.finished_good_id);
    }

    await conn.query('DELETE FROM dispatches WHERE id = ?', [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
