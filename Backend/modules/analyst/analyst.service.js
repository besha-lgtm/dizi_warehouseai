const db = require('./db.client');
const gemini = require('./gemini.analyst.client');
const { needsPONumber, parsePOReply, wasWaitingForPO, PO_CODE_REGEX } = require('./poGate');

// ---------------------------------------------------------------------------
// Full dual-database schema for SQL generation.
// Tables span TWO databases: project_db (manufacturing ERP) and wms_db (WMS).
// All table names are FULLY QUALIFIED: database_name.table_name
// Forbidden tables (users, roles, etc.) are enforced at db.client layer.
// ---------------------------------------------------------------------------
const SCHEMA = `
=== DATABASE: project_db (Manufacturing ERP) ===

-- project_db.part_master: PRIMARY parts catalog. Use for ALL part/product queries.
-- status CHAR(1): 'A'=Active, 'I'=Inactive. part_status ENUM: 'APPROVED','SUBMITTED','DRAFT','REJECTED'
project_db.part_master (part_id INT PK, part_code VARCHAR, part_name VARCHAR, revision_no VARCHAR, revision_date DATE, drawing_no VARCHAR, part_type VARCHAR, material_code VARCHAR, uom VARCHAR, status CHAR('A'=Active,'I'=Inactive), part_status ENUM('APPROVED','SUBMITTED','DRAFT','REJECTED'), remarks VARCHAR, created_by VARCHAR, created_date DATETIME)

-- project_db.parts: legacy/secondary parts table (currently empty — prefer part_master)
project_db.parts (part_id INT PK, part_code VARCHAR, part_name VARCHAR, drawing_no VARCHAR, part_type VARCHAR, status CHAR('A'=Active,'I'=Inactive))

-- project_db.part_type_master: lookup for part type names
project_db.part_type_master (part_type_id INT PK, part_type_code VARCHAR, part_type_name VARCHAR, is_active CHAR)

-- project_db.material_master: raw materials catalog (is_active: 'Y'=Active, 'N'=Inactive)
project_db.material_master (material_id INT PK, material_code VARCHAR, material_name VARCHAR, specification VARCHAR, notes TEXT, is_active CHAR('Y'=Active,'N'=Inactive))

-- project_db.surface_finish_master: surface finish types
project_db.surface_finish_master (surface_finish_id INT PK, finish_code VARCHAR, finish_name VARCHAR, finish_category VARCHAR, is_active CHAR, display_order INT)

-- project_db.work_orders: manufacturing work orders
project_db.work_orders (wo_id INT PK, wo_no VARCHAR, wo_date DATE, project_code VARCHAR, project_name VARCHAR, delivery_date DATE, quantity INT, created_on DATETIME)

-- project_db.project_header: customer projects/orders. Primary key is id. There is NO project_id column in this table.
project_db.project_header (id INT PK, po_no VARCHAR, po_date DATE, customer_id INT FK->customer_master, project_name VARCHAR, project_code VARCHAR, project_status VARCHAR, priority VARCHAR, quantity INT, project_delivery_date DATE, total_order_value DECIMAL, created_at DATETIME)

-- project_db.project_line: line items within a project
project_db.project_line (id INT PK, project_id INT FK->project_header, line_no INT, part_desc VARCHAR, qty INT, delivery_date DATE)

-- project_db.project_bom_detail: BOM parts per project
project_db.project_bom_detail (bom_detail_id INT PK, project_id INT FK->project_header, part_id INT FK->part_master, qty_per_set INT)

-- project_db.bom_lines: BOM lines linked to work orders
project_db.bom_lines (id INT PK, project_id INT, work_order_id INT FK->work_orders, part_no VARCHAR, part_name VARCHAR, part_type VARCHAR, material VARCHAR, qty INT, current_status VARCHAR)

-- project_db.project_part_execution: part manufacturing stage tracking
project_db.project_part_execution (part_exec_id INT PK, project_id INT, work_order_id INT, part_no VARCHAR, part_name VARCHAR, qty INT, current_status VARCHAR, current_stage_id VARCHAR, start_date DATE, completion_date DATE)

-- project_db.stage_execution_log: stage-level execution log
project_db.stage_execution_log (log_id INT PK, part_exec_id INT FK->project_part_execution, stage_name VARCHAR, inspection_status VARCHAR, entry_date TIMESTAMP)

-- project_db.customer_master: customers (business info only, no personal data)
project_db.customer_master (customer_id INT PK, customer_code VARCHAR, customer_name VARCHAR, customer_type VARCHAR, address VARCHAR, status VARCHAR)

-- project_db.branch_master: customer branch locations
project_db.branch_master (branch_id INT PK, branch_code VARCHAR, customer_id INT, branch_name VARCHAR, location VARCHAR, status CHAR)

-- project_db.ncr_master: non-conformance reports
project_db.ncr_master (ncr_id BIGINT PK, ncr_number VARCHAR, project_code VARCHAR, work_order VARCHAR, affected_qty INT, problem_description TEXT, status VARCHAR, created_at DATETIME)

-- project_db.ncr_management: NCR actions per part execution
project_db.ncr_management (ncr_id INT PK, part_exec_id INT, ncr_number VARCHAR, defect_description TEXT, ncr_status VARCHAR, created_at DATE)

-- project_db.capa_master: corrective and preventive actions
project_db.capa_master (capa_id BIGINT PK, ncr_id BIGINT FK->ncr_master, rejected_qty INT, root_cause_analysis TEXT, action_taken TEXT, verification_status VARCHAR)

-- project_db.qc_report_master: QC inspection reports
project_db.qc_report_master (id INT PK, project_id INT, workorder_id INT, bom_part_id INT, stage VARCHAR, version INT, created_at TIMESTAMP)

-- project_db.inspection_master: inspection records per stage
project_db.inspection_master (id INT PK, project_id INT, workorder_id INT, bom_part_id INT, stage VARCHAR, version INT, created_at TIMESTAMP)

-- project_db.part_mfg_history: manufacturing history per part
project_db.part_mfg_history (wo_id INT PK, part_id INT FK->part_master, wo_no VARCHAR, created_on DATE, completed_on DATE)

-- project_db.part_observations: quality observations on parts
project_db.part_observations (observation_id INT PK, part_id INT FK->part_master, nc_report_no VARCHAR, created_on DATE, error_notes VARCHAR)

-- project_db.part_revision_history: revision history per part
project_db.part_revision_history (revision_id INT PK, part_id INT FK->part_master, revision_no VARCHAR, revision_date DATE, changes_done VARCHAR)

-- project_db.billing_readiness_checklist: billing clearance per project/work order. project_id references project_header.id.
-- All TINYINT flags: 1=Yes, 0=No
project_db.billing_readiness_checklist (checklist_id INT PK, project_id INT FK->project_header, work_order_id INT FK->work_orders, is_execution_complete TINYINT, is_qc_approved TINYINT, is_ncr_resolved TINYINT, is_final_check_done TINYINT, cleared_for_billing TINYINT, cleared_date DATE)


=== DATABASE: wms_db (Warehouse Management System) ===

-- wms_db.items: inventory item catalog (products held in warehouse)
-- minimum_stock / maximum_stock used for low-stock detection. is_active: 1=Active, 0=Inactive
wms_db.items (item_id BIGINT PK, item_code VARCHAR, item_name VARCHAR, description VARCHAR, category_id BIGINT FK->item_categories, uom_id BIGINT FK->units_of_measure, minimum_stock DECIMAL, maximum_stock DECIMAL, is_active TINYINT(1=Active,0=Inactive), created_at DATETIME)

-- wms_db.item_categories: item category lookup (Raw Material, Components, Consumables, Tools, Packaging)
wms_db.item_categories (category_id BIGINT PK, category_code VARCHAR, category_name VARCHAR, description VARCHAR, is_active TINYINT)

-- wms_db.units_of_measure: UOM lookup (PCS, KG, G, LTR, M, BOX, SET)
wms_db.units_of_measure (uom_id BIGINT PK, uom_code VARCHAR, uom_name VARCHAR, is_active TINYINT)

-- wms_db.suppliers: supplier master (business info only)
wms_db.suppliers (supplier_id BIGINT PK, supplier_code VARCHAR, supplier_name VARCHAR, contact_person VARCHAR, email VARCHAR, phone VARCHAR, city VARCHAR, state VARCHAR, country VARCHAR, is_active TINYINT)

-- wms_db.purchase_orders: purchase orders raised to suppliers
-- status ENUM: 'DRAFT','SUBMITTED','APPROVED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED','CLOSED'
wms_db.purchase_orders (po_id BIGINT PK, po_number VARCHAR, supplier_id BIGINT FK->suppliers, po_date DATE, expected_delivery_date DATE, status ENUM, created_at DATETIME)

-- wms_db.purchase_order_items: line items on each purchase order
wms_db.purchase_order_items (po_item_id BIGINT PK, po_id BIGINT FK->purchase_orders, item_id BIGINT FK->items, ordered_qty DECIMAL, received_qty DECIMAL, unit_price DECIMAL)

-- wms_db.receiving_verification: goods received notes (GRNs)
-- status ENUM: 'PENDING','IN_PROGRESS','VERIFIED','REJECTED','CANCELLED'
wms_db.receiving_verification (receiving_id BIGINT PK, receiving_number VARCHAR, po_id BIGINT FK->purchase_orders, received_date DATETIME, status ENUM, created_at DATETIME)

-- wms_db.receiving_items: item-level detail of each GRN
wms_db.receiving_items (receiving_item_id BIGINT PK, receiving_id BIGINT FK->receiving_verification, item_id BIGINT FK->items, ordered_qty DECIMAL, received_qty DECIMAL, accepted_qty DECIMAL, rejected_qty DECIMAL, rejection_reason VARCHAR)

-- wms_db.stock: LIVE current stock levels per item
-- available_quantity = quantity - reserved_quantity (computed column)
wms_db.stock (stock_id BIGINT PK, item_id BIGINT FK->items, department_id BIGINT, quantity DECIMAL, reserved_quantity DECIMAL, available_quantity DECIMAL, last_transaction_date DATETIME)

-- wms_db.stock_transactions: full ledger of all stock movements
-- transaction_type ENUM: 'RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN'
wms_db.stock_transactions (stock_transaction_id BIGINT PK, transaction_number VARCHAR, item_id BIGINT FK->items, transaction_type ENUM, quantity DECIMAL, reference_type ENUM('RECEIVING','ISSUE_REQUEST','MANUAL'), transaction_date DATETIME, remarks VARCHAR)

-- wms_db.issue_requests: internal department stock issue requests
-- status ENUM: 'DRAFT','SUBMITTED','APPROVED','PARTIALLY_ISSUED','ISSUED','REJECTED','CANCELLED','CLOSED'
wms_db.issue_requests (issue_request_id BIGINT PK, issue_request_number VARCHAR, requesting_department_id BIGINT, request_date DATETIME, required_date DATE, status ENUM, created_at DATETIME)

-- wms_db.issue_request_items: items within each issue request
wms_db.issue_request_items (issue_request_item_id BIGINT PK, issue_request_id BIGINT FK->issue_requests, item_id BIGINT FK->items, requested_qty DECIMAL, approved_qty DECIMAL, issued_qty DECIMAL)

-- wms_db.issue_verification: verification record for issued stock
wms_db.issue_verification (issue_verification_id BIGINT PK, issue_number VARCHAR, issue_request_id BIGINT FK->issue_requests, verified_by BIGINT, verification_date DATETIME, status ENUM)

-- wms_db.qr_transactions: QR codes for PO receiving and issue workflows
-- qr_type ENUM: 'PO_RECEIVING','ISSUE'. status ENUM: 'GENERATED','SCANNED','USED','EXPIRED','CANCELLED'
wms_db.qr_transactions (qr_id BIGINT PK, qr_code VARCHAR, po_id BIGINT FK->purchase_orders, qr_type ENUM, generated_at DATETIME, status ENUM)
`;

// ---------------------------------------------------------------------------
// Fallback reply when the LLM cannot map the question to any allowed table.
// ---------------------------------------------------------------------------
const CANNOT_ANSWER_REPLY =
  "I couldn't find relevant data for that question. " +
  'Try asking about items, stock levels, purchase orders, suppliers, GRNs, issue requests, ' +
  'parts, work orders, projects, materials, NCRs, or billing status.';



const PO_PROMPT =
  "Could you please provide the PO number (e.g., SPO-2026-0001 or PO0001) so I can fetch the specific details for you? " +
  "(Or reply 'all' if you would like to see all purchase orders.)";

function getPreviousUserQuestion(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const userMsgs = history.filter((m) => m && m.role === 'user');
  if (userMsgs.length === 0) return null;
  return userMsgs[userMsgs.length - 1]?.content || null;
}

/**
 * Core analyst workflow:
 *   question → check if PO number needed → SQL (Gemini) → execute (MySQL) → summary (Gemini) → response
 *
 * @param {{ question: string, history?: Array }} opts
 * @returns {Promise<{ reply: string, rows: Array, sql: string|null, cannotAnswer: boolean, waitingForPO?: boolean }>}
 */
async function handleQuery({ question, history = [] }) {
  // ── 1. Validate input ──────────────────────────────────────────────────────
  if (!question || typeof question !== 'string' || !question.trim()) {
    return {
      reply: 'Please provide a question to analyse.',
      rows: [],
      sql: null,
      cannotAnswer: true
    };
  }

  let effectiveQuestion = question.trim();

  // ── 2. Follow-up to a PO-number prompt: the reply supplies the PO (or 'all') ─
  // A reply that is not a PO number is treated as a new question instead.
  const poReply = wasWaitingForPO(history) ? parsePOReply(effectiveQuestion) : null;
  if (poReply) {
    const prevQ = getPreviousUserQuestion(history) || 'Show purchase order details';
    effectiveQuestion = poReply.type === 'all'
      ? `${prevQ} for all purchase orders`
      : `${prevQ} for PO number ${poReply.value}`;
  } else if (needsPONumber(effectiveQuestion)) {
    // ── 3. Question is about one PO but names none: ask for the PO number first ─
    return { reply: PO_PROMPT, rows: [], sql: null, cannotAnswer: false, waitingForPO: true };
  }

  let sql = null;

  try {
    // ── 4. Generate SQL ───────────────────────────────────────────────────────
    sql = await gemini.generateSQL({ schema: SCHEMA, question: effectiveQuestion });

    // Handle NEEDS_PO_NUMBER sentinel from model (only if no PO is already in the question)
    const hasExplicitPO = PO_CODE_REGEX.test(effectiveQuestion);
    if (sql && sql.toUpperCase().includes('NEEDS_PO_NUMBER') && !hasExplicitPO) {
      return { reply: PO_PROMPT, rows: [], sql: null, cannotAnswer: false, waitingForPO: true };
    }

    // ── 5. Handle CANNOT_ANSWER sentinel ─────────────────────────────────────
    if (!sql || sql.toUpperCase().includes('CANNOT_ANSWER')) {
      return { reply: CANNOT_ANSWER_REPLY, rows: [], sql: null, cannotAnswer: true };
    }

    // ── 6. Execute SQL ────────────────────────────────────────────────────────
    let rows;
    try {
      rows = await db.query(sql);
    } catch (dbErr) {
      console.error('[LLM2] DB execution error:', dbErr.message);
      return {
        reply:
          'I generated a query but it could not be executed against the database. ' +
          'Please rephrase your question or contact support if the issue persists.',
        rows: [],
        sql,
        cannotAnswer: false
      };
    }

    // ── 7. Generate prose summary ─────────────────────────────────────────────
    const reply = await gemini.generateSummary({ question: effectiveQuestion, sql, rows });

    return { reply, rows, sql, cannotAnswer: false };

  } catch (err) {
    console.error('[LLM2] handleQuery error:', err.message);
    const busy = /\((429|503)\)/.test(err.message);
    return {
      reply: busy
        ? 'The AI service is busy right now. Please try again in a minute.'
        : 'An unexpected error occurred while processing your request. Please try again.',
      rows: [],
      sql,
      cannotAnswer: false
    };
  }
}

module.exports = { handleQuery };
