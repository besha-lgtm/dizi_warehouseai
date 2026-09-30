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

// Elapsed time since the current stage actually started (production_stage_tracking.started_at
// for the row matching production_batches.current_stage) — real wall-clock, not a mock string.
function computeElapsed(startedAt) {
  if (!startedAt) return '0h 0m';
  const start = new Date(startedAt);
  const diffMs = Date.now() - start.getTime();
  if (isNaN(diffMs) || diffMs < 0) return '0h 0m';
  const totalMin = Math.floor(diffMs / 60000);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
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

function rowToProductionBatch(row, items, stageTracking, downtimeLogs, materialConsumption) {
  const currentStageRow = stageTracking.find(s => s.name === row.current_stage);
  return {
    batchNo: row.batch_no,
    jobId: row.job_id,
    customer: row.customer,
    pos: row.pos,
    totalItems: row.total_items,
    jobReleaseDate: row.job_release_date,
    plannedStartDate: row.planned_start_date,
    plannedDeliveryDate: row.planned_delivery_date,
    status: row.status,
    versionNo: row.version_no,
    totalPlannedQty: Number(row.total_planned_qty) || 0,
    totalProducedQty: Number(row.total_produced_qty) || 0,
    totalWeight: Number(row.total_weight) || 0,
    totalSheets: Number(row.total_sheets) || 0,
    priority: row.priority,
    createdBy: row.created_by,
    createdOn: formatDisplayDateTime(row.created_at),
    lastUpdatedBy: row.last_updated_by || row.created_by,
    lastUpdatedOn: formatDisplayDateTime(row.last_updated_date),
    currentStage: row.current_stage || '',
    nextStage: row.next_stage || '',
    // No free-text work-center/line-machine columns on production_batches (only *_id FKs we don't
    // populate) — derive the display label from the machine on the current stage's tracking row,
    // matching what Production Planning already showed for this batch's first stage.
    workCenter: currentStageRow?.machine || '',
    lineMachine: currentStageRow?.machine || '',
    goodQty: Number(row.good_qty) || 0,
    rejectedQty: Number(row.rejected_qty) || 0,
    elapsedTime: computeElapsed(currentStageRow?.started_at),
    isLate: !!row.is_late,
    items: items.map(i => ({
      sNo: i.s_no,
      itemCode: i.item_code,
      itemDescription: i.item_description,
      customerPo: i.customer_po,
      size: i.size,
      specification: i.specification,
      plannedQty: Number(i.planned_qty) || 0,
      producedQty: Number(i.produced_qty) || 0,
      goodQty: Number(i.good_qty) || 0,
      rejectedQty: Number(i.rejected_qty) || 0,
      sheetWidth: Number(i.sheet_width) || 0,
      sheetLength: Number(i.sheet_length) || 0,
      status: i.status,
      stagesSummary: (i.stagesSummary || []).map(s => ({
        stageName: s.stage_name,
        plannedQty: Number(s.planned_qty) || 0,
        goodQty: Number(s.good_qty) || 0,
        rejectedQty: Number(s.rejected_qty) || 0,
        status: s.status
      }))
    })),
    stages: stageTracking.map(s => ({
      name: s.name,
      machine: s.machine,
      model: s.model,
      plannedSpeed: s.planned_speed,
      status: s.status
    })),
    attachments: [], // Not yet persisted — no execution_attachments table in the current schema.
    downtimeLogs: downtimeLogs.map(l => ({
      id: l.id,
      downtimeReason: l.downtime_reason,
      durationMin: l.duration_min,
      timestamp: formatDisplayDateTime(l.event_at)
    })),
    materialConsumption: materialConsumption.map(m => ({
      id: m.id,
      itemCode: m.item_code,
      desc: m.description,
      qtyConsumed: Number(m.qty_consumed) || 0,
      reelNo: m.reel_no
    })),
    remarks: row.remarks
  };
}

async function getRowByBatchNo(batchNo) {
  const [rows] = await db.query('SELECT * FROM production_batches WHERE batch_no = ? LIMIT 1', [batchNo]);
  return rows[0];
}

async function getFullBatch(batchPk) {
  const [[batchRow], [itemRows], [stageRows], [downtimeRows], [materialRows]] = await Promise.all([
    db.query('SELECT * FROM production_batches WHERE id = ?', [batchPk]),
    db.query('SELECT * FROM production_execution_items WHERE batch_id = ? ORDER BY s_no', [batchPk]),
    db.query('SELECT * FROM production_stage_tracking WHERE batch_id = ? ORDER BY sequence_no', [batchPk]),
    db.query('SELECT * FROM downtime_logs WHERE batch_id = ? ORDER BY event_at DESC', [batchPk]),
    db.query('SELECT * FROM material_consumption WHERE batch_id = ? ORDER BY created_at DESC', [batchPk])
  ]);

  const itemIds = itemRows.map(i => i.id);
  let stageSummaryRows = [];
  if (itemIds.length) {
    const [rows] = await db.query(
      `SELECT * FROM item_stage_summary WHERE item_id IN (?) ORDER BY id`,
      [itemIds]
    );
    stageSummaryRows = rows;
  }
  const itemsWithSummary = itemRows.map(i => ({
    ...i,
    stagesSummary: stageSummaryRows.filter(s => s.item_id === i.id)
  }));

  return rowToProductionBatch(batchRow[0], itemsWithSummary, stageRows, downtimeRows, materialRows);
}

exports.getExecutionBatches = async () => {
  const [rows] = await db.query('SELECT id FROM production_batches ORDER BY created_at DESC');
  return Promise.all(rows.map(r => getFullBatch(r.id)));
};

// Planning batches that have been Released to Production but haven't been turned into an
// execution run yet. Populates the "Start Execution" picker the same way Daily Jobs feeds
// the Planning "New Batch" picker.
exports.getAvailablePlans = async () => {
  const [planRows] = await db.query(
    `SELECT ppb.* FROM production_planning_batches ppb
     WHERE ppb.status = 'Released to Production'
       AND NOT EXISTS (SELECT 1 FROM production_batches pb WHERE pb.planning_batch_id = ppb.id)
     ORDER BY ppb.created_at DESC`
  );

  const results = [];
  for (const plan of planRows) {
    const [items] = await db.query('SELECT * FROM planning_items WHERE batch_id = ? ORDER BY s_no', [plan.id]);
    const [stages] = await db.query(
      'SELECT * FROM planning_stages WHERE batch_id = ? AND checked = 1 ORDER BY sequence_no',
      [plan.id]
    );
    results.push({
      planningBatchId: plan.id,
      jobId: plan.job_id,
      batchNo: plan.batch_no,
      customer: plan.customer,
      pos: plan.pos,
      totalItems: plan.total_items,
      totalPlannedQty: Number(plan.total_planned_qty) || 0,
      priority: plan.priority,
      plannedStartDate: plan.planned_start_date,
      itemCount: items.length,
      stageCount: stages.length
    });
  }
  return results;
};

exports.getExecutionBatch = async (batchNo) => {
  const row = await getRowByBatchNo(batchNo);
  if (!row) throw Boom.notFound('Production execution batch not found');
  return getFullBatch(row.id);
};

exports.createExecutionBatch = async (data, createdBy) => {
  if (!data.planningBatchId) throw Boom.badRequest('planningBatchId is required');

  const conn = await db.getConnection();
  let batchPk;
  try {
    await conn.beginTransaction();

    const [[plan]] = await conn.query(
      'SELECT * FROM production_planning_batches WHERE id = ? FOR UPDATE',
      [data.planningBatchId]
    );
    if (!plan) throw Boom.notFound('Production planning batch not found');
    if (plan.status !== 'Released to Production') {
      throw Boom.badRequest('This plan has not been Released to Production yet');
    }
    const [[already]] = await conn.query(
      'SELECT id FROM production_batches WHERE planning_batch_id = ?',
      [plan.id]
    );
    if (already) throw Boom.conflict('This plan already has a production execution batch');

    const [planItems] = await conn.query('SELECT * FROM planning_items WHERE batch_id = ? ORDER BY s_no', [plan.id]);
    const [checkedStages] = await conn.query(
      'SELECT * FROM planning_stages WHERE batch_id = ? AND checked = 1 ORDER BY sequence_no',
      [plan.id]
    );
    if (!checkedStages.length) throw Boom.badRequest('This plan has no process stages selected to execute');

    const currentStage = checkedStages[0].name;
    const nextStage = checkedStages[1]?.name || '';
    const customerId = await resolveCustomerId(conn, plan.customer);

    const [result] = await conn.query(
      `INSERT INTO production_batches (planning_batch_id, batch_no, job_id, customer_id, customer, pos, total_items,
        job_release_date, planned_start_date, planned_delivery_date, status, version_no, total_planned_qty,
        total_produced_qty, total_weight, total_sheets, priority, current_stage, next_stage, good_qty, rejected_qty,
        is_late, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
      [plan.id, plan.batch_no, plan.job_id, customerId, plan.customer, plan.pos, plan.total_items,
        plan.job_release_date, plan.planned_start_date, plan.planned_delivery_date, 'Planned', 1,
        plan.total_planned_qty, plan.total_weight, plan.total_sheets, plan.priority, currentStage, nextStage,
        plan.remarks, createdBy || 'system']
    );
    batchPk = result.insertId;

    for (const item of planItems) {
      const itemId = await resolveItemId(conn, item.item_code);
      const [itemResult] = await conn.query(
        `INSERT INTO production_execution_items (batch_id, s_no, item_id, item_code, item_description, customer_po,
          size, specification, planned_qty, sheet_width, sheet_length, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchPk, item.s_no, itemId, item.item_code, item.item_description, item.customer_po, item.size,
          item.specification, item.planned_qty || 0, item.sheet_width || 0, item.sheet_length || 0,
          'Pending', createdBy || 'system']
      );
      const execItemPk = itemResult.insertId;
      for (const stage of checkedStages) {
        await conn.query(
          `INSERT INTO item_stage_summary (item_id, stage_name, planned_qty, status, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [execItemPk, stage.name, item.planned_qty || 0, 'pending', createdBy || 'system']
        );
      }
    }

    let seq = 1;
    for (const stage of checkedStages) {
      await conn.query(
        `INSERT INTO production_stage_tracking (batch_id, name, machine, model, planned_speed, status, sequence_no, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchPk, stage.name, stage.machine, stage.model, stage.planned_speed, 'Pending', seq++, createdBy || 'system']
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A production batch with this Batch No already exists');
    throw err;
  } finally {
    conn.release();
  }

  return getFullBatch(batchPk);
};

// General update: batch header status/qtys, item + item-stage-summary progress, and stage
// tracking progress. Items/stages represent *current state* (not an append-only log), so a
// full delete+reinsert per save is safe here — unlike downtime/material-consumption below,
// which get their own endpoints specifically so this save path never touches their history.
exports.updateExecutionBatch = async (batchNo, data, updatedBy) => {
  const existing = await getRowByBatchNo(batchNo);
  if (!existing) throw Boom.notFound('Production execution batch not found');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const isLate = data.isLate ? 1 : 0;
    await conn.query(
      `UPDATE production_batches SET status=?, current_stage=?, next_stage=?, total_produced_qty=?,
        good_qty=?, rejected_qty=?, is_late=?, remarks=?, actual_start_date=COALESCE(actual_start_date, ?),
        actual_end_date=?, last_updated_by=?
       WHERE id=?`,
      [data.status || existing.status, data.currentStage ?? existing.current_stage, data.nextStage ?? existing.next_stage,
        data.totalProducedQty || 0, data.goodQty || 0, data.rejectedQty || 0, isLate, data.remarks || null,
        data.status && data.status !== 'Planned' ? new Date() : null,
        data.status === 'Completed' ? new Date() : null, updatedBy || 'system', existing.id]
    );

    // Preserve started_at/completed_at across the replace by name, since the frontend's
    // StageTracking model only carries status (not timestamps) between saves.
    const [oldStageRows] = await conn.query('SELECT * FROM production_stage_tracking WHERE batch_id = ?', [existing.id]);
    const oldStageByName = new Map(oldStageRows.map(s => [s.name, s]));

    await conn.query('DELETE FROM item_stage_summary WHERE item_id IN (SELECT id FROM production_execution_items WHERE batch_id = ?)', [existing.id]);
    await conn.query('DELETE FROM production_execution_items WHERE batch_id = ?', [existing.id]);
    for (const item of data.items || []) {
      const [itemResult] = await conn.query(
        `INSERT INTO production_execution_items (batch_id, s_no, item_code, item_description, customer_po, size,
          specification, planned_qty, produced_qty, good_qty, rejected_qty, sheet_width, sheet_length, status,
          last_updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [existing.id, item.sNo, item.itemCode, item.itemDescription, item.customerPo, item.size, item.specification,
          item.plannedQty || 0, item.producedQty || 0, item.goodQty || 0, item.rejectedQty || 0,
          item.sheetWidth || 0, item.sheetLength || 0, item.status || 'Pending', updatedBy || 'system']
      );
      const execItemPk = itemResult.insertId;
      for (const ss of item.stagesSummary || []) {
        const wasStarted = oldStageByName.get(ss.stageName)?.started_at;
        await conn.query(
          `INSERT INTO item_stage_summary (item_id, stage_name, planned_qty, good_qty, rejected_qty, status,
            started_at, completed_at, last_updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [execItemPk, ss.stageName, ss.plannedQty || 0, ss.goodQty || 0, ss.rejectedQty || 0, ss.status || 'pending',
            ss.status !== 'pending' ? (wasStarted || new Date()) : null,
            ss.status === 'completed' ? new Date() : null, updatedBy || 'system']
        );
      }
    }

    await conn.query('DELETE FROM production_stage_tracking WHERE batch_id = ?', [existing.id]);
    let seq = 1;
    for (const stage of data.stages || []) {
      const old = oldStageByName.get(stage.name);
      const wasInProgressOrDone = old && old.status !== 'Pending';
      const startedAt = stage.status !== 'Pending'
        ? (wasInProgressOrDone ? old.started_at : new Date())
        : null;
      const completedAt = stage.status === 'Completed'
        ? (old?.status === 'Completed' ? old.completed_at : new Date())
        : null;
      await conn.query(
        `INSERT INTO production_stage_tracking (batch_id, name, machine, model, planned_speed, status,
          started_at, completed_at, sequence_no, last_updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [existing.id, stage.name, stage.machine, stage.model, stage.plannedSpeed, stage.status || 'Pending',
          startedAt, completedAt, seq++, updatedBy || 'system']
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getFullBatch(existing.id);
};

exports.addDowntimeLog = async (batchNo, data, loggedBy) => {
  const existing = await getRowByBatchNo(batchNo);
  if (!existing) throw Boom.notFound('Production execution batch not found');
  if (!data.downtimeReason) throw Boom.badRequest('downtimeReason is required');

  await db.query(
    `INSERT INTO downtime_logs (batch_id, downtime_reason, duration_min, logged_by, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [existing.id, data.downtimeReason, data.durationMin || 0, loggedBy || 'system', data.remarks || null, loggedBy || 'system']
  );
  return getFullBatch(existing.id);
};

exports.deleteDowntimeLog = async (batchNo, logId) => {
  const existing = await getRowByBatchNo(batchNo);
  if (!existing) throw Boom.notFound('Production execution batch not found');
  await db.query('DELETE FROM downtime_logs WHERE id = ? AND batch_id = ?', [logId, existing.id]);
  return getFullBatch(existing.id);
};

exports.addMaterialConsumption = async (batchNo, data, loggedBy) => {
  const existing = await getRowByBatchNo(batchNo);
  if (!existing) throw Boom.notFound('Production execution batch not found');
  if (!data.itemCode) throw Boom.badRequest('itemCode is required');

  await db.query(
    `INSERT INTO material_consumption (batch_id, item_code, description, qty_consumed, reel_no, uom,
      consumption_date, approved_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
    [existing.id, data.itemCode, data.desc || '', data.qtyConsumed || 0, data.reelNo || null, data.uom || 'Kgs',
      loggedBy || null, loggedBy || 'system']
  );
  return getFullBatch(existing.id);
};

exports.deleteMaterialConsumption = async (batchNo, logId) => {
  const existing = await getRowByBatchNo(batchNo);
  if (!existing) throw Boom.notFound('Production execution batch not found');
  await db.query('DELETE FROM material_consumption WHERE id = ? AND batch_id = ?', [logId, existing.id]);
  return getFullBatch(existing.id);
};