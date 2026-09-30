const db = require('../../config/db');
const Boom = require('@hapi/boom');

function rowToSalesOrder(row, lineItems = []) {
  return {
    soNo: row.so_no,
    soDate: row.so_date,
    poNo: row.po_no,
    poDate: row.po_date,
    poType: row.po_type,
    customer: row.customer,
    placeOfSupply: row.place_of_supply,
    buyerGstin: row.buyer_gstin,
    paymentTerms: row.payment_terms,
    customerLocation: row.customer_location,
    quantity: row.quantity,
    vehicleNo: row.vehicle_no,
    irn: row.irn,
    status: row.status,
    lineItems: lineItems.map(li => ({
      itemCode: li.item_code,
      description: li.description,
      hsnCode: li.hsn_code,
      orderedQty: li.ordered_qty,
      uom: li.uom,
      rate: li.rate,
      amount: li.amount,
      pmsCheckRequired: !!li.pms_check_required
    }))
  };
}

exports.getSalesOrders = async () => {
  const [rows] = await db.query('SELECT * FROM sales_orders ORDER BY so_date DESC, id DESC');
  const results = [];
  for (const row of rows) {
    const [lineItems] = await db.query('SELECT * FROM sales_order_line_items WHERE sales_order_id = ?', [row.id]);
    results.push(rowToSalesOrder(row, lineItems));
  }
  return results;
};

exports.getSalesOrder = async (soNo) => {
  const [rows] = await db.query('SELECT * FROM sales_orders WHERE so_no = ? LIMIT 1', [soNo]);
  if (!rows.length) throw Boom.notFound('Sales order not found');
  const [lineItems] = await db.query('SELECT * FROM sales_order_line_items WHERE sales_order_id = ?', [rows[0].id]);
  return rowToSalesOrder(rows[0], lineItems);
};
