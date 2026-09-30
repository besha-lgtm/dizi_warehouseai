const db = require('../../config/db');
const Boom = require('@hapi/boom');

const AVATAR_COLORS = ['#2e90fa', '#7a5af8', '#12b76a', '#f79009', '#f04438', '#0794ad', '#ee46bc', '#16b364'];
function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function slugCode(name) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 30);
}

// The Angular UI still sends department/designation as plain strings (its dropdowns are
// static lists, not yet wired to the real lookup tables). These resolve-or-create by name
// so the real FK-based schema can be used without a frontend rework right now.
async function resolveDepartmentId(conn, departmentName) {
  if (!departmentName) return null;
  const [rows] = await conn.query('SELECT id FROM departments WHERE department_name = ?', [departmentName]);
  if (rows.length) return rows[0].id;
  const [result] = await conn.query(
    'INSERT INTO departments (department_code, department_name, status) VALUES (?, ?, ?)',
    [slugCode(departmentName), departmentName, 'Active']
  );
  return result.insertId;
}

async function resolveDesignationId(conn, designationName, departmentId) {
  if (!designationName) return null;
  const [rows] = await conn.query('SELECT id FROM designations WHERE designation_name = ?', [designationName]);
  if (rows.length) return rows[0].id;
  const [result] = await conn.query(
    'INSERT INTO designations (department_id, designation_name, status) VALUES (?, ?, ?)',
    [departmentId, designationName, 'Active']
  );
  return result.insertId;
}

const BASE_SELECT = `
  SELECT e.*, d.department_name, ds.designation_name, mgr.emp_name AS manager_name,
    bank.account_holder, bank.bank_name, bank.account_no, bank.ifsc, bank.account_type, bank.branch,
    stat.pf_no, stat.esi_no, stat.uan, stat.pf_applicable, stat.esi_applicable, stat.gratuity_applicable
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations ds ON ds.id = e.designation_id
  LEFT JOIN employees mgr ON mgr.id = e.reporting_manager_id
  LEFT JOIN employee_bank_details bank ON bank.employee_id = e.id
  LEFT JOIN employee_statutory stat ON stat.employee_id = e.id
`;

function rowToEmployee(row) {
  return {
    empId: row.emp_id,
    empCode: row.emp_code,
    empName: row.emp_name,
    fatherName: row.father_name,
    dob: row.dob,
    gender: row.gender,
    mobile: row.mobile_no,
    altMobile: row.alt_mobile,
    email: row.email,
    aadhaar: row.aadhaar,
    pan: row.pan,
    address: row.address,
    resAddress: row.res_address,
    permAddress: row.perm_address,
    education: row.education,
    bloodGroup: row.blood_group,
    prevExperience: !!row.prev_experience,
    yearsWorked: row.years_worked,
    doj: row.joining_date,
    employeeType: row.employee_type,
    department: row.department_name,
    designation: row.designation_name,
    shift: row.shift,
    reportingManagerId: row.reporting_manager_id,
    reportingManagerName: row.manager_name,
    skill: row.skill,
    machineAssigned: row.machine_assigned,
    basicSalary: row.basic_salary,
    attendanceType: row.attendance_type,
    workLocation: row.work_location,
    status: row.status,
    bankDetails: {
      accountHolder: row.account_holder,
      bankName: row.bank_name,
      accountNo: row.account_no,
      ifsc: row.ifsc,
      accountType: row.account_type,
      branch: row.branch
    },
    statutory: {
      pfNo: row.pf_no,
      esiNo: row.esi_no,
      uan: row.uan,
      pfApplicable: row.pf_applicable ? 'Yes' : 'No',
      esiApplicable: row.esi_applicable ? 'Yes' : 'No',
      gratuityApplicable: row.gratuity_applicable ? 'Yes' : 'No'
    },
    avatarColor: row.avatar_color,
    resumeFile: row.resume_file,
    educationDocs: row.education_docs,
    createdBy: row.created_by,
    createdDate: row.created_at,
    updatedBy: row.last_updated_by,
    updatedDate: row.last_updated_date
  };
}

async function nextEmpId() {
  const [rows] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(emp_id, 2) AS UNSIGNED)) AS maxId FROM employees`
  );
  const next = (rows[0].maxId || 0) + 1;
  return 'E' + String(next).padStart(3, '0');
}

async function getRowByBusinessId(empId) {
  const [rows] = await db.query(`${BASE_SELECT} WHERE e.emp_id = ? LIMIT 1`, [empId]);
  return rows[0];
}

async function saveBankAndStatutory(conn, employeePk, bankDetails, statutory) {
  await conn.query('DELETE FROM employee_bank_details WHERE employee_id = ?', [employeePk]);
  if (bankDetails && (bankDetails.accountNo || bankDetails.accountHolder)) {
    await conn.query(
      `INSERT INTO employee_bank_details (employee_id, account_holder, bank_name, account_no, ifsc, account_type, branch)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employeePk, bankDetails.accountHolder, bankDetails.bankName, bankDetails.accountNo, bankDetails.ifsc,
        bankDetails.accountType, bankDetails.branch]
    );
  }

  await conn.query('DELETE FROM employee_statutory WHERE employee_id = ?', [employeePk]);
  if (statutory && (statutory.pfNo || statutory.esiNo || statutory.uan)) {
    await conn.query(
      `INSERT INTO employee_statutory (employee_id, pf_no, esi_no, uan, pf_applicable, esi_applicable, gratuity_applicable)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employeePk, statutory.pfNo, statutory.esiNo, statutory.uan, statutory.pfApplicable === 'Yes' ? 1 : 0,
        statutory.esiApplicable === 'Yes' ? 1 : 0, statutory.gratuityApplicable === 'Yes' ? 1 : 0]
    );
  }
}

exports.getEmployees = async () => {
  const [rows] = await db.query(`${BASE_SELECT} ORDER BY e.emp_id`);
  return rows.map(rowToEmployee);
};

exports.getEmployeeById = async (empId) => {
  const row = await getRowByBusinessId(empId);
  if (!row) throw Boom.notFound('Employee not found');
  return rowToEmployee(row);
};

exports.createEmployee = async (data, createdBy) => {
  if (!data.empName) throw Boom.badRequest('empName is required');

  const empId = await nextEmpId();
  const empCode = data.empCode || empId;
  const avatarColor = randomAvatarColor();

  const conn = await db.getConnection();
  let employeePk;
  try {
    await conn.beginTransaction();
    const departmentId = await resolveDepartmentId(conn, data.department);
    const designationId = await resolveDesignationId(conn, data.designation, departmentId);

    const [result] = await conn.query(
      `INSERT INTO employees (emp_id, emp_code, emp_name, father_name, dob, gender, department_id, designation_id,
        reporting_manager_id, joining_date, mobile_no, email, address, city, state, pincode, status,
        aadhaar, pan, alt_mobile, blood_group, education, res_address, perm_address, prev_experience,
        years_worked, employee_type, shift, skill, machine_assigned, basic_salary, attendance_type,
        work_location, avatar_color, resume_file, education_docs, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empId, empCode, data.empName, data.fatherName, data.dob || null, data.gender, departmentId, designationId,
        data.reportingManagerId || null, data.doj || null, data.mobile, data.email, data.address, data.city || null,
        data.state || null, data.pincode || null, data.status || 'Active', data.aadhaar, data.pan, data.altMobile,
        data.bloodGroup, data.education, data.resAddress, data.permAddress, data.prevExperience ? 1 : 0,
        data.yearsWorked, data.employeeType, data.shift, data.skill, data.machineAssigned, data.basicSalary,
        data.attendanceType, data.workLocation, avatarColor,
        typeof data.resumeFile === 'string' ? data.resumeFile : null,
        typeof data.educationDocs === 'string' ? data.educationDocs : null,
        createdBy || 'system']
    );
    employeePk = result.insertId;
    await saveBankAndStatutory(conn, employeePk, data.bankDetails, data.statutory);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('An employee with this code already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getEmployeeById(empId);
};

exports.updateEmployee = async (empId, data, updatedBy) => {
  const existing = await getRowByBusinessId(empId);
  if (!existing) throw Boom.notFound('Employee not found');
  if (!data.empName) throw Boom.badRequest('empName is required');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const departmentId = await resolveDepartmentId(conn, data.department);
    const designationId = await resolveDesignationId(conn, data.designation, departmentId);

    await conn.query(
      `UPDATE employees SET emp_code=?, emp_name=?, father_name=?, dob=?, gender=?, department_id=?,
        designation_id=?, reporting_manager_id=?, joining_date=?, mobile_no=?, email=?, address=?, city=?,
        state=?, pincode=?, status=?, aadhaar=?, pan=?, alt_mobile=?, blood_group=?, education=?, res_address=?,
        perm_address=?, prev_experience=?, years_worked=?, employee_type=?, shift=?, skill=?, machine_assigned=?,
        basic_salary=?, attendance_type=?, work_location=?, last_updated_by=?
       WHERE id = ?`,
      [data.empCode, data.empName, data.fatherName, data.dob || null, data.gender, departmentId, designationId,
        data.reportingManagerId || null, data.doj || null, data.mobile, data.email, data.address, data.city || null,
        data.state || null, data.pincode || null, data.status, data.aadhaar, data.pan, data.altMobile, data.bloodGroup,
        data.education, data.resAddress, data.permAddress, data.prevExperience ? 1 : 0, data.yearsWorked,
        data.employeeType, data.shift, data.skill, data.machineAssigned, data.basicSalary, data.attendanceType,
        data.workLocation, updatedBy || 'system', existing.id]
    );
    await saveBankAndStatutory(conn, existing.id, data.bankDetails, data.statutory);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw Boom.conflict('An employee with this code already exists');
    throw err;
  } finally {
    conn.release();
  }

  return exports.getEmployeeById(empId);
};

// Hard delete matches his employees table having no soft-delete precedent shown either way;
// kept as hard DELETE from the earlier pass. Linked user (if any) blocks this via FK unless removed first.
exports.deleteEmployee = async (empId) => {
  const existing = await getRowByBusinessId(empId);
  if (!existing) throw Boom.notFound('Employee not found');
  try {
    await db.query('DELETE FROM employees WHERE id = ?', [existing.id]);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      throw Boom.conflict('Cannot delete an employee who still has a linked user account or direct reports');
    }
    throw err;
  }
};
