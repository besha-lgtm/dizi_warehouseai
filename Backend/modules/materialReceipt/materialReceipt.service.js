const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToReel(r) {
  return {
    reelNo: r.reel_no,
    expectedGsm: r.expected_gsm,
    actualGsm: r.actual_gsm,
    expectedBf: r.expected_bf,
    actualBf: r.actual_bf,
    weight: r.weight,
    moisture: r.moisture,
    visual: r.visual,
    status: r.status
  };
}

function rowToDelivery(row, reels = []) {
  return {
    id: row.grn_no,
    grnNo: row.grn_no,
    poNumber: row.po_number,
    poDate: row.po_date,
    supplierName: row.supplier_name,
    itemDescription: row.item_description,
    deliveryDate: row.delivery_date,
    dueDate: row.due_date,
    totalReels: row.total_reels,
    inspector: row.inspector,
    priority: row.priority,
    deliveryType: row.delivery_type,
    status: row.status,
    approvedOn: row.approved_on,
    rejectedOn: row.rejected_on,
    warehouse: row.warehouse,
    // Step 1 of the two-step flow: whether QC Incoming Inspection has
    // recorded results for this GRN yet, and what it recommended. Populated
    // by the LEFT JOIN in the queries below — see getInspectionForGrn.
    inspectionNo: row.inspection_no || null,
    inspectionStatus: row.inspection_status || null,
    inspectionFinalDecision: row.inspection_final_decision || null,
    inspectionInspectorName: row.inspection_inspector_name || null,
    inspectionQcRemarks: row.inspection_qc_remarks || null,
    reels: reels.map(rowToReel)
  };
}

// Latest QC Incoming Inspection linked to a GRN (there could be more than one
// if the delivery was re-inspected) — used both to decorate the delivery list
// and to gate the Approve decision below.
const INSPECTION_JOIN = `
  LEFT JOIN (
    SELECT i1.* FROM qc_incoming_inspections i1
    INNER JOIN (SELECT grn_no, MAX(id) AS max_id FROM qc_incoming_inspections GROUP BY grn_no) i2
      ON i1.grn_no = i2.grn_no AND i1.id = i2.max_id
  ) insp ON insp.grn_no = material_receipts.grn_no
`;
const INSPECTION_SELECT = `insp.inspection_no, insp.status AS inspection_status,
  insp.final_decision AS inspection_final_decision, insp.inspector_name AS inspection_inspector_name,
  insp.qc_remarks AS inspection_qc_remarks`;

async function getRowByGrn(grnNo) {
  const [rows] = await db.query('SELECT * FROM material_receipts WHERE grn_no = ? LIMIT 1', [grnNo]);
  return rows[0];
}

exports.getDeliveries = async () => {
  const [rows] = await db.query(
    `SELECT material_receipts.*, ${INSPECTION_SELECT} FROM material_receipts
     ${INSPECTION_JOIN}
     ORDER BY delivery_date DESC, material_receipts.id DESC`
  );
  const results = [];
  for (const row of rows) {
    const [reels] = await db.query('SELECT * FROM material_receipt_reels WHERE receipt_id = ? ORDER BY id', [row.id]);
    results.push(rowToDelivery(row, reels));
  }
  return results;
};

exports.getDelivery = async (grnNo) => {
  const [rows] = await db.query(
    `SELECT material_receipts.*, ${INSPECTION_SELECT} FROM material_receipts
     ${INSPECTION_JOIN}
     WHERE material_receipts.grn_no = ? LIMIT 1`,
    [grnNo]
  );
  const row = rows[0];
  if (!row) throw Boom.notFound('Material receipt not found');
  const [reels] = await db.query('SELECT * FROM material_receipt_reels WHERE receipt_id = ? ORDER BY id', [row.id]);
  return rowToDelivery(row, reels);
};

function nextGrnNo(lastGrn) {
  const year = new Date().getFullYear();
  const match = /GRN-(\d{4})-(\d+)/.exec(lastGrn || '');
  const seq = match && Number(match[1]) === year ? Number(match[2]) + 1 : 1;
  return `GRN-${year}-${String(seq).padStart(4, '0')}`;
}

// Records goods physically arriving against a Supplier PO. Reels start as
// 'Pending' — actual QC values get filled in by the Incoming QC Approval screen.
exports.createReceipt = async (data, createdBy) => {
  if (!data.poNumber) throw Boom.badRequest('poNumber is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [poRows] = await conn.query('SELECT * FROM supplier_purchase_orders WHERE po_number = ?', [data.poNumber]);
    const po = poRows[0];
    if (!po) throw Boom.badRequest(`Supplier PO "${data.poNumber}" not found`);

    const [[lastRow]] = await conn.query(
      `SELECT grn_no FROM material_receipts WHERE grn_no LIKE ? ORDER BY id DESC LIMIT 1`,
      [`GRN-${new Date().getFullYear()}-%`]
    );
    const grnNo = data.grnNo || nextGrnNo(lastRow && lastRow.grn_no);

    const reels = data.reels && data.reels.length
      ? data.reels
      : Array.from({ length: data.totalReels || 0 }, (_, i) => ({
          reelNo: `${grnNo}-R${i + 1}`,
          expectedGsm: data.expectedGsm || 0,
          expectedBf: data.expectedBf || 'N/A'
        }));

    const [result] = await conn.query(
      `INSERT INTO material_receipts (grn_no, supplier_po_id, po_number, po_date, supplier_id, supplier_name,
        item_code, item_description, category, delivery_date, due_date, total_reels, inspector, priority,
        delivery_type, status, warehouse, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
      [grnNo, po.id, po.po_number, po.po_date, po.supplier_id, po.supplier_name, po.reference_item_code,
        data.itemDescription || null, po.category, data.deliveryDate || new Date(), data.dueDate || null,
        reels.length, data.inspector || null, data.priority || 'Medium', data.deliveryType || 'New',
        data.warehouse || 'Main Store', createdBy || 'system']
    );
    const receiptId = result.insertId;

    for (const r of reels) {
      await conn.query(
        `INSERT INTO material_receipt_reels (receipt_id, reel_no, expected_gsm, actual_gsm, expected_bf,
          actual_bf, weight, moisture, visual, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [receiptId, r.reelNo, r.expectedGsm || null, null, r.expectedBf || null, null, null, null, 'OK']
      );
    }

    await conn.commit();
    return exports.getDelivery(grnNo);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Covers quickApprove / quickReject / processApproval(Approve|Hold|Reject) from
// the QC Incoming Approval screen — always sends the full reel array back.
exports.decideDelivery = async (grnNo, decision, decidedBy) => {
  const row = await getRowByGrn(grnNo);
  if (!row) throw Boom.notFound('Material receipt not found');
  if (row.status === 'Approved') throw Boom.badRequest('This delivery has already been approved');

  const status = decision.status; // 'Approved' | 'Rejected' | 'Hold'
  if (!['Approved', 'Rejected', 'Hold'].includes(status)) throw Boom.badRequest('Invalid decision status');

  // Two-step gate: Approval is step 2 and requires QC Incoming Inspection
  // (step 1) to have already recorded results for this GRN. Rejecting or
  // putting a delivery on Hold doesn't need that — a visibly damaged or
  // clearly wrong delivery can be turned away without a full inspection.
  if (status === 'Approved') {
    const [inspRows] = await db.query(
      'SELECT id FROM qc_incoming_inspections WHERE grn_no = ? ORDER BY id DESC LIMIT 1',
      [grnNo]
    );
    if (!inspRows.length) {
      throw Boom.badRequest('No QC Incoming Inspection found for this GRN yet — complete the Inspection step before approving it.');
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (decision.reels && decision.reels.length) {
      for (const r of decision.reels) {
        await conn.query(
          `UPDATE material_receipt_reels SET actual_gsm = ?, actual_bf = ?, weight = ?, moisture = ?, visual = ?, status = ?
           WHERE receipt_id = ? AND reel_no = ?`,
          [r.actualGsm ?? null, r.actualBf ?? null, r.weight ?? null, r.moisture ?? null, r.visual || 'OK',
            r.status || 'Pending', row.id, r.reelNo]
        );
      }
    }

    const today = new Date().toISOString().split('T')[0];
    await conn.query(
      `UPDATE material_receipts SET status = ?, approved_on = ?, rejected_on = ?, last_updated_by = ? WHERE id = ?`,
      [status, status === 'Approved' ? today : row.approved_on, status === 'Rejected' ? today : row.rejected_on,
        decidedBy || 'system', row.id]
    );

    await conn.commit();
    return exports.getDelivery(grnNo);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Aggregated ledger for the Raw Material Stock screen: approved receipts,
// grouped by item, form the "received" and "available" columns.
exports.getStockSummary = async () => {
  const [rows] = await db.query(
    `SELECT item_code, item_description, category, warehouse,
            SUM(total_reels) AS reel_count,
            SUM(CASE WHEN status = 'Approved' THEN total_reels ELSE 0 END) AS received,
            SUM(CASE WHEN status = 'Rejected' THEN total_reels ELSE 0 END) AS rejected
     FROM material_receipts
     GROUP BY item_code, item_description, category, warehouse
     ORDER BY item_code`
  );
  return rows.map(r => ({
    materialCode: r.item_code,
    materialName: r.item_description,
    category: r.category,
    warehouse: r.warehouse,
    received: Number(r.received) || 0,
    rejected: Number(r.rejected) || 0,
    available: (Number(r.received) || 0) - (Number(r.rejected) || 0)
  }));
};
