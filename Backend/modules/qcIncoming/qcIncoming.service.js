const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToInspection(row, params = []) {
  return {
    id: row.id,
    inspectionNo: row.inspection_no,
    grnNo: row.grn_no,
    poNumber: row.po_number,
    supplierName: row.supplier_name,
    itemCode: row.item_code,
    itemDescription: row.item_description,
    challanNo: row.challan_no,
    lotNo: row.lot_no,
    dateOfReceipt: row.date_of_receipt,
    qtyReceived: row.qty_received,
    uom: row.uom,
    inspectorName: row.inspector_name,
    inspectionDate: row.inspection_date,
    status: row.status,
    qtyAccepted: row.qty_accepted,
    qtyRejected: row.qty_rejected,
    finalDecision: row.final_decision,
    qcApprovedBy: row.qc_approved_by,
    qcRemarks: row.qc_remarks,
    qcParameters: params.map((p, idx) => ({
      id: `P${idx + 1}`,
      parameter: p.parameter,
      uom: p.uom,
      specMin: p.spec_min,
      specMax: p.spec_max,
      observedValue: p.observed_value,
      result: p.result
    }))
  };
}

async function getRowByInspectionNo(inspectionNo) {
  const [rows] = await db.query('SELECT * FROM qc_incoming_inspections WHERE inspection_no = ? LIMIT 1', [inspectionNo]);
  return rows[0];
}

exports.getInspections = async () => {
  const [rows] = await db.query('SELECT * FROM qc_incoming_inspections ORDER BY inspection_date DESC, id DESC');
  const results = [];
  for (const row of rows) {
    const [params] = await db.query('SELECT * FROM qc_incoming_inspection_parameters WHERE inspection_id = ? ORDER BY id', [row.id]);
    results.push(rowToInspection(row, params));
  }
  return results;
};

exports.getInspection = async (inspectionNo) => {
  const row = await getRowByInspectionNo(inspectionNo);
  if (!row) throw Boom.notFound('Inspection not found');
  const [params] = await db.query('SELECT * FROM qc_incoming_inspection_parameters WHERE inspection_id = ? ORDER BY id', [row.id]);
  return rowToInspection(row, params);
};

function nextInspectionNo(lastNo) {
  const year = new Date().getFullYear();
  const match = /QC-INC-(\d{4})-(\d+)/.exec(lastNo || '');
  const seq = match && Number(match[1]) === year ? Number(match[2]) + 1 : 1;
  return `QC-INC-${year}-${String(seq).padStart(4, '0')}`;
}

async function saveParameters(conn, inspectionId, params) {
  await conn.query('DELETE FROM qc_incoming_inspection_parameters WHERE inspection_id = ?', [inspectionId]);
  if (!params || !params.length) return;
  for (const p of params) {
    await conn.query(
      `INSERT INTO qc_incoming_inspection_parameters (inspection_id, parameter, uom, spec_min, spec_max, observed_value, result)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inspectionId, p.parameter, p.uom || null, p.specMin ?? null, p.specMax ?? null, p.observedValue ?? null, p.result || null]
    );
  }
}

// Inspection is step 1 of the two-step Incoming QC flow (Inspection ->
// Approval): it must reference a real Material Receipt (GRN) — the goods
// physically on hand — rather than just a PO, and pulls its supplier/item/qty
// straight from that GRN so nothing has to be re-typed. QC Incoming Approval
// (materialReceipt.decideDelivery) then requires this record to exist before
// it will let a delivery move to 'Approved'.
exports.createInspection = async (data, createdBy) => {
  if (!data.grnNo) throw Boom.badRequest('grnNo is required — select the Material Receipt (GRN) being inspected');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [grnRows] = await conn.query('SELECT * FROM material_receipts WHERE grn_no = ?', [data.grnNo]);
    const grn = grnRows[0];
    if (!grn) throw Boom.badRequest(`Material Receipt "${data.grnNo}" not found`);

    const [[lastRow]] = await conn.query(
      `SELECT inspection_no FROM qc_incoming_inspections WHERE inspection_no LIKE ? ORDER BY id DESC LIMIT 1`,
      [`QC-INC-${new Date().getFullYear()}-%`]
    );
    const inspectionNo = data.inspectionNo || nextInspectionNo(lastRow && lastRow.inspection_no);

    const [result] = await conn.query(
      `INSERT INTO qc_incoming_inspections (inspection_no, grn_no, supplier_po_id, po_number, supplier_name, item_code,
        item_description, challan_no, lot_no, date_of_receipt, qty_received, uom, inspector_name, inspection_date,
        status, qty_accepted, qty_rejected, final_decision, qc_approved_by, qc_remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inspectionNo, data.grnNo, grn.supplier_po_id, grn.po_number, data.supplierName || grn.supplier_name,
        data.itemCode || grn.item_code, data.itemDescription || grn.item_description, data.challanNo || null,
        data.lotNo || null, data.dateOfReceipt || grn.delivery_date, data.qtyReceived || grn.total_reels || 0,
        data.uom || null, data.inspectorName || grn.inspector || null, data.inspectionDate || new Date(),
        data.status || 'Pending', data.qtyAccepted || 0, data.qtyRejected || 0, data.finalDecision || null,
        data.qcApprovedBy || null, data.qcRemarks || null, createdBy || 'system']
    );
    const inspectionId = result.insertId;
    await saveParameters(conn, inspectionId, data.qcParameters);

    await conn.commit();
    return exports.getInspection(inspectionNo);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.deleteInspection = async (inspectionNo) => {
  const row = await getRowByInspectionNo(inspectionNo);
  if (!row) throw Boom.notFound('Inspection not found');
  await db.query('DELETE FROM qc_incoming_inspections WHERE id = ?', [row.id]);
};

exports.updateInspection = async (inspectionNo, data, updatedBy) => {
  const row = await getRowByInspectionNo(inspectionNo);
  if (!row) throw Boom.notFound('Inspection not found');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE qc_incoming_inspections SET supplier_name = ?, item_code = ?, item_description = ?, challan_no = ?,
        lot_no = ?, date_of_receipt = ?, qty_received = ?, uom = ?, inspector_name = ?, inspection_date = ?,
        status = ?, qty_accepted = ?, qty_rejected = ?, final_decision = ?, qc_approved_by = ?, qc_remarks = ?,
        last_updated_by = ?
       WHERE id = ?`,
      [data.supplierName ?? row.supplier_name, data.itemCode ?? row.item_code, data.itemDescription ?? row.item_description,
        data.challanNo ?? row.challan_no, data.lotNo ?? row.lot_no, data.dateOfReceipt ?? row.date_of_receipt,
        data.qtyReceived ?? row.qty_received, data.uom ?? row.uom, data.inspectorName ?? row.inspector_name,
        data.inspectionDate ?? row.inspection_date, data.status || row.status, data.qtyAccepted ?? row.qty_accepted,
        data.qtyRejected ?? row.qty_rejected, data.finalDecision ?? row.final_decision,
        data.qcApprovedBy ?? row.qc_approved_by, data.qcRemarks ?? row.qc_remarks, updatedBy || 'system', row.id]
    );

    if (data.qcParameters) {
      await saveParameters(conn, row.id, data.qcParameters);
    }

    await conn.commit();
    return exports.getInspection(inspectionNo);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
