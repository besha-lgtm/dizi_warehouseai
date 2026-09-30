const db = require('../../config/db');
const Boom = require('@hapi/boom');

const AVATAR_COLORS = ['#2e90fa', '#7a5af8', '#12b76a', '#f79009', '#f04438', '#0794ad', '#ee46bc', '#16b364'];
function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function rowToCustomer(row, contacts = []) {
  return {
    customerId: row.customer_id,
    companyName: row.company_name,
    unitName: row.unit_name,
    gstin: row.gstin,
    pan: row.pan,
    iec: row.iec,
    address: row.address,
    city: row.city,
    state: row.state,
    stateCode: row.state_code,
    pinCode: row.pincode,
    phone: row.phone,
    email: row.email,
    contactPerson: row.contact_person,
    contactPersonDesignation: row.contact_person_designation,
    altPhone: row.alt_phone,
    billTo: row.bill_to,
    shipTo: row.ship_to,
    status: row.status,
    avatarColor: row.avatar_color,
    additionalContacts: contacts.map(c => ({
      name: c.contact_name, designation: c.designation, phone: c.phone, email: c.email
    }))
  };
}

// customer_contacts.customer_id is the surrogate BIGINT FK to customers.id (not the business code).
async function attachContacts(rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [contacts] = await db.query('SELECT * FROM customer_contacts WHERE customer_id IN (?)', [ids]);
  return rows.map(row => rowToCustomer(row, contacts.filter(c => c.customer_id === row.id)));
}

async function saveContacts(conn, customerPk, contacts) {
  await conn.query('DELETE FROM customer_contacts WHERE customer_id = ?', [customerPk]);
  if (contacts && contacts.length) {
    const values = contacts
      .filter(c => c.name) // contact_name is NOT NULL in the real schema
      .map(c => [customerPk, c.name, c.designation, c.phone, c.email]);
    if (values.length) {
      await conn.query(
        'INSERT INTO customer_contacts (customer_id, contact_name, designation, phone, email) VALUES ?',
        [values]
      );
    }
  }
}

async function nextCustomerId() {
  const [rows] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(customer_id, 2) AS UNSIGNED)) AS maxId FROM customers`
  );
  const next = (rows[0].maxId || 0) + 1;
  return 'C' + String(next).padStart(3, '0');
}

exports.getCustomers = async () => {
  const [rows] = await db.query('SELECT * FROM customers ORDER BY customer_id');
  return attachContacts(rows);
};

async function getRowByBusinessId(customerId) {
  const [rows] = await db.query('SELECT * FROM customers WHERE customer_id = ? LIMIT 1', [customerId]);
  return rows[0];
}

exports.getCustomerById = async (customerId) => {
  const row = await getRowByBusinessId(customerId);
  if (!row) throw Boom.notFound('Customer not found');
  const [contacts] = await db.query('SELECT * FROM customer_contacts WHERE customer_id = ?', [row.id]);
  return rowToCustomer(row, contacts);
};

exports.getActiveCustomers = async () => {
  const [rows] = await db.query(
    `SELECT customer_id, company_name, gstin, pan, iec, city, state, state_code, pincode, address
     FROM customers WHERE status = 'Active' ORDER BY company_name ASC`
  );
  return rows.map(r => ({
    customerId: r.customer_id,
    companyName: r.company_name,
    gstin: r.gstin,
    pan: r.pan,
    iec: r.iec,
    city: r.city,
    state: r.state,
    stateCode: r.state_code,
    pincode: r.pincode,
    address: r.address
  }));
};

exports.createCustomer = async (data) => {
  if (!data.companyName) throw Boom.badRequest('companyName is required');
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) throw Boom.badRequest('Invalid email format');

  const customerId = await nextCustomerId();
  const avatarColor = randomAvatarColor();

  const conn = await db.getConnection();
  let customerPk;
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO customers (customer_id, company_name, unit_name, gstin, pan, iec, address, city, state,
        state_code, pincode, phone, email, contact_person, contact_person_designation, alt_phone, bill_to,
        ship_to, status, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, data.companyName, data.unitName, data.gstin, data.pan, data.iec || null, data.address || null,
        data.city, data.state, data.stateCode || null, data.pinCode, data.phone, data.email, data.contactPerson,
        data.contactPersonDesignation, data.altPhone, data.billTo, data.shipTo, data.status || 'Active', avatarColor]
    );
    customerPk = result.insertId;
    await saveContacts(conn, customerPk, data.additionalContacts);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A customer with this GSTIN or PAN already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getCustomerById(customerId);
};

exports.updateCustomer = async (customerId, data) => {
  const existing = await getRowByBusinessId(customerId);
  if (!existing) throw Boom.notFound('Customer not found');
  if (!data.companyName) throw Boom.badRequest('companyName is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE customers SET company_name=?, unit_name=?, gstin=?, pan=?, iec=?, address=?, city=?, state=?,
        state_code=?, pincode=?, phone=?, email=?, contact_person=?, contact_person_designation=?, alt_phone=?,
        bill_to=?, ship_to=?, status=?
       WHERE id = ?`,
      [data.companyName, data.unitName, data.gstin, data.pan, data.iec || null, data.address || null, data.city,
        data.state, data.stateCode || null, data.pinCode, data.phone, data.email, data.contactPerson,
        data.contactPersonDesignation, data.altPhone, data.billTo, data.shipTo, data.status, existing.id]
    );
    await saveContacts(conn, existing.id, data.additionalContacts);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A customer with this GSTIN or PAN already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getCustomerById(customerId);
};

// Soft delete — matches his customers.status convention (no hard DELETE observed in the dump for masters).
exports.deleteCustomer = async (customerId) => {
  const existing = await getRowByBusinessId(customerId);
  if (!existing) throw Boom.notFound('Customer not found');
  await db.query(`UPDATE customers SET status = 'Inactive' WHERE id = ?`, [existing.id]);
};
