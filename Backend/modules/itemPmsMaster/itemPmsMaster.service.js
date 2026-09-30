const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToItem(row, lines = []) {
  return {
    id: row.id,
    itemCode: row.item_code,
    customerName: row.customer_name,
    pmsRef: row.pms_ref,
    version: row.version,
    productType: row.product_type,
    ply: row.ply,
    flute: row.flute,
    variantDesc: row.variant_desc,
    hsnCode: row.hsn_code,
    grade: row.grade,
    type: row.type,
    effectiveDate: row.effective_date,
    bindingType: row.binding_type,
    dimensionRef: row.dimension_ref,
    artworkFileName: row.artwork_file_name,
    status: row.status,
    length: row.length,
    width: row.width,
    height: row.height,
    tolerance: row.tolerance,
    closingFlapGap: row.closing_flap_gap,
    creasingType: row.creasing_type,
    edgeTreatment: row.edge_treatment,
    weight: row.weight,
    joint: row.joint,
    partitions: row.partitions,
    line: row.production_line,
    colour: row.colour,
    printing: row.printing,
    bf: row.bf,
    boardGsm: row.board_gsm,
    grammageMin: row.grammage_min,
    grammageMax: row.grammage_max,
    grammagePerPly: row.grammage_per_ply,
    burstingStrength: row.bursting_strength,
    bctStrength: row.bct_strength,
    rctStrength: row.rct_strength,
    moisture: row.moisture,
    cobbTest: row.cobb_test,
    packingMode: row.packing_mode,
    qtyPerBundle: row.qty_per_bundle,
    molecularFormula: row.molecular_formula,
    molecularWeight: row.molecular_weight,
    testProcedureRef: row.test_procedure_ref,
    storageCondition: row.storage_condition,
    sampleQtyRequired: row.sample_qty_required,
    expiryDate: row.expiry_date,
    remarks: row.remarks,
    createdBy: row.created_by,
    updatedOn: row.last_updated_date,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    approvalRemarks: row.approval_remarks,
    itemLines: lines.map(l => ({
      itemCode: l.item_code,
      productType: l.product_type,
      ply: l.ply,
      length: l.length,
      width: l.width,
      height: l.height,
      tolerance: l.tolerance,
      colour: l.colour,
      bf: l.bf,
      joint: l.joint,
      boardGsm: l.board_gsm
    }))
  };
}

async function resolveCustomerId(conn, customerName) {
  if (!customerName) return null;
  const [rows] = await conn.query('SELECT id FROM customers WHERE company_name = ?', [customerName]);
  return rows.length ? rows[0].id : null;
}

async function writeItemLines(conn, itemPmsId, itemCode, lines) {
  await conn.query('DELETE FROM item_pms_dimensions WHERE item_pms_id = ?', [itemPmsId]);
  for (const l of lines || []) {
    await conn.query(
      `INSERT INTO item_pms_dimensions (item_pms_id, item_code, product_type, ply, length, width, height,
        tolerance, colour, bf, joint, board_gsm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [itemPmsId, l.itemCode || itemCode, l.productType || null, l.ply != null ? String(l.ply) : null,
        l.length ?? null, l.width ?? null, l.height ?? null, l.tolerance || null, l.colour || null,
        l.bf ?? null, l.joint || null, l.boardGsm ?? null]
    );
  }
}

exports.getItems = async () => {
  const [rows] = await db.query('SELECT * FROM item_pms_master ORDER BY last_updated_date DESC, id DESC');
  const results = [];
  for (const row of rows) {
    const [lines] = await db.query('SELECT * FROM item_pms_dimensions WHERE item_pms_id = ? ORDER BY id', [row.id]);
    results.push(rowToItem(row, lines));
  }
  return results;
};

exports.getItem = async (id) => {
  const [rows] = await db.query('SELECT * FROM item_pms_master WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('PMS item not found');
  const [lines] = await db.query('SELECT * FROM item_pms_dimensions WHERE item_pms_id = ? ORDER BY id', [id]);
  return rowToItem(rows[0], lines);
};

exports.createItem = async (data, createdBy) => {
  if (!data.itemCode) throw Boom.badRequest('itemCode is required');
  if (!data.pmsRef) throw Boom.badRequest('pmsRef is required');
  if (!data.itemLines || !data.itemLines.length) throw Boom.badRequest('At least one item line is required');

  // Every new spec starts life as Draft — Approved/Rejected are only reachable
  // through the dedicated approve/reject actions below, never self-declared
  // on create, so the Supplier PO Reels dropdown only ever lists specs that
  // actually went through the approval step.
  data = { ...data, status: 'Draft' };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const customerId = await resolveCustomerId(conn, data.customerName);

    const [result] = await conn.query(
      `INSERT INTO item_pms_master (item_code, customer_id, customer_name, pms_ref, version, product_type, ply,
        flute, variant_desc, hsn_code, grade, type, effective_date, binding_type, dimension_ref, artwork_file_name,
        status, length, width, height, tolerance, closing_flap_gap, creasing_type, edge_treatment, weight, joint,
        partitions, production_line, colour, printing, bf, board_gsm, grammage_min, grammage_max, grammage_per_ply,
        bursting_strength, bct_strength, rct_strength, moisture, cobb_test, packing_mode, qty_per_bundle,
        molecular_formula, molecular_weight, test_procedure_ref, storage_condition, sample_qty_required,
        expiry_date, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.itemCode, customerId, data.customerName || null, data.pmsRef, data.version || 'VER 1.0',
        data.productType || null, data.ply || 0, data.flute || null, data.variantDesc || null, data.hsnCode || null,
        data.grade || null, data.type || null, data.effectiveDate || null, data.bindingType || null,
        data.dimensionRef || null, data.artworkFileName || null, data.status || 'Draft', data.length ?? null,
        data.width ?? null, data.height ?? null, data.tolerance || null, data.closingFlapGap ?? null,
        data.creasingType || null, data.edgeTreatment || null, data.weight || null, data.joint || null,
        data.partitions || null, data.line || null, data.colour || null, data.printing || null, data.bf ?? null,
        data.boardGsm ?? null, data.grammageMin ?? null, data.grammageMax ?? null, data.grammagePerPly ?? null,
        data.burstingStrength ?? null, data.bctStrength ?? null, data.rctStrength ?? null, data.moisture ?? null,
        data.cobbTest ?? null, data.packingMode || null, data.qtyPerBundle ?? null, data.molecularFormula || null,
        data.molecularWeight || null, data.testProcedureRef || null, data.storageCondition || null,
        data.sampleQtyRequired || null, data.expiryDate || null, data.remarks || null, createdBy || 'system']
    );
    const itemPmsId = result.insertId;
    await writeItemLines(conn, itemPmsId, data.itemCode, data.itemLines);

    await conn.commit();
    return exports.getItem(itemPmsId);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('This PMS Ref already exists');
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateItem = async (id, data, updatedBy) => {
  const [rows] = await db.query('SELECT * FROM item_pms_master WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('PMS item not found');
  const existing = rows[0];

  // Approved/Rejected is only reachable through the dedicated approve/reject
  // actions (see below) — block it from sneaking in through a regular edit.
  if (data.status && data.status !== existing.status && ['Approved', 'Rejected'].includes(data.status)) {
    throw Boom.badRequest(`Use the Approve/Reject action to move a spec to "${data.status}"`);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let customerId = existing.customer_id;
    if (data.customerName && data.customerName !== existing.customer_name) {
      customerId = await resolveCustomerId(conn, data.customerName);
    }

    await conn.query(
      `UPDATE item_pms_master SET item_code=?, customer_id=?, customer_name=?, version=?, product_type=?, ply=?, flute=?,
        variant_desc=?, hsn_code=?, grade=?, type=?, effective_date=?, binding_type=?, dimension_ref=?,
        artwork_file_name=?, status=?, length=?, width=?, height=?, tolerance=?, closing_flap_gap=?,
        creasing_type=?, edge_treatment=?, weight=?, joint=?, partitions=?, production_line=?, colour=?,
        printing=?, bf=?, board_gsm=?, grammage_min=?, grammage_max=?, grammage_per_ply=?, bursting_strength=?,
        bct_strength=?, rct_strength=?, moisture=?, cobb_test=?, packing_mode=?, qty_per_bundle=?,
        molecular_formula=?, molecular_weight=?, test_procedure_ref=?, storage_condition=?, sample_qty_required=?,
        expiry_date=?, remarks=?, last_updated_by=?
       WHERE id=?`,
      [data.itemCode ?? existing.item_code, customerId, data.customerName ?? existing.customer_name, data.version || existing.version,
        data.productType ?? existing.product_type, data.ply ?? existing.ply, data.flute ?? existing.flute,
        data.variantDesc ?? existing.variant_desc, data.hsnCode ?? existing.hsn_code, data.grade ?? existing.grade,
        data.type ?? existing.type, data.effectiveDate ?? existing.effective_date,
        data.bindingType ?? existing.binding_type, data.dimensionRef ?? existing.dimension_ref,
        data.artworkFileName ?? existing.artwork_file_name, data.status || existing.status,
        data.length ?? existing.length, data.width ?? existing.width, data.height ?? existing.height,
        data.tolerance ?? existing.tolerance, data.closingFlapGap ?? existing.closing_flap_gap,
        data.creasingType ?? existing.creasing_type, data.edgeTreatment ?? existing.edge_treatment,
        data.weight ?? existing.weight, data.joint ?? existing.joint, data.partitions ?? existing.partitions,
        data.line ?? existing.production_line, data.colour ?? existing.colour, data.printing ?? existing.printing,
        data.bf ?? existing.bf, data.boardGsm ?? existing.board_gsm, data.grammageMin ?? existing.grammage_min,
        data.grammageMax ?? existing.grammage_max, data.grammagePerPly ?? existing.grammage_per_ply,
        data.burstingStrength ?? existing.bursting_strength, data.bctStrength ?? existing.bct_strength,
        data.rctStrength ?? existing.rct_strength, data.moisture ?? existing.moisture,
        data.cobbTest ?? existing.cobb_test, data.packingMode ?? existing.packing_mode,
        data.qtyPerBundle ?? existing.qty_per_bundle, data.molecularFormula ?? existing.molecular_formula,
        data.molecularWeight ?? existing.molecular_weight, data.testProcedureRef ?? existing.test_procedure_ref,
        data.storageCondition ?? existing.storage_condition, data.sampleQtyRequired ?? existing.sample_qty_required,
        data.expiryDate ?? existing.expiry_date, data.remarks ?? existing.remarks, updatedBy || 'system', id]
    );

    if (data.itemLines) {
      await writeItemLines(conn, id, data.itemCode || existing.item_code, data.itemLines);
    }

    await conn.commit();
    return exports.getItem(id);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('This item code is already in use by another spec');
    throw err;
  } finally {
    conn.release();
  }
};

exports.deleteItem = async (id) => {
  const [rows] = await db.query('SELECT id FROM item_pms_master WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('PMS item not found');
  await db.query('DELETE FROM item_pms_master WHERE id = ?', [id]);
};

// Product Specification Approve/Reject — the workflow step between Draft and
// a spec being usable elsewhere (e.g. selectable in Supplier PO Creation's
// Reels reference dropdown, see getReferenceOptions below). Only specs
// currently in Draft can move through this; re-review after a Rejection also
// goes through here once the spec is back in Draft.
async function transitionApproval(id, action, remarks, actionBy) {
  const [rows] = await db.query('SELECT * FROM item_pms_master WHERE id = ?', [id]);
  if (!rows.length) throw Boom.notFound('PMS item not found');
  const existing = rows[0];

  if (existing.status !== 'Draft') {
    throw Boom.badRequest(`Only a Draft spec can be ${action === 'approve' ? 'approved' : 'rejected'} (current status: ${existing.status})`);
  }

  const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
  await db.query(
    `UPDATE item_pms_master SET status = ?, approved_by = ?, approved_at = NOW(), approval_remarks = ?,
      last_updated_by = ? WHERE id = ?`,
    [newStatus, actionBy || 'system', remarks || null, actionBy || 'system', id]
  );
  return exports.getItem(id);
}

exports.approveItem = (id, remarks, actionBy) => transitionApproval(id, 'approve', remarks, actionBy);
exports.rejectItem = (id, remarks, actionBy) => transitionApproval(id, 'reject', remarks, actionBy);

// Feeds the "Reels" reference-item dropdown on Supplier PO Creation — the
// finished-good spec a raw material reel is being purchased against.
exports.getReferenceOptions = async () => {
  const [rows] = await db.query(
    `SELECT item_code, variant_desc, ply, flute, board_gsm, bf, length
     FROM item_pms_master WHERE status IN ('Active', 'Approved') ORDER BY item_code`
  );
  return rows.map(r => ({
    label: `${r.item_code} | ${r.variant_desc || r.ply + ' Ply'}`,
    value: r.item_code,
    description: r.variant_desc || '',
    specification: `GSM ${r.board_gsm || '-'} | BF ${r.bf || '-'} | Size ${r.length || '-'} mm`
  }));
};
