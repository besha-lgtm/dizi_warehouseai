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

// Badge colour class the frontend already keys off (see QCJob.stageBadgeClass usage) —
// derived from how many stages still need a QC decision on this batch.
function computeStageBadgeClass(stages) {
  if (!stages.length) return 'badge-grey';
  if (stages.every(s => s.status === 'Approved')) return 'badge-green';
  if (stages.some(s => s.status === 'On Hold')) return 'badge-red';
  if (stages.some(s => s.status === 'Pending')) return 'badge-amber';
  return 'badge-grey';
}

async function getRowByBatchNo(batchNo) {
  const [rows] = await db.query('SELECT * FROM production_batches WHERE batch_no = ? LIMIT 1', [batchNo]);
  return rows[0];
}

async function buildQCJob(batchRow) {
  const batchPk = batchRow.id;

  const [[itemRows], [trackingStages], [approvalRows], [photoRows]] = await Promise.all([
    db.query('SELECT * FROM production_execution_items WHERE batch_id = ? ORDER BY s_no', [batchPk]),
    db.query('SELECT * FROM production_stage_tracking WHERE batch_id = ? ORDER BY sequence_no', [batchPk]),
    db.query('SELECT * FROM stage_qc_approvals WHERE batch_id = ? ORDER BY id', [batchPk]),
    db.query('SELECT * FROM stage_qc_photos WHERE batch_id = ? ORDER BY uploaded_at', [batchPk])
  ]);

  const approvalByStage = approvalRows.reduce((acc, a) => { acc[a.stage_name] = a; return acc; }, {});

  const approvalIds = approvalRows.map(a => a.id);
  let paramsByApproval = {};
  if (approvalIds.length) {
    const [paramRows] = await db.query(
      `SELECT * FROM stage_qc_parameters WHERE approval_id IN (?) ORDER BY sr_no`,
      [approvalIds]
    );
    paramsByApproval = paramRows.reduce((acc, p) => {
      (acc[p.approval_id] = acc[p.approval_id] || []).push(p);
      return acc;
    }, {});
  }

  // Stage list comes from production_stage_tracking (the same sequence Execution
  // drives) — QC status defaults to 'Not Started' until an approval row exists.
  const stages = trackingStages.map(t => {
    const approval = approvalByStage[t.name];
    return {
      name: t.name,
      status: approval ? approval.status : 'Not Started',
      timestamp: approval ? formatDisplayDateTime(approval.inspected_at) : undefined
    };
  });

  const stageParameters = {};
  for (const t of trackingStages) {
    const approval = approvalByStage[t.name];
    const params = approval ? (paramsByApproval[approval.id] || []) : [];
    stageParameters[t.name] = params.map(p => ({
      srNo: p.sr_no,
      parameterName: p.parameter_name,
      specification: p.specification,
      observedValue: p.observed_value,
      unit: p.unit,
      result: p.result,
      remarks: p.remarks
    }));
  }

  // pos/items/qty derived from the same execution data — QC doesn't duplicate
  // production's own record of what's being made, only overlays the sign-off.
  const posMap = {};
  for (const i of itemRows) {
    if (!i.customer_po) continue;
    posMap[i.customer_po] = (posMap[i.customer_po] || 0) + Number(i.planned_qty || 0);
  }
  const pos = Object.entries(posMap).map(([poNo, qty]) => ({ poNo, qty }));

  const latestApproval = approvalRows
    .filter(a => a.inspected_at)
    .sort((a, b) => new Date(b.inspected_at) - new Date(a.inspected_at))[0];

  return {
    jobId: batchRow.job_id,
    batchNo: batchRow.batch_no,
    customer: batchRow.customer,
    plannedQty: Number(batchRow.total_planned_qty) || 0,
    producedQty: Number(batchRow.total_produced_qty) || 0,
    uom: 'Nos',
    jobDate: batchRow.job_release_date,
    dueDate: batchRow.planned_delivery_date,
    priority: batchRow.priority,
    pos,
    totalItems: batchRow.total_items,
    items: itemRows.map(i => ({
      name: i.item_description,
      plannedQty: Number(i.planned_qty) || 0,
      producedQty: Number(i.produced_qty) || 0,
      uom: 'Nos',
      poNo: i.customer_po
    })),
    stages,
    inspectedBy: latestApproval ? latestApproval.inspected_by : '',
    inspectedOn: latestApproval ? formatDisplayDateTime(latestApproval.inspected_at) : '',
    remarks: (approvalRows.find(a => a.remarks)?.remarks) || '',
    photos: photoRows.map(p => ({ id: p.id, url: p.url, name: p.name })),
    stageParameters,
    stageBadgeClass: computeStageBadgeClass(stages),
    time: formatDisplayDateTime(batchRow.last_updated_date || batchRow.created_at)
  };
}

exports.getQCJobs = async () => {
  // Only batches that have actually started production are QC-relevant —
  // matches Execution's own batch list, just re-shaped for the QC screen.
  const [rows] = await db.query('SELECT * FROM production_batches ORDER BY created_at DESC');
  return Promise.all(rows.map(buildQCJob));
};

exports.getQCJob = async (batchNo) => {
  const row = await getRowByBatchNo(batchNo);
  if (!row) throw Boom.notFound('Production batch not found');
  return buildQCJob(row);
};

/**
 * Saves the full QC state for one stage of a batch in one shot: the
 * approval decision (status/inspector/remarks) and its parameter checklist.
 * Upserts stage_qc_approvals (one row per batch+stage, enforced by the
 * unique key) then replaces that approval's parameter rows wholesale —
 * same delete-then-insert convention used for every other child list in
 * this codebase (planning items/stages, BOM, QC requirements, etc).
 */
exports.saveStageDecision = async (batchNo, stageName, data, actedBy) => {
  const batch = await getRowByBatchNo(batchNo);
  if (!batch) throw Boom.notFound('Production batch not found');

  const [[stageExists]] = await db.query(
    'SELECT id FROM production_stage_tracking WHERE batch_id = ? AND name = ? LIMIT 1',
    [batch.id, stageName]
  );
  if (!stageExists) throw Boom.badRequest(`"${stageName}" is not a stage in this batch's process flow`);

  const status = data.status || 'Pending';
  if (status === 'Approved' && !(data.parameters && data.parameters.length)) {
    // Mirrors the QC Incoming gate: don't let a stage go to Approved with an
    // empty checklist — there'd be nothing backing the sign-off.
    throw Boom.badRequest(`Cannot approve ${stageName}: record at least one QC parameter first.`);
  }

  const conn = await db.getConnection();
  let approvalId;
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      'SELECT id FROM stage_qc_approvals WHERE batch_id = ? AND stage_name = ? LIMIT 1',
      [batch.id, stageName]
    );

    if (existing) {
      approvalId = existing.id;
      await conn.query(
        `UPDATE stage_qc_approvals SET status = ?, inspected_by = ?, inspected_at = ?, remarks = ?, last_updated_by = ?
         WHERE id = ?`,
        [status, data.inspectedBy || actedBy, status === 'Approved' || status === 'Rejected' ? new Date() : null,
          data.remarks || null, actedBy, approvalId]
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO stage_qc_approvals (batch_id, stage_name, status, inspected_by, inspected_at, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [batch.id, stageName, status, data.inspectedBy || actedBy,
          status === 'Approved' || status === 'Rejected' ? new Date() : null, data.remarks || null, actedBy]
      );
      approvalId = result.insertId;
    }

    await conn.query('DELETE FROM stage_qc_parameters WHERE approval_id = ?', [approvalId]);
    let srNo = 1;
    for (const p of data.parameters || []) {
      await conn.query(
        `INSERT INTO stage_qc_parameters (approval_id, sr_no, parameter_name, specification, observed_value, unit,
          result, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [approvalId, p.srNo || srNo++, p.parameterName, p.specification || null, p.observedValue || null,
          p.unit || null, p.result || null, p.remarks || null, actedBy]
      );
    }

    // Mirror the QC decision onto the same-named row in production_stage_tracking
    // so Production Execution's own stage list reflects Approved/On Hold too —
    // Approved maps to Completed there, anything else leaves it as-is.
    if (status === 'Approved') {
      await conn.query(
        `UPDATE production_stage_tracking SET status = 'Completed', completed_at = COALESCE(completed_at, ?)
         WHERE batch_id = ? AND name = ?`,
        [new Date(), batch.id, stageName]
      );
    }

    // If every stage on this batch now has an Approved QC decision, the batch itself
    // is done — flip it to Completed so it's ready to flow into Finished Goods.
    const [[{ totalStages }]] = await conn.query(
      'SELECT COUNT(*) AS totalStages FROM production_stage_tracking WHERE batch_id = ?',
      [batch.id]
    );
    const [[{ approvedStages }]] = await conn.query(
      `SELECT COUNT(*) AS approvedStages FROM stage_qc_approvals
       WHERE batch_id = ? AND status = 'Approved'`,
      [batch.id]
    );
    if (totalStages > 0 && approvedStages === totalStages && batch.status !== 'Completed') {
      await conn.query(
        `UPDATE production_batches SET status = 'Completed', actual_end_date = COALESCE(actual_end_date, ?),
          last_updated_by = ? WHERE id = ?`,
        [new Date(), actedBy, batch.id]
      );

      // Push each execution item into Finished Goods stock — good_qty is what
      // actually passed QC and is available to dispatch. INSERT IGNORE guards
      // against re-running this if saveStageDecision is ever called again
      // after completion (uq_fg_batch_item is batch_id + execution_item_id).
      const [execItems] = await conn.query(
        'SELECT * FROM production_execution_items WHERE batch_id = ?',
        [batch.id]
      );
      for (const item of execItems) {
        await conn.query(
          `INSERT IGNORE INTO finished_goods
            (batch_id, execution_item_id, job_id, batch_no, customer, item_code, item_description,
             customer_po, qty_in_stock, uom, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [batch.id, item.id, batch.job_id, batch.batch_no, batch.customer, item.item_code,
            item.item_description, item.customer_po, item.good_qty || 0, 'Nos', 'In Stock', actedBy]
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return buildQCJob(await getRowByBatchNo(batchNo));
};

exports.addPhoto = async (batchNo, data, uploadedBy) => {
  const batch = await getRowByBatchNo(batchNo);
  if (!batch) throw Boom.notFound('Production batch not found');
  if (!data.name) throw Boom.badRequest('name is required');

  await db.query(
    'INSERT INTO stage_qc_photos (batch_id, name, url, uploaded_by) VALUES (?, ?, ?, ?)',
    [batch.id, data.name, data.url || null, uploadedBy]
  );
  return buildQCJob(await getRowByBatchNo(batchNo));
};

exports.deletePhoto = async (batchNo, photoId) => {
  const batch = await getRowByBatchNo(batchNo);
  if (!batch) throw Boom.notFound('Production batch not found');
  await db.query('DELETE FROM stage_qc_photos WHERE id = ? AND batch_id = ?', [photoId, batch.id]);
  return buildQCJob(await getRowByBatchNo(batchNo));
};