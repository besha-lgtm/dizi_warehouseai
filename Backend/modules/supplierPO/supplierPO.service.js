const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToPO(row, lineItems = []) {
  return {
    id: row.id,
    poNumber: row.po_number,
    poDate: row.po_date,
    supplierName: row.supplier_name,
    supplierCode: row.supplier_code,
    referenceItemCode: row.reference_item_code,
    referencePmsRef: row.reference_pms_ref,
    plantLocation: row.plant_location,
    paymentTerms: row.payment_terms,
    currency: row.currency,
    deliveryDate: row.delivery_date,
    status: row.status,
    category: row.category,
    remarks: row.remarks,
    createdBy: row.created_by,
    updatedOn: row.last_updated_date,
    lineItems: lineItems.map(li => {
      let attrs = {};
      if (li.spec_attributes) {
        try { attrs = JSON.parse(li.spec_attributes); } catch (e) { attrs = {}; }
      }
      return {
        id: li.line_no,
        itemCode: li.item_code,
        itemDescription: li.item_description,
        specification: li.specification,
        uom: li.uom,
        orderedQty: li.ordered_qty,
        requiredByDate: li.required_by_date,
        ...attrs
      };
    })
  };
}

async function resolveSupplierId(conn, supplierName) {
  const [rows] = await conn.query('SELECT id, supplier_code FROM suppliers WHERE supplier_name = ?', [supplierName]);
  if (!rows.length) throw Boom.badRequest(`No supplier found named "${supplierName}" — add them in Supplier Master first`);
  return rows[0];
}

// Line items carry a mix of fixed columns plus category-specific attributes
// (gsm/size/bf for Reels, viscosity/moisture/solidContent for Starch, etc.) —
// the fixed columns are pulled out, everything else rides along as JSON.
const FIXED_LINE_FIELDS = new Set(['id', 'itemCode', 'itemDescription', 'specification', 'uom', 'orderedQty', 'requiredByDate']);

async function saveLineItems(conn, poId, lineItems) {
  await conn.query('DELETE FROM supplier_po_line_items WHERE supplier_po_id = ?', [poId]);
  if (!lineItems || !lineItems.length) return;

  for (const li of lineItems) {
    const extra = {};
    for (const key of Object.keys(li)) {
      if (!FIXED_LINE_FIELDS.has(key)) extra[key] = li[key];
    }
    await conn.query(
      `INSERT INTO supplier_po_line_items (supplier_po_id, line_no, item_code, item_description, specification,
        uom, ordered_qty, required_by_date, spec_attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [poId, li.id || null, li.itemCode, li.itemDescription, li.specification, li.uom,
        li.orderedQty || 0, li.requiredByDate || null, JSON.stringify(extra)]
    );
  }
}

async function getRowByPoNumber(poNumber) {
  const [rows] = await db.query('SELECT * FROM supplier_purchase_orders WHERE po_number = ? LIMIT 1', [poNumber]);
  return rows[0];
}

exports.getPurchaseOrders = async () => {
  const [rows] = await db.query('SELECT * FROM supplier_purchase_orders ORDER BY po_date DESC, id DESC');
  const results = [];
  for (const row of rows) {
    const [lineItems] = await db.query('SELECT * FROM supplier_po_line_items WHERE supplier_po_id = ? ORDER BY id', [row.id]);
    results.push(rowToPO(row, lineItems));
  }
  return results;
};

exports.getPurchaseOrder = async (poNumber) => {
  const row = await getRowByPoNumber(poNumber);
  if (!row) throw Boom.notFound('Supplier purchase order not found');
  const [lineItems] = await db.query('SELECT * FROM supplier_po_line_items WHERE supplier_po_id = ? ORDER BY id', [row.id]);
  return rowToPO(row, lineItems);
};

function nextPoNumber(lastNumber) {
  const year = new Date().getFullYear();
  const match = /SPO-(\d{4})-(\d+)/.exec(lastNumber || '');
  const seq = match && Number(match[1]) === year ? Number(match[2]) + 1 : 1;
  return `SPO-${year}-${String(seq).padStart(4, '0')}`;
}

exports.createPurchaseOrder = async (data, createdBy) => {
  if (!data.supplierName) throw Boom.badRequest('supplierName is required');
  if (!data.lineItems || !data.lineItems.length) throw Boom.badRequest('At least one line item is required');
  // Every GRN raised against this PO copies this code onto the Raw Material
  // Stock ledger (see materialReceipt.service.createReceipt), so a PO can't
  // be saved without one — otherwise the resulting stock row has no
  // material identity (blank code/name on the Raw Material Stock screen).
  if (!data.referenceItemCode) throw Boom.badRequest('referenceItemCode is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const supplier = await resolveSupplierId(conn, data.supplierName);

    let poNumber = data.poNumber;
    if (!poNumber) {
      const [[lastRow]] = await conn.query(
        `SELECT po_number FROM supplier_purchase_orders WHERE po_number LIKE ? ORDER BY id DESC LIMIT 1`,
        [`SPO-${new Date().getFullYear()}-%`]
      );
      poNumber = nextPoNumber(lastRow && lastRow.po_number);
    }

    const [result] = await conn.query(
      `INSERT INTO supplier_purchase_orders (po_number, po_date, supplier_id, supplier_name, supplier_code,
        reference_item_code, reference_pms_ref, plant_location, payment_terms, currency, delivery_date,
        status, category, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [poNumber, data.poDate || new Date(), supplier.id, data.supplierName, supplier.supplier_code,
        data.referenceItemCode || null, data.referencePmsRef || null, data.plantLocation || null,
        data.paymentTerms || null, data.currency || 'INR', data.deliveryDate || null,
        data.status || 'Draft', data.category || null, data.remarks || null, createdBy || 'system']
    );
    const poId = result.insertId;
    await saveLineItems(conn, poId, data.lineItems);

    await conn.commit();
    return exports.getPurchaseOrder(poNumber);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

exports.updatePurchaseOrder = async (poNumber, data) => {
  const row = await getRowByPoNumber(poNumber);
  if (!row) throw Boom.notFound('Supplier purchase order not found');

  if (data.referenceItemCode !== undefined && !data.referenceItemCode) {
    throw Boom.badRequest('referenceItemCode is required and cannot be cleared');
  }

  // Once a GRN has been raised against this PO, its item_code is already
  // copied onto that GRN's material_receipts row (and from there onto Raw
  // Material Stock). Letting the reference code change afterwards silently
  // makes later GRNs for the *same* PO land under a *different* material
  // code, splitting one item's stock across two rows. Lock it once in use.
  if (
    data.referenceItemCode !== undefined &&
    data.referenceItemCode !== row.reference_item_code
  ) {
    const conn0 = await db.getConnection();
    try {
      const [[{ cnt }]] = await conn0.query(
        `SELECT COUNT(*) AS cnt FROM material_receipts WHERE supplier_po_id = ?`,
        [row.id]
      );
      if (cnt > 0) {
        throw Boom.badRequest(
          `Reference Item Code can't be changed — ${cnt} GRN(s) have already been raised against this PO using "${row.reference_item_code}". Create a new PO instead.`
        );
      }
    } finally {
      conn0.release();
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let supplierId = row.supplier_id;
    let supplierCode = row.supplier_code;
    if (data.supplierName && data.supplierName !== row.supplier_name) {
      const supplier = await resolveSupplierId(conn, data.supplierName);
      supplierId = supplier.id;
      supplierCode = supplier.supplier_code;
    }

    await conn.query(
      `UPDATE supplier_purchase_orders SET po_date = ?, supplier_id = ?, supplier_name = ?, supplier_code = ?,
        reference_item_code = ?, reference_pms_ref = ?, plant_location = ?, payment_terms = ?, currency = ?,
        delivery_date = ?, status = ?, category = ?, remarks = ?, last_updated_by = ?
       WHERE id = ?`,
      [data.poDate || row.po_date, supplierId, data.supplierName || row.supplier_name, supplierCode,
        data.referenceItemCode ?? row.reference_item_code, data.referencePmsRef ?? row.reference_pms_ref,
        data.plantLocation ?? row.plant_location, data.paymentTerms ?? row.payment_terms,
        data.currency || row.currency, data.deliveryDate ?? row.delivery_date, data.status || row.status,
        data.category ?? row.category, data.remarks ?? row.remarks, data.updatedBy || 'system', row.id]
    );

    if (data.lineItems) {
      await saveLineItems(conn, row.id, data.lineItems);
    }

    await conn.commit();
    return exports.getPurchaseOrder(poNumber);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};



exports.deletePurchaseOrder = async (poNumber) => {
  const row = await getRowByPoNumber(poNumber);
  if (!row) throw Boom.notFound('Supplier purchase order not found');
  await db.query('DELETE FROM supplier_purchase_orders WHERE id = ?', [row.id]);
};

// Feeds the raw-material item dropdown on the Supplier PO line-item form for
// the Starch / Glue / Color tabs (the generic items table, filtered by
// item_type). The "Reels" tab uses item_pms_master instead — see
// itemPmsMaster.getReferenceOptions — since those are finished-good specs,
// not raw materials.
exports.getRawMaterialOptions = async (category) => {
  if (!category) return [];
  const [rows] = await db.query(
    `SELECT item_code, item_name, description FROM items WHERE item_type = ? AND status = 'Active' ORDER BY item_code`,
    [category]
  );
  return rows.map(r => ({
    label: `${r.item_code} | ${r.item_name}`,
    value: r.item_code,
    description: r.item_name,
    specification: r.description || ''
  }));
};