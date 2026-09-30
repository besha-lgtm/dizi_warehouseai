const db = require('../../config/db');
const Boom = require('@hapi/boom');

function formatDisplayDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return String(dt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${dd}/${mm}/${yyyy} ${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
}

function rowToPlanningBatch(row, items, stages, spec, attachments, bom, qcRequirements) {
  return {
    jobId: row.job_id,
    batchNo: row.batch_no,
    customer: row.customer,
    pos: row.pos,
    totalItems: row.total_items,
    jobReleaseDate: row.job_release_date,
    plannedStartDate: row.planned_start_date,
    plannedDeliveryDate: row.planned_delivery_date,
    status: row.status,
    versionNo: row.version_no,
    totalPlannedQty: row.total_planned_qty,
    totalWeight: row.total_weight,
    totalSheets: row.total_sheets,
    priority: row.priority,
    createdBy: row.created_by,
    createdOn: formatDisplayDateTime(row.created_at),
    items: items.map(i => ({
      sNo: i.s_no,
      itemCode: i.item_code,
      itemDescription: i.item_description,
      customerPo: i.customer_po,
      size: i.size,
      specification: i.specification,
      plannedQty: i.planned_qty,
      sheetWidth: i.sheet_width,
      sheetLength: i.sheet_length,
      status: i.status
    })),
    stages: stages.map(s => ({
      name: s.name,
      machine: s.machine,
      model: s.model,
      plannedSpeed: s.planned_speed,
      status: s.status,
      checked: !!s.checked
    })),
    keySpecs: spec ? {
      fluteType: spec.flute_type,
      ply: spec.ply,
      color: spec.color,
      boardGsm: spec.board_gsm,
      sheetWidth: spec.sheet_width,
      sheetLength: spec.sheet_length,
      dieCutOuts: spec.die_cut_outs,
      finishSize: spec.finish_size
    } : { fluteType: '', ply: '', color: '', boardGsm: '', sheetWidth: 0, sheetLength: 0, dieCutOuts: 0, finishSize: '' },
    standardWastage: row.standard_wastage,
    bomSize: row.bom_size,
    drawingNo: row.drawing_no,
    approvedBy: row.approved_by,
    approvedOn: formatDisplayDateTime(row.approved_at),
    remarks: row.remarks,
    attachments: attachments.map(a => ({ name: a.name, size: a.size, type: a.type })),
    bom: (bom || []).map(b => ({
      srNo: b.sr_no,
      materialCode: b.material_code,
      materialDescription: b.material_description,
      uom: b.uom,
      standardQty: b.standard_qty,
      requiredQty: b.required_qty,
      allocatedQty: b.allocated_qty,
      shortfall: b.shortfall,
      status: b.status
    })),
    qcRequirements: (qcRequirements || []).map(q => ({
      srNo: q.sr_no,
      qcStage: q.qc_stage,
      parameterChecked: q.parameter_checked,
      verificationFrequency: q.verification_frequency,
      targetLimits: q.target_limits
    })),
    time: formatDisplayDateTime(row.created_at)
  };
}

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

async function resolveCustomerId(conn, companyName) {
  if (!companyName) return null;
  const [rows] = await conn.query('SELECT id FROM customers WHERE company_name = ?', [companyName]);
  return rows.length ? rows[0].id : null;
}

async function getRowByBatchNo(batchNo) {
  const [rows] = await db.query('SELECT * FROM production_planning_batches WHERE batch_no = ? LIMIT 1', [batchNo]);
  return rows[0];
}

async function getFullBatch(batchPk) {
  const [[batchRow], [items], [stages], [specRows], [attachments], [bom], [qcRequirements]] = await Promise.all([
    db.query('SELECT * FROM production_planning_batches WHERE id = ?', [batchPk]),
    db.query('SELECT * FROM planning_items WHERE batch_id = ? ORDER BY s_no', [batchPk]),
    db.query('SELECT * FROM planning_stages WHERE batch_id = ? ORDER BY sequence_no', [batchPk]),
    db.query('SELECT * FROM planning_specifications WHERE batch_id = ? LIMIT 1', [batchPk]),
    db.query('SELECT * FROM planning_attachments WHERE batch_id = ? ORDER BY uploaded_at', [batchPk]),
    db.query('SELECT * FROM planning_bom WHERE batch_id = ? ORDER BY sr_no', [batchPk]),
    db.query('SELECT * FROM planning_qc_requirements WHERE batch_id = ? ORDER BY sr_no', [batchPk])
  ]);
  return rowToPlanningBatch(batchRow[0], items, stages, specRows[0], attachments, bom, qcRequirements);
}

async function logHistory(conn, batchNo, action, description, performedBy, changes) {
  await conn.query(
    'INSERT INTO planning_history (batch_no, action, description, performed_by, changes) VALUES (?, ?, ?, ?, ?)',
    [batchNo, action, description, performedBy || 'system', changes ? JSON.stringify(changes) : null]
  );
}

exports.getPlanningBatches = async () => {
  const [rows] = await db.query('SELECT id FROM production_planning_batches ORDER BY created_at DESC');
  return Promise.all(rows.map(r => getFullBatch(r.id)));
};

// Jobs that have been Released to the floor (Daily Jobs / Job Release stage) but don't
// have a production planning batch against them yet. Used to populate the "New Batch"
// job picker so a plan is always created from a real released job instead of free text.
exports.getAvailableJobs = async () => {
  const [jobRows] = await db.query(
    `SELECT dj.id, dj.job_id, dj.batch_no, dj.job_date, dj.priority
     FROM daily_jobs dj
     WHERE dj.status = 'Released'
       AND NOT EXISTS (
         SELECT 1 FROM production_planning_batches ppb WHERE ppb.daily_job_id = dj.id
       )
     ORDER BY dj.job_date DESC, dj.id DESC`
  );

  const results = [];
  for (const job of jobRows) {
    const [lineItems] = await db.query(
      'SELECT * FROM daily_job_line_items WHERE daily_job_id = ? ORDER BY id',
      [job.id]
    );
    const customer = lineItems.length ? lineItems[0].customer : '';
    const pos = [...new Set(lineItems.map(li => li.po_no).filter(Boolean))].join(', ');
    const totalPlannedQty = lineItems.reduce((sum, li) => sum + (Number(li.assigned_qty) || Number(li.req_qty) || 0), 0);

    results.push({
      dailyJobId: job.id,
      jobId: job.job_id,
      batchNo: job.batch_no,
      jobDate: job.job_date,
      priority: job.priority,
      customer,
      pos,
      totalItems: lineItems.length,
      totalPlannedQty,
      items: lineItems.map((li, idx) => ({
        sNo: idx + 1,
        itemCode: li.item_code,
        itemDescription: li.item_code,
        customerPo: li.po_no,
        size: li.dimensions || '',
        specification: [li.ply, li.gsm].filter(Boolean).join(' / '),
        plannedQty: Number(li.assigned_qty) || Number(li.req_qty) || 0,
        sheetWidth: 0,
        sheetLength: 0,
        status: 'Planned'
      }))
    });
  }
  return results;
};

exports.getPlanningBatch = async (batchNo) => {
  const row = await getRowByBatchNo(batchNo);
  if (!row) throw Boom.notFound('Production planning batch not found');
  return getFullBatch(row.id);
};

async function writeChildren(conn, batchPk, data) {
  await conn.query('DELETE FROM planning_items WHERE batch_id = ?', [batchPk]);
  for (const item of data.items || []) {
    const itemId = await resolveItemId(conn, item.itemCode);
    await conn.query(
      `INSERT INTO planning_items (batch_id, s_no, item_id, item_code, item_description, customer_po, size,
        specification, planned_qty, sheet_width, sheet_length, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchPk, item.sNo, itemId, item.itemCode, item.itemDescription, item.customerPo, item.size,
        item.specification, item.plannedQty || 0, item.sheetWidth || 0, item.sheetLength || 0, item.status || 'Planned']
    );
  }

  await conn.query('DELETE FROM planning_stages WHERE batch_id = ?', [batchPk]);
  let seq = 1;
  for (const stage of data.stages || []) {
    await conn.query(
      `INSERT INTO planning_stages (batch_id, name, machine, model, planned_speed, status, checked, sequence_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchPk, stage.name, stage.machine, stage.model, stage.plannedSpeed, stage.status || 'Pending',
        stage.checked ? 1 : 0, seq++]
    );
  }

  await conn.query('DELETE FROM planning_specifications WHERE batch_id = ?', [batchPk]);
  if (data.keySpecs) {
    const ks = data.keySpecs;
    await conn.query(
      `INSERT INTO planning_specifications (batch_id, flute_type, ply, color, board_gsm, sheet_width,
        sheet_length, die_cut_outs, finish_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchPk, ks.fluteType, ks.ply, ks.color, ks.boardGsm, ks.sheetWidth || null, ks.sheetLength || null,
        ks.dieCutOuts || null, ks.finishSize]
    );
  }

  await conn.query('DELETE FROM planning_attachments WHERE batch_id = ?', [batchPk]);
  for (const att of data.attachments || []) {
    await conn.query(
      'INSERT INTO planning_attachments (batch_id, name, size, type, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [batchPk, att.name, att.size, att.type || null, data.updatedBy || data.createdBy || 'system']
    );
  }

  await conn.query('DELETE FROM planning_bom WHERE batch_id = ?', [batchPk]);
  let bomSeq = 1;
  for (const b of data.bom || []) {
    await conn.query(
      `INSERT INTO planning_bom (batch_id, sr_no, material_code, material_description, uom,
        standard_qty, required_qty, allocated_qty, shortfall, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchPk, bomSeq++, b.materialCode, b.materialDescription, b.uom, b.standardQty || 0,
        b.requiredQty || 0, b.allocatedQty || 0, b.shortfall || 0, b.status || 'Pending',
        data.updatedBy || data.createdBy || 'system']
    );
  }

  await conn.query('DELETE FROM planning_qc_requirements WHERE batch_id = ?', [batchPk]);
  let qcSeq = 1;
  for (const q of data.qcRequirements || []) {
    await conn.query(
      `INSERT INTO planning_qc_requirements (batch_id, sr_no, qc_stage, parameter_checked,
        verification_frequency, target_limits, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [batchPk, qcSeq++, q.qcStage, q.parameterChecked, q.verificationFrequency || null,
        q.targetLimits || null, data.updatedBy || data.createdBy || 'system']
    );
  }
}

exports.createPlanningBatch = async (data, createdBy) => {
  if (!data.batchNo) throw Boom.badRequest('batchNo is required');
  if (!data.jobId) throw Boom.badRequest('jobId is required');
  if (!data.customer) throw Boom.badRequest('customer is required');

  const conn = await db.getConnection();
  let batchPk;
  try {
    await conn.beginTransaction();
    const customerId = await resolveCustomerId(conn, data.customer);

    const [result] = await conn.query(
      `INSERT INTO production_planning_batches (job_id, daily_job_id, batch_no, customer_id, customer, pos, total_items,
        job_release_date, planned_start_date, planned_delivery_date, status, version_no, total_planned_qty,
        total_weight, total_sheets, priority, standard_wastage, bom_size, drawing_no, approved_by, approved_at,
        remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.jobId, data.dailyJobId || null, data.batchNo, customerId, data.customer, data.pos || '', data.totalItems || (data.items?.length || 0),
        data.jobReleaseDate, data.plannedStartDate, data.plannedDeliveryDate, data.status || 'Planned',
        data.versionNo || 1, data.totalPlannedQty || 0, data.totalWeight || 0, data.totalSheets || 0,
        data.priority || 'P3', data.standardWastage || 0, data.bomSize || 0, data.drawingNo || null,
        data.approvedBy || null, data.status === 'Approved' ? (data.approvedOn || new Date()) : null, data.remarks || null, createdBy || 'system']
    );
    batchPk = result.insertId;

    await writeChildren(conn, batchPk, { ...data, createdBy });
    await logHistory(conn, data.batchNo, 'Created', `Production plan ${data.batchNo} created`, createdBy);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A batch with this Batch No or Job ID already exists');
    throw err;
  } finally {
    conn.release();
  }

  return getFullBatch(batchPk);
};

exports.updatePlanningBatch = async (batchNo, data, updatedBy) => {
  const existing = await getRowByBatchNo(batchNo);
  if (!existing) throw Boom.notFound('Production planning batch not found');
  if (!data.jobId) throw Boom.badRequest('jobId is required');
  if (!data.customer) throw Boom.badRequest('customer is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const customerId = await resolveCustomerId(conn, data.customer);

    // Only stamp approved_at the moment the batch first becomes Approved (or when
    // freshly re-approved after being un-approved) — otherwise keep whatever was
    // already there so repeat saves don't keep bumping the approval timestamp.
    const becomingApproved = data.status === 'Approved' && existing.status !== 'Approved';
    const approvedAt = becomingApproved ? new Date() : existing.approved_at;

    await conn.query(
      `UPDATE production_planning_batches SET job_id=?, customer_id=?, customer=?, pos=?, total_items=?,
        job_release_date=?, planned_start_date=?, planned_delivery_date=?, status=?, version_no=?,
        total_planned_qty=?, total_weight=?, total_sheets=?, priority=?, standard_wastage=?, bom_size=?,
        drawing_no=?, approved_by=?, approved_at=?, remarks=?, last_modified_by=?, last_modified_at=NOW()
       WHERE id = ?`,
      [data.jobId, customerId, data.customer, data.pos || '', data.totalItems || (data.items?.length || 0),
        data.jobReleaseDate, data.plannedStartDate, data.plannedDeliveryDate, data.status,
        data.versionNo || existing.version_no, data.totalPlannedQty || 0, data.totalWeight || 0,
        data.totalSheets || 0, data.priority, data.standardWastage || 0, data.bomSize || 0,
        data.drawingNo || null, data.approvedBy || null, approvedAt, data.remarks || null, updatedBy || 'system', existing.id]
    );

    await writeChildren(conn, existing.id, { ...data, updatedBy });

    if (data.status && data.status !== existing.status) {
      await logHistory(conn, batchNo, 'Status Changed', `Status changed from ${existing.status} to ${data.status}`,
        updatedBy, { from: existing.status, to: data.status });
    } else {
      await logHistory(conn, batchNo, 'Updated', `Production plan ${batchNo} updated`, updatedBy);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A batch with this Job ID already exists');
    throw err;
  } finally {
    conn.release();
  }

  return getFullBatch(existing.id);
};

exports.getPlanningHistory = async (batchNo) => {
  const [rows] = await db.query(
    'SELECT action, description, performed_by, performed_at, changes FROM planning_history WHERE batch_no = ? ORDER BY performed_at DESC',
    [batchNo]
  );
  return rows.map(r => ({
    action: r.action,
    description: r.description,
    performedBy: r.performed_by,
    performedAt: formatDisplayDateTime(r.performed_at),
    changes: r.changes
  }));
};