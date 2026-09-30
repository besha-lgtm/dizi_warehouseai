const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToJob(row, lineItems = []) {
  return {
    jobId: row.job_id,
    batchNo: row.batch_no,
    jobDate: row.job_date,
    jobType: row.job_type,
    priority: row.priority,
    machineLine: row.machine_line,
    remarks: row.remarks,
    status: row.status,
    avatarColor: row.avatar_color || undefined,
    lineItems: lineItems.map(li => ({
      customer: li.customer,
      poNo: li.po_no,
      itemCode: li.item_code,
      reqQty: li.req_qty,
      assignedQty: li.assigned_qty,
      ply: li.ply,
      gsm: li.gsm,
      dimensions: li.dimensions
    }))
  };
}

async function getRowByJobId(jobId) {
  const [rows] = await db.query('SELECT * FROM daily_jobs WHERE job_id = ? LIMIT 1', [jobId]);
  return rows[0];
}

exports.getJobs = async () => {
  const [rows] = await db.query('SELECT * FROM daily_jobs ORDER BY job_date DESC, id DESC');
  const results = [];
  for (const row of rows) {
    const [lineItems] = await db.query('SELECT * FROM daily_job_line_items WHERE daily_job_id = ? ORDER BY id', [row.id]);
    results.push(rowToJob(row, lineItems));
  }
  return results;
};

async function resolveMachineId(conn, machineLine) {
  if (!machineLine) return null;
  const [rows] = await conn.query('SELECT id FROM machines WHERE machine_line = ? OR machine_name = ? LIMIT 1', [machineLine, machineLine]);
  return rows.length ? rows[0].id : null;
}

async function resolveCustomerId(conn, companyName) {
  if (!companyName) return null;
  const [rows] = await conn.query('SELECT id FROM customers WHERE company_name = ?', [companyName]);
  return rows.length ? rows[0].id : null;
}

async function resolvePoAndItem(conn, poNo, itemCode) {
  const [poRows] = await conn.query('SELECT id FROM customer_purchase_orders WHERE po_no = ?', [poNo]);
  const customerPoId = poRows.length ? poRows[0].id : null;
  let itemId = null;
  if (customerPoId && itemCode) {
    const [itemRows] = await conn.query(
      'SELECT item_id FROM customer_po_line_items WHERE customer_po_id = ? AND item_code = ? LIMIT 1',
      [customerPoId, itemCode]
    );
    itemId = itemRows.length ? itemRows[0].item_id : null;
  }
  return { customerPoId, itemId };
}

async function writeLineItems(conn, dailyJobId, lineItems) {
  await conn.query('DELETE FROM daily_job_line_items WHERE daily_job_id = ?', [dailyJobId]);
  for (const li of lineItems || []) {
    const customerId = await resolveCustomerId(conn, li.customer);
    const { customerPoId, itemId } = await resolvePoAndItem(conn, li.poNo, li.itemCode);
    await conn.query(
      `INSERT INTO daily_job_line_items (daily_job_id, customer_id, customer, customer_po_id, po_no, item_id,
        item_code, req_qty, assigned_qty, ply, gsm, dimensions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dailyJobId, customerId, li.customer, customerPoId, li.poNo, itemId, li.itemCode,
        li.reqQty || 0, li.assignedQty || 0, li.ply || null, li.gsm || null, li.dimensions || null]
    );
  }
}

function nextJobId(lastJobId) {
  const year = new Date().getFullYear();
  const match = /JOB-(\d{4})-(\d+)/.exec(lastJobId || '');
  const seq = match && Number(match[1]) === year ? Number(match[2]) + 1 : 1;
  return `JOB-${year}-${String(seq).padStart(3, '0')}`;
}

exports.createJob = async (data, createdBy) => {
  if (!data.batchNo) throw Boom.badRequest('batchNo is required');
  if (!data.lineItems || !data.lineItems.length) throw Boom.badRequest('At least one line item is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const machineId = await resolveMachineId(conn, data.machineLine);

    const [[lastRow]] = await conn.query(
      `SELECT job_id FROM daily_jobs WHERE job_id LIKE ? ORDER BY id DESC LIMIT 1`,
      [`JOB-${new Date().getFullYear()}-%`]
    );
    const jobId = data.jobId || nextJobId(lastRow && lastRow.job_id);

    const [result] = await conn.query(
      `INSERT INTO daily_jobs (job_id, batch_no, job_date, job_type, priority, machine_id, machine_line,
        remarks, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [jobId, data.batchNo, data.jobDate || new Date(), data.jobType || 'Regular', data.priority || 'P2',
        machineId, data.machineLine || null, data.remarks || null, data.status || 'Draft', createdBy || 'system']
    );
    const dailyJobId = result.insertId;
    await writeLineItems(conn, dailyJobId, data.lineItems);

    await conn.commit();
    const [lineItems] = await db.query('SELECT * FROM daily_job_line_items WHERE daily_job_id = ? ORDER BY id', [dailyJobId]);
    const [[jobRow]] = await db.query('SELECT * FROM daily_jobs WHERE id = ?', [dailyJobId]);
    return rowToJob(jobRow, lineItems);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A job with this Job ID already exists');
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateJob = async (jobId, data, updatedBy) => {
  const existing = await getRowByJobId(jobId);
  if (!existing) throw Boom.notFound('Job not found');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const machineId = await resolveMachineId(conn, data.machineLine);

    await conn.query(
      `UPDATE daily_jobs SET batch_no = ?, job_date = ?, job_type = ?, priority = ?, machine_id = ?,
        machine_line = ?, remarks = ?, status = ?, last_updated_by = ?
       WHERE id = ?`,
      [data.batchNo || existing.batch_no, data.jobDate || existing.job_date, data.jobType || existing.job_type,
        data.priority || existing.priority, machineId, data.machineLine ?? existing.machine_line,
        data.remarks ?? existing.remarks, data.status || existing.status, updatedBy || 'system', existing.id]
    );

    if (data.lineItems) {
      await writeLineItems(conn, existing.id, data.lineItems);
    }

    await conn.commit();
    const [lineItems] = await db.query('SELECT * FROM daily_job_line_items WHERE daily_job_id = ? ORDER BY id', [existing.id]);
    const [[jobRow]] = await db.query('SELECT * FROM daily_jobs WHERE id = ?', [existing.id]);
    return rowToJob(jobRow, lineItems);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.deleteJob = async (jobId) => {
  const existing = await getRowByJobId(jobId);
  if (!existing) throw Boom.notFound('Job not found');
  await db.query('DELETE FROM daily_jobs WHERE id = ?', [existing.id]);
};

exports.getPoOptions = async (customer) => {
  if (!customer) return [];
  const [rows] = await db.query(
    `SELECT DISTINCT po_no FROM customer_purchase_orders
     WHERE customer = ? AND status = 'Released'
     ORDER BY po_no`,
    [customer]
  );
  return rows.map(r => ({ label: r.po_no, value: r.po_no }));
};

// Feeds the "Item" dropdown once a PO is picked: pulls ordered qty from the PO
// line item and, where available, ply/GSM/dimensions from Product Spec
// (item_pms_master) via the shared pms_ref — falling back to sensible defaults
// since not every item will have a PMS record yet.
exports.getItemOptions = async (customer, poNo) => {
  if (!customer || !poNo) return [];
  const [rows] = await db.query(
    `SELECT cli.item_code, cli.ordered_qty, cli.pms_ref,
            pm.ply, pm.board_gsm, pm.length, pm.width, pm.height
     FROM customer_po_line_items cli
     JOIN customer_purchase_orders cpo ON cpo.id = cli.customer_po_id
     LEFT JOIN item_pms_master pm ON pm.pms_ref = cli.pms_ref
     WHERE cpo.po_no = ? AND cpo.customer = ?
     ORDER BY cli.id`,
    [poNo, customer]
  );
  return rows.map(r => ({
    label: r.item_code,
    value: r.item_code,
    reqQty: Number(r.ordered_qty) || 0,
    ply: r.ply ? `${r.ply} Ply` : '5 Ply',
    gsm: r.board_gsm ? `${r.board_gsm} GSM` : '180 GSM',
    dimensions: (r.length && r.width && r.height) ? `${r.length}x${r.width}x${r.height} mm` : 'Standard'
  }));
};

// Feeds the "Machine / Line" dropdown — real active machines instead of the
// previously hardcoded list.
exports.getMachineOptions = async () => {
  const [rows] = await db.query(
    `SELECT DISTINCT COALESCE(machine_line, machine_name) AS label
     FROM machines WHERE status = 'Active' ORDER BY label`
  );
  return rows.map(r => ({ label: r.label, value: r.label }));
};
