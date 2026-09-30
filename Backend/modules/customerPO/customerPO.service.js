const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToPO(row, lineItems = []) {
  return {
    poNo: row.po_no,
    poDate: row.po_date,
    customer: row.customer,
    poType: row.po_type,
    suppliersRef: row.suppliers_ref,
    deliveryTerms: row.delivery_terms,
    paymentTerms: row.payment_terms,
    buyerGstin: row.buyer_gstin,
    buyerPan: row.buyer_pan,
    buyerIec: row.buyer_iec,
    tdsClause: row.tds_clause,
    buyerCommissionerate: row.buyer_commissionerate,
    buyerDivision: row.buyer_division,
    buyerRange: row.buyer_range,
    buyerStateCode: row.buyer_state_code,
    buyerStateName: row.buyer_state_name,
    customerLocation: row.customer_location,
    instructions: row.instructions,
    quantity: row.quantity,
    status: row.status,
    lineItems: lineItems.map(li => ({
      itemCode: li.item_code,
      description: li.description,
      pmsRef: li.pms_ref,
      make: li.make,
      hsnCode: li.hsn_code,
      deliveryDate: li.delivery_date,
      orderedQty: li.ordered_qty,
      rate: li.rate,
      igstPercent: li.igst_percent,
      amount: li.amount
    }))
  };
}

async function resolveCustomerId(conn, customerName) {
  const [rows] = await conn.query('SELECT id FROM customers WHERE company_name = ?', [customerName]);
  if (!rows.length) throw Boom.badRequest(`No customer found named "${customerName}" — add them in Customer Master first`);
  return rows[0].id;
}

// Line items only ever carry a free-text item code (no item picker yet) — resolve-or-create,
// same bridge pattern used for Layer Specs.
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

async function saveLineItems(conn, poId, lineItems) {
  await conn.query('DELETE FROM customer_po_line_items WHERE customer_po_id = ?', [poId]);
  if (!lineItems || !lineItems.length) return;

  for (const li of lineItems) {
    const itemId = await resolveItemId(conn, li.itemCode);
    await conn.query(
      `INSERT INTO customer_po_line_items (customer_po_id, item_id, item_code, description, pms_ref, make,
        hsn_code, delivery_date, ordered_qty, rate, igst_percent, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [poId, itemId, li.itemCode, li.description, li.pmsRef, li.make, li.hsnCode, li.deliveryDate,
        li.orderedQty, li.rate || 0, li.igstPercent || 0, li.amount || 0]
    );
  }
}

async function getRowByBusinessId(poNo) {
  const [rows] = await db.query('SELECT * FROM customer_purchase_orders WHERE po_no = ? LIMIT 1', [poNo]);
  return rows[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Mirrors the old client-side PoDataService.addPurchaseOrder() — any PO saved as
// Pending automatically gets an approval request so it shows up in the queue.
async function createApprovalRequestIfPending(conn, poRow, lineItems, requestedBy) {
  if (poRow.status !== 'Pending') return;

  const totalQty = lineItems.reduce((acc, li) => acc + (Number(li.orderedQty) || 0), 0);
  const priority = totalQty > 2000 ? 'High' : totalQty < 200 ? 'Low' : 'Medium';

  await conn.query(
    `INSERT INTO po_approval_requests (po_number, po_id, po_type, customer, suppliers_ref, requested_by,
      requested_on, priority, due_date, approval_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
    [poRow.po_no, poRow.id, poRow.po_type || 'Standard', poRow.customer, poRow.suppliers_ref,
      requestedBy || 'system', poRow.po_date, priority, addDays(poRow.po_date, 3), requestedBy || 'system']
  );
}

exports.getPurchaseOrders = async () => {
  const [rows] = await db.query('SELECT * FROM customer_purchase_orders ORDER BY po_date DESC, id DESC');
  const results = [];
  for (const row of rows) {
    const [lineItems] = await db.query('SELECT * FROM customer_po_line_items WHERE customer_po_id = ?', [row.id]);
    results.push(rowToPO(row, lineItems));
  }
  return results;
};

exports.getPurchaseOrder = async (poNo) => {
  const row = await getRowByBusinessId(poNo);
  if (!row) throw Boom.notFound('Purchase order not found');
  const [lineItems] = await db.query('SELECT * FROM customer_po_line_items WHERE customer_po_id = ?', [row.id]);
  return rowToPO(row, lineItems);
};

exports.createPurchaseOrder = async (data, requestedBy) => {
  if (!data.poNo) throw Boom.badRequest('poNo is required');
  if (!data.poDate) throw Boom.badRequest('poDate is required');
  if (!data.customer) throw Boom.badRequest('customer is required');
  if (!data.lineItems || !data.lineItems.length) throw Boom.badRequest('At least one line item is required');

  const totalQty = data.lineItems.reduce((acc, li) => acc + (Number(li.orderedQty) || 0), 0);

  const conn = await db.getConnection();
  let poId;
  try {
    await conn.beginTransaction();
    const customerId = await resolveCustomerId(conn, data.customer);

    const [result] = await conn.query(
      `INSERT INTO customer_purchase_orders (po_no, po_date, customer_id, customer, po_type, suppliers_ref,
        delivery_terms, payment_terms, buyer_gstin, buyer_pan, buyer_iec, tds_clause, buyer_commissionerate,
        buyer_division, buyer_range, buyer_state_code, buyer_state_name, customer_location, instructions,
        quantity, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.poNo, data.poDate, customerId, data.customer, data.poType, data.suppliersRef, data.deliveryTerms,
        data.paymentTerms, data.buyerGstin, data.buyerPan, data.buyerIec, data.tdsClause,
        data.buyerCommissionerate, data.buyerDivision, data.buyerRange, data.buyerStateCode,
        data.buyerStateName, data.customerLocation, data.instructions, totalQty,
        data.status || 'Pending', requestedBy || 'system']
    );
    poId = result.insertId;

    await saveLineItems(conn, poId, data.lineItems);

    const [poRow] = await conn.query('SELECT * FROM customer_purchase_orders WHERE id = ?', [poId]);
    await createApprovalRequestIfPending(conn, poRow[0], data.lineItems, requestedBy);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A purchase order with this PO number already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getPurchaseOrder(data.poNo);
};

exports.updatePurchaseOrder = async (poNo, data) => {
  const existing = await getRowByBusinessId(poNo);
  if (!existing) throw Boom.notFound('Purchase order not found');
  if (!data.customer) throw Boom.badRequest('customer is required');
  if (!data.lineItems || !data.lineItems.length) throw Boom.badRequest('At least one line item is required');

  const totalQty = data.lineItems.reduce((acc, li) => acc + (Number(li.orderedQty) || 0), 0);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const customerId = await resolveCustomerId(conn, data.customer);

    await conn.query(
      `UPDATE customer_purchase_orders SET po_date=?, customer_id=?, customer=?, po_type=?, suppliers_ref=?,
        delivery_terms=?, payment_terms=?, buyer_gstin=?, buyer_pan=?, buyer_iec=?, tds_clause=?,
        buyer_commissionerate=?, buyer_division=?, buyer_range=?, buyer_state_code=?, buyer_state_name=?,
        customer_location=?, instructions=?, quantity=?, status=?
       WHERE id = ?`,
      [data.poDate, customerId, data.customer, data.poType, data.suppliersRef, data.deliveryTerms,
        data.paymentTerms, data.buyerGstin, data.buyerPan, data.buyerIec, data.tdsClause,
        data.buyerCommissionerate, data.buyerDivision, data.buyerRange, data.buyerStateCode,
        data.buyerStateName, data.customerLocation, data.instructions, totalQty, data.status, existing.id]
    );

    await saveLineItems(conn, existing.id, data.lineItems);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return exports.getPurchaseOrder(poNo);
};

exports.deletePurchaseOrder = async (poNo) => {
  const existing = await getRowByBusinessId(poNo);
  if (!existing) throw Boom.notFound('Purchase order not found');
  await db.query('DELETE FROM customer_purchase_orders WHERE id = ?', [existing.id]);
};
