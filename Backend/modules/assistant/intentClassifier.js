// Lightweight rule-based classifier for the LLM1 pipeline's "Simple Query?" branch
// It only answers one question: does this message need real warehouse data?
// If not, it's safe for LLM1 (Gemini) to answer directly from conversation alone.

const { isPORelated, parsePOReply, wasWaitingForPO } = require('../analyst/poGate');

// ── Conceptual topics that LLM1 can explain without any DB access ─────────────
const CONCEPTUAL_TOPICS = '(inventory|stock|receiving|dispatch(ing)?|issuing|sales|forecasting|reporting|operations|warehouse(ing)?|customers?|visuali[sz]ation|supply\\s+chain|procurement|logistics)';

// These patterns mean the user wants an EXPLANATION, not live data — LLM1 answers.
// Covers: "what is X", "explain X", "I want to know about X", "tell me more about X", "Yes", etc.
const CONCEPTUAL_PATTERNS = [
  // "What is inventory?" / "Explain dispatch." / "Tell me about receiving"
  new RegExp('^(what\\s+is|what\'?s|define|explain|meaning\\s+of|tell\\s+me\\s+about)\\s+(the\\s+)?(an?\\s+)?' + CONCEPTUAL_TOPICS + '\\b\\s*[?.]?\\s*$', 'i'),
  // "I want to know about receiving and dispatch" / "I'd like to know more about forecasting"
  new RegExp('(i\\s+(want|would\\s+like|need|\'d\\s+like)\\s+to\\s+know(\\s+more)?\\s+about).{0,80}' + CONCEPTUAL_TOPICS, 'i'),
  // "Tell me more about dispatch" / "More about receiving" / "Learn more about forecasting"
  new RegExp('(tell\\s+me\\s+more\\s+about|more\\s+about|know\\s+more\\s+about|learn\\s+more\\s+about|elaborate\\s+on).{0,80}' + CONCEPTUAL_TOPICS, 'i'),
  // "What about receiving?" / "And dispatch?" / "How about operations?"
  new RegExp('^(what\\s+about|and|also|how\\s+about)\\s+.{0,60}' + CONCEPTUAL_TOPICS + '\\b\\s*[?.]?\\s*$', 'i'),
  // "What is a purchase order?" → definition, no PO data needed
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*purchase\s+order\s*[?.]?\s*$/i,
  // "What is a product?" → definition, no product data needed
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*product\s*[?.]?\s*$/i,
  // "What is a project?" → definition, no project data needed
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*project\s*[?.]?\s*$/i,
  // Short conversational follow-ups: "Yes", "Sure", "Ok", "Go on", "Continue"
  /^(yes|yeah|yep|sure|ok|okay|go\s+on|continue|proceed|tell\s+me|please|alright|great)\s*[.!?]?\s*$/i,
];

// ── Process questions about how a rule works (answered by LLM1 from the rule list) ──
const PROCESS_QUESTION_PATTERN =
  /^(why|how|when|can|cant|can't|could|is it|does)\b.*\b(approve[sd]?|approval|reject(ed)?|releas(e|ed)|dispatch|delet(e|ed)|inspection|qc|stage|batch|plan|grn|spec|pms)\b/i;

// Words that mean the user wants records, not an explanation
const DATA_ASK_PATTERN = /\b(how\s+many|how\s+much|list|show|count|total|all|pending|which)\b/i;

// ── Data query patterns — these require a real DB query via LLM2 ──────────────
const DATA_TRIGGER_PATTERNS = [
  // Stock & Inventory (wms_db)
  /\b(current\s+stock|stock\s+(of|for|level|levels?|available|balance)|low\s+in\s+stock|out\s+of\s+stock|low[- ]stock|stock\s+status)\b/i,
  /\bhow\s+(much|many)\b/i,
  /\btop\s*\d+\b/i,
  /\b(highest|lowest|most|best[- ]selling|top[- ]selling)\b/i,
  /\b(sales|revenue)\b/i,
  /\b(compare|comparison|\bvs\.?\b|versus)\b/i,
  /\bpurchase(d)?\s+(history|the\s+most)\b/i,
  // "received" only fires with data context, not conceptual "about receiving"
  /\b(items?\s+received|goods?\s+received|material(s)?\s+received|quantity\s+received|received\s+(qty|quantity|today|this\s+week|this\s+month))\b/i,
  // "dispatch" only fires with data context
  /\b(dispatch\s+(record|status|history|log|order|date|qty|quantity|report)|dispatched\s+(items?|goods?|orders?|today|this\s+week))\b/i,
  /\bwarehouse[- ]wise\b/i,
  /\bwhich\s+warehouse\b/i,
  /\b(forecast|demand|replenish(ment)?)\b/i,
  /\b(generate|create)\b.*\breport\b/i,
  /\b(chart|graph|visuali[sz]e|plot)\b/i,

  // Items catalog (wms_db.items)
  /\b(item(s)?|item\s+(code|name|catalog|list|stock|detail|master))\b/i,
  /\b(active\s+items?|inactive\s+items?)\b/i,

  // Purchase Orders (wms_db.purchase_orders)
  /\bpurchase\s*(order(s)?|po)\b/i,
  /\b(po\s+(no|number|date|status|list|detail|summary)|purchase\s+order\s+(status|list|count|detail))\b/i,
  /\b(approved\s+po|pending\s+po|received\s+po|open\s+po)\b/i,

  // Suppliers (wms_db.suppliers)
  /\bsupplier(s)?\b/i,
  /\bvendor(s)?\b/i,

  // GRN / Receiving (wms_db.receiving_verification & receiving_items)
  /\bgrn\b/i,
  /\bgoods?\s+received\s+note\b/i,
  /\b(receiving\s+(record|history|log|status|summary)|receipt(s)?)\b/i,
  /\b(accepted\s+qty|rejected\s+qty|rejection\s+reason)\b/i,

  // Issue Requests (wms_db.issue_requests)
  /\bissue\s*(request(s)?|order(s)?|log)\b/i,
  /\b(issued\s+(items?|qty|quantity)|pending\s+issue|open\s+issue)\b/i,

  // Stock Transactions / Ledger (wms_db.stock_transactions)
  /\bstock\s+(transaction(s)?|ledger|movement(s)?|history)\b/i,
  /\b(receipt\s+transaction|issue\s+transaction|adjustment)\b/i,

  // Products = warehouse stock items (wms_db.items)
  /\bproducts?\b/i,

  // Parts & part master (project_db)
  /\b(parts?|part\s+(code|name|type|status|master|list|catalog|detail))\b/i,
  /\b(active\s+parts?|inactive\s+parts?|approved\s+parts?|draft\s+parts?|rejected\s+parts?|submitted\s+parts?)\b/i,
  /\b(show|list|get|find|display|fetch)\b.{0,30}\bparts?\b/i,
  /\bparts?\b.{0,30}\b(show|list|status|count|detail|info|active|inactive)\b/i,
  /\b(drawing|drawing\s+no|revision|uom|surface\s+finish)\b/i,

  // Work orders (project_db)
  /\bwork\s*orders?\b/i,
  /\b(wo\s+no|wo\s+number|work\s+order\s+(status|count|list|detail|quantity|delivery))\b/i,

  // Projects (project_db)
  /\bprojects?\b/i,
  /\b(project\s+(status|code|name|priority|value|delivery|list|count|header|line))\b/i,
  /\b(in\s+progress|on\s+hold|completed\s+projects?|pending\s+(delivery|projects?))\b/i,
  /\b(high\s+priority|urgent\s+projects?|order\s+value)\b/i,
  /\bpo\s+(no|number|date)\b/i,

  // BOM (project_db)
  /\bbom\b/i,
  /\bbill\s+of\s+materials?\b/i,
  /\bbom\s+(lines?|detail|parts?)\b/i,

  // NCR / Quality (project_db)
  /\bncr\b/i,
  /\bnon[- ]conforman(ce|t)\b/i,
  /\b(defect|defective|rejected|rejection)\b/i,
  /\bcapa\b/i,
  /\b(root\s+cause|corrective\s+action|preventive\s+action)\b/i,
  /\b(quality|qc|inspection)\s+(report|status|stage|check|approved?)\b/i,

  // Part execution & manufacturing (project_db)
  /\b(execution|executing|manufactured|manufacturing|production\s+stage)\b/i,
  /\b(current\s+stage|stage\s+(log|status|execution))\b/i,
  /\b(start\s+date|completion\s+date|completed\s+parts?)\b/i,
  /\bpart\s+(execution|mfg|manufacturing|history|observation)\b/i,

  // Materials & surface finish (project_db)
  /\bmaterial(s|_master|_code)?\b/i,
  /\bsurface\s+finish\b/i,

  // Customers & branches (project_db)
  /\bcustomer(s|_master)?\b/i,
  /\bbranch(es)?\b/i,

  // Billing readiness (project_db)
  /\bbilling\s+(readiness|clearance|cleared|status)\b/i,
  /\bcleared\s+for\s+billing\b/i,
  /\b(ready\s+for\s+billing|billing\s+approved?)\b/i,

  // Generic data intent
  /\b(show|list|give\s+me|display|fetch|get|find)\b.{0,40}\b(all|active|inactive|pending|completed|open|closed|approved|rejected|draft|submitted)\b/i,
  /\b(how\s+many|count\s+of|total\s+number\s+of)\b/i,
  /\b(status\s+of|summary\s+of|details?\s+of|info\s+(on|about))\b/i,

  // Explicit PO numbers (e.g. SPO-2026-0001, PO0001, PO-SEP-04, PO-001)
  /\b(s?po[-_ ]?\d+[\w-_]*|po[-_ ]?[a-z0-9_-]+)\b/i
];

function requiresWarehouseData(message, history = []) {
  const trimmed = message.trim();

  // If the previous AI turn asked for a PO number and this reply is a PO number (or 'all'),
  // the reply is part of the data query. Any other reply is a new question.
  if (wasWaitingForPO(history) && parsePOReply(trimmed)) {
    return true;
  }

  // Conceptual / conversational → LLM1 handles it
  if (CONCEPTUAL_PATTERNS.some((p) => p.test(trimmed))) return false;

  // Process "why / how / can I" questions (e.g. "why can't I approve a GRN?") → LLM1 explains the rule.
  // Counts, lists and records still go to LLM2.
  if (PROCESS_QUESTION_PATTERN.test(trimmed) && !DATA_ASK_PATTERN.test(trimmed) && !/\d{3,}/.test(trimmed)) return false;

  // Questions about one specific PO (named or not, e.g. "when will my order arrive") → LLM2
  if (isPORelated(trimmed)) return true;

  // Data query → route to LLM2
  return DATA_TRIGGER_PATTERNS.some((p) => p.test(trimmed));
}

module.exports = { requiresWarehouseData };
