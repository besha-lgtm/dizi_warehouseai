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

async function getFullPoByNumber(poNo) {
  const [rows] = await db.query('SELECT * FROM customer_purchase_orders WHERE po_no = ?', [poNo]);
  if (!rows.length) return null;
  const [lineItems] = await db.query('SELECT * FROM customer_po_line_items WHERE customer_po_id = ?', [rows[0].id]);
  return rowToPO(rows[0], lineItems);
}

function rowToApprovalRequest(row, rawPo) {
  return {
    id: row.po_number,
    type: row.po_type,
    title: row.customer,
    itemLabel: rawPo && rawPo.lineItems.length
      ? `${rawPo.lineItems[0].description} (${rawPo.lineItems[0].itemCode})`
      : 'No items declared',
    requestedBy: row.requested_by,
    requestedOn: row.requested_on,
    priority: row.priority,
    dueDate: row.due_date,
    status: row.approval_status,
    remarks: row.remarks,
    rawPoReference: rawPo
  };
}

exports.getApprovalsQueue = async () => {
  const [rows] = await db.query(
    `SELECT * FROM po_approval_requests WHERE approval_status = 'Pending' ORDER BY due_date ASC, id ASC`
  );
  const results = [];
  for (const row of rows) {
    const rawPo = await getFullPoByNumber(row.po_number);
    results.push(rowToApprovalRequest(row, rawPo));
  }
  return results;
};

exports.getTodayStats = async () => {
  const [[approvedRow], [rejectedRow]] = await Promise.all([
    db.query(`SELECT COUNT(*) as c FROM po_approval_history WHERE action = 'Approved' AND DATE(action_at) = CURDATE()`),
    db.query(`SELECT COUNT(*) as c FROM po_approval_history WHERE action = 'Rejected' AND DATE(action_at) = CURDATE()`)
  ]);
  return { approvedToday: approvedRow[0].c, rejectedToday: rejectedRow[0].c };
};

function mockIrn() {
  let hex = '';
  while (hex.length < 64) hex += Math.random().toString(16).substring(2);
  return hex.substring(0, 64);
}

function mockVehicleNo() {
  const states = ['AP39', 'TS09', 'KA05', 'TN22'];
  const state = states[Math.floor(Math.random() * states.length)];
  const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${state}${letters}${digits}`;
}

// Mirrors the old client-side PoDataService.buildSalesOrder() — persisted for real now.
async function generateSalesOrder(conn, poRow, lineItems, createdBy) {
  const totalQty = lineItems.reduce((acc, li) => acc + (Number(li.ordered_qty) || 0), 0);
  const soNo = `VISI/26-27/${Math.floor(100 + Math.random() * 900)}`;

  const [result] = await conn.query(
    `INSERT INTO sales_orders (so_no, so_date, po_id, po_no, po_date, po_type, customer_id, customer,
      place_of_supply, buyer_gstin, payment_terms, customer_location, quantity, vehicle_no, irn, status, created_by)
     VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated', ?)`,
    [soNo, poRow.id, poRow.po_no, poRow.po_date, poRow.po_type, poRow.customer_id, poRow.customer,
      poRow.buyer_state_name, poRow.buyer_gstin, poRow.payment_terms, poRow.customer_location, totalQty,
      mockVehicleNo(), mockIrn(), createdBy || 'system']
  );
  const soId = result.insertId;

  for (const li of lineItems) {
    await conn.query(
      `INSERT INTO sales_order_line_items (sales_order_id, item_code, description, hsn_code, ordered_qty, uom,
        rate, amount, pms_check_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [soId, li.item_code, li.description, li.hsn_code, li.ordered_qty, 'PCS', li.rate, li.amount, li.pms_ref ? 1 : 0]
    );
  }

  return soNo;
}

async function transitionRequest(poNumber, action, remarks, actionBy) {
  const [requests] = await db.query(
    `SELECT * FROM po_approval_requests WHERE po_number = ? AND approval_status = 'Pending' LIMIT 1`,
    [poNumber]
  );
  if (!requests.length) throw Boom.notFound('Approval request not found or already decided');
  const request = requests[0];

  const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
  const poNewStatus = action === 'approve' ? 'Released' : 'Rejected';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE po_approval_requests SET approval_status = ?, remarks = ?, last_updated_by = ? WHERE id = ?`,
      [newStatus, remarks || null, actionBy || 'system', request.id]
    );

    await conn.query(
      `INSERT INTO po_approval_history (approval_request_id, po_number, action, previous_status, new_status,
        remarks, action_by)
       VALUES (?, ?, ?, 'Pending', ?, ?, ?)`,
      [request.id, poNumber, newStatus, newStatus, remarks || null, actionBy || 'system']
    );

    const [poRows] = await conn.query('SELECT * FROM customer_purchase_orders WHERE id = ?', [request.po_id]);
    const poRow = poRows[0];
    await conn.query('UPDATE customer_purchase_orders SET status = ? WHERE id = ?', [poNewStatus, poRow.id]);

    let salesOrderNo = null;
    if (action === 'approve') {
      const [lineItems] = await conn.query('SELECT * FROM customer_po_line_items WHERE customer_po_id = ?', [poRow.id]);
      salesOrderNo = await generateSalesOrder(conn, poRow, lineItems, actionBy);
    }

    await conn.commit();
    return { poNumber, newStatus, salesOrderNo };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

exports.approveRequest = (poNumber, remarks, actionBy) => transitionRequest(poNumber, 'approve', remarks, actionBy);
exports.rejectRequest = (poNumber, remarks, actionBy) => transitionRequest(poNumber, 'reject', remarks, actionBy);
