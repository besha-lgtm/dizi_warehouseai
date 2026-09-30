const db = require('../../config/db');
const Boom = require('@hapi/boom');

const AVATAR_COLORS = ['#2e90fa', '#7a5af8', '#12b76a', '#f79009', '#f04438', '#0794ad', '#ee46bc', '#16b364'];
function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function rowToSupplier(row, contacts = []) {
  return {
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    unitName: row.unit_name,
    materialCategory: row.material_category,
    gstin: row.gstin,
    pan: row.pan,
    address: row.address,
    city: row.city,
    state: row.state,
    pinCode: row.pincode,
    phone: row.phone,
    email: row.email,
    contactPerson: row.contact_person,
    contactPersonDesignation: row.contact_person_designation,
    billTo: row.bill_to,
    status: row.status,
    avatarColor: row.avatar_color,
    additionalContacts: contacts.map(c => ({
      name: c.contact_name, designation: c.designation, phone: c.phone, email: c.email
    }))
  };
}

// supplier_contacts.supplier_id is the surrogate BIGINT FK to suppliers.id (not the business code).
async function attachContacts(rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [contacts] = await db.query('SELECT * FROM supplier_contacts WHERE supplier_id IN (?)', [ids]);
  return rows.map(row => rowToSupplier(row, contacts.filter(c => c.supplier_id === row.id)));
}

async function saveContacts(conn, supplierPk, contacts) {
  await conn.query('DELETE FROM supplier_contacts WHERE supplier_id = ?', [supplierPk]);
  if (contacts && contacts.length) {
    const values = contacts
      .filter(c => c.name) // contact_name is NOT NULL in the real schema
      .map(c => [supplierPk, c.name, c.designation, c.phone, c.email]);
    if (values.length) {
      await conn.query(
        'INSERT INTO supplier_contacts (supplier_id, contact_name, designation, phone, email) VALUES ?',
        [values]
      );
    }
  }
}

async function nextSupplierId() {
  const [rows] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(supplier_id, 4) AS UNSIGNED)) AS maxId FROM suppliers`
  );
  const next = (rows[0].maxId || 0) + 1;
  return 'SUP' + String(next).padStart(3, '0');
}

async function getRowByBusinessId(supplierId) {
  const [rows] = await db.query('SELECT * FROM suppliers WHERE supplier_id = ? LIMIT 1', [supplierId]);
  return rows[0];
}

exports.getSuppliers = async () => {
  const [rows] = await db.query('SELECT * FROM suppliers ORDER BY supplier_id');
  return attachContacts(rows);
};

exports.getSupplierById = async (supplierId) => {
  const row = await getRowByBusinessId(supplierId);
  if (!row) throw Boom.notFound('Supplier not found');
  const [contacts] = await db.query('SELECT * FROM supplier_contacts WHERE supplier_id = ?', [row.id]);
  return rowToSupplier(row, contacts);
};

exports.getActiveSuppliers = async () => {
  const [rows] = await db.query(
    `SELECT supplier_id, supplier_name FROM suppliers WHERE status = 'Active' ORDER BY supplier_name ASC`
  );
  return rows;
};

exports.createSupplier = async (data) => {
  if (!data.supplierName) throw Boom.badRequest('supplierName is required');
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) throw Boom.badRequest('Invalid email format');

  const supplierId = await nextSupplierId();
  const avatarColor = randomAvatarColor();
  // supplier_code is NOT NULL + UNIQUE in the real schema — default to the generated supplierId if not given.
  const supplierCode = data.supplierCode || supplierId;

  const conn = await db.getConnection();
  let supplierPk;
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO suppliers (supplier_id, supplier_code, supplier_name, unit_name, material_category, gstin,
        pan, address, city, state, pincode, phone, email, contact_person, contact_person_designation, bill_to,
        status, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [supplierId, supplierCode, data.supplierName, data.unitName, data.materialCategory, data.gstin, data.pan,
        data.address, data.city, data.state, data.pinCode, data.phone, data.email, data.contactPerson,
        data.contactPersonDesignation, data.billTo, data.status || 'Active', avatarColor]
    );
    supplierPk = result.insertId;
    await saveContacts(conn, supplierPk, data.additionalContacts);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A supplier with this code, GSTIN, or PAN already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getSupplierById(supplierId);
};

exports.updateSupplier = async (supplierId, data) => {
  const existing = await getRowByBusinessId(supplierId);
  if (!existing) throw Boom.notFound('Supplier not found');
  if (!data.supplierName) throw Boom.badRequest('supplierName is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE suppliers SET supplier_code=?, supplier_name=?, unit_name=?, material_category=?, gstin=?, pan=?,
        address=?, city=?, state=?, pincode=?, phone=?, email=?, contact_person=?, contact_person_designation=?,
        bill_to=?, status=?
       WHERE id = ?`,
      [data.supplierCode || existing.supplier_code, data.supplierName, data.unitName, data.materialCategory,
        data.gstin, data.pan, data.address, data.city, data.state, data.pinCode, data.phone, data.email,
        data.contactPerson, data.contactPersonDesignation, data.billTo, data.status, existing.id]
    );
    await saveContacts(conn, existing.id, data.additionalContacts);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('A supplier with this code, GSTIN, or PAN already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getSupplierById(supplierId);
};

// Soft delete — matches his masters convention (status flip, not a hard DELETE).
exports.deleteSupplier = async (supplierId) => {
  const existing = await getRowByBusinessId(supplierId);
  if (!existing) throw Boom.notFound('Supplier not found');
  await db.query(`UPDATE suppliers SET status = 'Inactive' WHERE id = ?`, [existing.id]);
};
