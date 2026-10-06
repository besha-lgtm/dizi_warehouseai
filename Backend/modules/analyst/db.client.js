require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

// ── Tables blocked from LLM-generated queries (security / PII) ──────────────
const FORBIDDEN_TABLES = [
  'users',
  'employees',
  'departments',
  'roles',
  'role_permissions',
  'permissions',
  'project_owner_allocation'
];

// ── Single pool with no default database, so it can query both DBs ──────────
// Queries must use fully-qualified names:  wms_db.items  /  project_db.part_master
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             parseInt(process.env.DB_PORT || '3306'),
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  // No 'database' key — allows cross-database queries
  // Return DATE/DATETIME as plain strings. Otherwise mysql2 converts them to UTC
  // timestamps, and dates are shown one day early for users east of UTC.
  dateStrings: true,
  multipleStatements: false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Execute a SELECT-only SQL query. Supports cross-database queries:
 *   SELECT * FROM wms_db.items JOIN project_db.part_master ...
 *
 * Security:
 *   1. Must start with SELECT
 *   2. Cannot reference any FORBIDDEN_TABLE (whole-word check)
 *
 * @param {string} sql
 * @returns {Promise<Array>}
 */
async function query(sql) {
  const normalized = sql.trim().toUpperCase();

  if (!normalized.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed.');
  }

  const sqlLower = sql.toLowerCase();
  for (const table of FORBIDDEN_TABLES) {
    const pattern = new RegExp(`\\b${table}\\b`, 'i');
    if (pattern.test(sqlLower)) {
      throw new Error(`Access to table '${table}' is not permitted.`);
    }
  }

  const [rows] = await pool.execute(sql);
  return rows;
}

module.exports = { query };
