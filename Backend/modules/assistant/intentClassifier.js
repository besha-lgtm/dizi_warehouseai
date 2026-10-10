// Lightweight rule-based classifier for the LLM1 pipeline's "Simple Query?" branch
// It answers two questions:
// 1. Is this message out of scope or blocked (mutation, PII, coding, non-warehouse)?
// 2. Does this message need real warehouse data (LLM2) or conversational handling (LLM1)?

const { isPORelated, parsePOReply, wasWaitingForPO } = require('../analyst/poGate');

// ── Conceptual topics that LLM1 can explain without any DB access ─────────────
const CONCEPTUAL_TOPICS = '(inventory|stock|receiving|dispatch(ing)?|issuing|sales|forecasting|reporting|operations|warehouse(ing)?|customers?|visuali[sz]ation|supply\\s+chain|procurement|logistics)';

// These patterns mean the user wants an EXPLANATION of a warehouse concept — LLM1 answers.
const CONCEPTUAL_PATTERNS = [
  new RegExp('^(what\\s+is|what\'?s|define|explain|meaning\\s+of|tell\\s+me\\s+about)\\s+(the\\s+)?(an?\\s+)?' + CONCEPTUAL_TOPICS + '\\b\\s*[?.]?\\s*$', 'i'),
  new RegExp('(i\\s+(want|would\\s+like|need|\'d\\s+like)\\s+to\\s+know(\\s+more)?\\s+about).{0,80}' + CONCEPTUAL_TOPICS, 'i'),
  new RegExp('(tell\\s+me\\s+more\\s+about|more\\s+about|know\\s+more\\s+about|learn\\s+more\\s+about|elaborate\\s+on).{0,80}' + CONCEPTUAL_TOPICS, 'i'),
  new RegExp('^(what\\s+about|and|also|how\\s+about)\\s+.{0,60}' + CONCEPTUAL_TOPICS + '\\b\\s*[?.]?\\s*$', 'i'),
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*purchase\s+order\s*[?.]?\s*$/i,
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*product\s*[?.]?\s*$/i,
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*project\s*[?.]?\s*$/i,
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*work\s*order\s*[?.]?\s*$/i,
  /^(what\s+is|what'?s|define|explain)\s+(a|an|the)?\s*(bom|grn|ncr|capa|pms)\s*[?.]?\s*$/i,
  /^(yes|yeah|yep|sure|ok|okay|go\s+on|continue|proceed|tell\s+me|please|alright|great|got\s+it)\s*[.!?]?\s*$/i,
];

// ── Process questions about how a rule works (answered by LLM1) ──────────────
const PROCESS_QUESTION_PATTERN =
  /^(why|how|when|can|cant|can't|could|is it|does)\b.*\b(approve[sd]?|approval|reject(ed)?|releas(e|ed)|dispatch|delet(e|ed)|inspection|qc|stage|batch|plan|grn|spec|pms)\b/i;

// Words that mean the user wants records, not an explanation
const DATA_ASK_PATTERN = /\b(how\s+many|how\s+much|list|show|count|total|all|pending|which)\b/i;

// ── MUTATION interceptor — user wants to write/modify data (DIZI is READ-ONLY) ─────
const MUTATION_PATTERNS = [
  // Delete / remove / drop
  /\b(delete|remove|drop|erase|wipe|purge)\b.{0,60}\b(part|item|stock|order|product|supplier|work\s*order|po|grn|ncr|project|record|entry|customer|material|bom)\b/i,
  /\b(delete|remove|drop|erase|wipe|purge)\b.{0,10}\b(all|every|the)\b/i,
  // Update / modify / change / set / edit
  /\b(update|modify|change|edit|set|alter|revise|adjust|correct|fix)\b.{0,60}\b(stock|quantity|qty|status|price|part|item|order|record|entry|level|value|date|name)\b/i,
  // Create / add / insert / make / generate a new record
  /\b(create|add|insert|make|generate|raise|open|initiate)\b.{0,60}\b(new\s+)?(part|item|order|purchase\s+order|work\s*order|po|grn|ncr|project|supplier|customer|record|entry|product|bom)\b/i,
  // Approve / reject / cancel / close a record
  /\b(approve|reject|cancel|close|confirm|release|dispatch|issue|submit)\b.{0,60}\b(work\s*order|wo|purchase\s+order|po|grn|ncr|part|project|request|record|item)\b/i,
  // Shorthand like "approve WO-2026-001" or "cancel PO-001"
  /\b(approve|reject|cancel|close|dispatch|release)\b.{0,20}\b(wo|po|grn|ncr|so|spo)[-_]?\w+/i,
];

// ── PII / Security interceptor — queries for confidential user/employee data ──
const PII_PATTERNS = [
  // Credentials and login
  /\b(user(s)?|login(s)?|account(s)?|credential(s)?|username(s)?)\b.{0,40}\b(password(s)?|pass|hash|secret|token)\b/i,
  /\b(password(s)?|credentials?)\b/i,
  // Employee personal info
  /\b(employee|staff|personnel|worker)\b.{0,40}\b(phone|mobile|email|address|personal|private|contact|salary|id\s+card|national\s+id|aadhaar|pan)\b/i,
  /\b(personal\s+(info|information|data|detail))\b/i,
  // Security roles and permissions
  /\b(role(s)?|permission(s)?|access\s+level|privilege(s)?|security\s+(role|setting|policy))\b.{0,40}\b(admin|administrator|user|list|all|show)\b/i,
  /\b(show|list|get|display|fetch)\b.{0,40}\b(all\s+)?(user(s)?|admin(s)?|role(s)?|permission(s)?)\b/i,
  /\b(admin(s)?|administrator(s)?)\b.{0,30}\b(role|list|all|access|permission)\b/i,
  /\b(roles?\s+(and|&)\s+permissions?|permissions?\s+(and|&)\s+roles?)\b/i,
];

// ── CODING / Programming interceptor — blocks code generation requests to save tokens
const CODING_PATTERNS = [
  // "Write code for prime numbers", "Generate python script to sort array"
  /\b(write|create|generate|provide|give\s+me)\b.{0,30}\b(code|script|program|function|algorithm|class|macro|snippet|solution)\b/i,
  /\b(code\s+(for|to|in|of)|coding\s+(for|in)|write\s+a\s+program|write\s+a\s+function|write\s+a\s+script)\b/i,
  // Programming languages + code/script
  /\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|ruby|php|html|css|bash|powershell|swift|kotlin|sql\s+query\s+to\s+solve)\b.{0,30}\b(code|script|program|function|example|snippet|task)\b/i,
  // Specific algorithms / coding interview problems
  /\b(prime\s+numbers?|fibonacci|factorial|palindrome|quicksort|mergesort|bubble\s+sort|binary\s+search|matrix\s+multiplication|linked\s+list|binary\s+tree|leetcode|hackerrank|dfs|bfs)\b/i,
  // Code debugging / syntax / language questions
  /\b(debug|compile|fix\s+this\s+code|syntax\s+error|how\s+to\s+code|programming\s+language|write\s+code)\b/i,
];

// ── Out-of-scope domain interceptor — topics unrelated to warehouse/manufacturing
const OUT_OF_SCOPE_PATTERNS = [
  // Weather
  /\b(weather|temperature|humidity|rain|rainfall|climate|wind\s+speed|precipitation)\b.{0,30}\b(today|tomorrow|this\s+week|in\s+[a-z]+)\b/i,
  /\bweather\s+(in|at|for|of)\b/i,
  // Sports, news, entertainment
  /\b(cricket|football|soccer|tennis|ipl|world\s+cup|fifa|olympics|match|live\s+score|news|politics|election|tournament)\b/i,
  /\b(movie(s)?|film(s)?|actor|actress|hollywood|bollywood|netflix|cinema|song(s)?|music|celebrity|video\s+games?|gaming)\b/i,
  // Financial markets
  /\b(stock\s+market|share\s+price|nifty|sensex|nasdaq|dow\s+jones|forex|crypto|bitcoin|ethereum)\b/i,
  // Travel / courier tracking
  /\b(flight|train|bus|cab|ticket|booking|hotel|reservation|courier\s+track|shipment\s+track|fedex|dhl|ups|bluedart)\b.{0,30}\b(status|number|id|code|track)\b/i,
  /\b(bank\s+account|hdfc|icici|sbi|citibank|account\s+balance|credit\s+card|debit\s+card|atm|loan|mortgage)\b/i,
  // 3D simulation / future demand prediction
  /\b(3d\s+simulation|virtual\s+reality|vr|augmented\s+reality|ar|simulate\s+(warehouse|stock|production))\b/i,
  /\b(predict\s+\d{4}\s+demand|forecast\s+\d{4}|machine\s+learning\s+model|ai\s+simulation)\b/i,
  // Math & academic
  /\b(solve|calculate|compute)\b.{0,30}\b(math|equation|integral|derivative|calculus|algebra|geometry|physics|quadratic)\b/i,
  /\b(chemical\s+formula|periodic\s+table|photosynthesis|mitochondria|quantum\s+physics|speed\s+of\s+light|dna|rna)\b/i,
  // Creative writing & jokes
  /\b(write|tell\s+me|generate)\b.{0,30}\b(joke|poem|poetry|story|essay|song|rap|lyrics|riddle|fairy\s+tale|novel)\b/i,
  /\b(joke|riddle|pun|story\s+about|poem\s+about|essay\s+on)\b/i,
  // World knowledge / trivia
  /\b(who\s+is|who\s+was|who\s+are)\b.{0,30}\b(president|prime\s+minister|minister|king|queen|actor|actress|singer|celebrity|scientist|author|modi|biden|trump|einstein|newton)\b/i,
  /\b(capital\s+of|population\s+of|currency\s+of|largest\s+country|history\s+of\s+[a-z]+|geography\s+of)\b/i,
  // Cooking & recipes
  /\b(recipe|how\s+to\s+cook|how\s+to\s+make|ingredients\s+for|bake\s+a\s+cake|food\s+recipe|dish)\b.{0,30}\b(pasta|pizza|cake|biryani|tea|coffee|curry|soup|cookie|bread)\b/i,
  /\b(medical\s+advice|symptoms?\s+of|medicine\s+for|treatment\s+for|cure\s+for|health\s+tips?|workout\s+plan|diet\s+plan)\b/i,
  // Translation
  /\b(translate|translation)\b.{0,30}\b(into|to|in)\s+(spanish|french|german|hindi|tamil|telugu|chinese|japanese|russian|arabic)\b/i,
];

// ── SQL injection attempt detector ─────────────────────────────────────────────
const SQL_INJECTION_PATTERNS = [
  /('\s*(or|and)\s*'?\s*\d+\s*=\s*\d+)/i,
  /\b(union\s+select|drop\s+table|truncate\s+table|exec\s+\(|xp_cmdshell)\b/i,
  /';\s*(drop|delete|insert|update|alter|create)\b/i,
  /--\s*(drop|delete|select|insert)\b/i,
];

// ── Warehouse domain vocabulary — validates warehouse relevance ───────────────
const WAREHOUSE_DOMAIN_TERMS =
  /\b(inventory|stock|items?|products?|materials?|parts?|uom|units?\s+of\s+measure|receiving|dispatch(ing)?|shipment|shipping|storage|warehouse|warehousing|shelf|rack|bin|bay|lot|batch|supplier|vendor|customer|branch|purchase\s+order|po|spo|work\s+order|wo|sales\s+order|so|issue\s+request|requisition|receipt|grn|goods?\s+received\s+note|ledger|movement|replenish(ment)?|forecast(ing)?|demand|pms|spec(ification)?|bom|bill\s+of\s+materials|ncr|non[- ]conformance|defect|capa|qc|quality|inspection|observation|billing|clearance|cleared|cycle\s+count|audit|procurement|logistics|supply\s+chain)\b/i;

// ── Allowed greeting / persona / clarification openers ───────────────────────
const GREETING_OR_PERSONA_TERMS =
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|greetings|who\s+are\s+you|what\s+can\s+you\s+do|what('?s|\s+is)\s+your\s+name|help(\s+me)?|how\s+can\s+you\s+help|what\s+are\s+your\s+capabilities|introduce\s+yourself|thanks|thank\s+you|bye|goodbye|see\s+you|yes|sure|ok|okay|alright|great|continue|go\s+on|asdfghjkl|\?+|\.+|status|details|show)\b/i;

// ── Data query patterns — these require a real DB query via LLM2 ──────────────
const DATA_TRIGGER_PATTERNS = [
  // Stock & Inventory (wms_db)
  /\b(current\s+stock|stock\s+(of|for|level|levels?|available|balance)|low\s+in\s+stock|out\s+of\s+stock|low[- ]stock|stock\s+status)\b/i,
  /\b(how|howe)\s+(much|many)\b/i,
  /\b(how|howe)\s+much\s+(is|are)?\s*(left|ledf|remaning|remianing|available)\b/i,
  /\btop\s*\d+\b/i,
  /\b(highest|lowest|most|best[- ]selling|top[- ]selling)\b/i,
  /\b(sales|revenue)\b/i,
  /\b(compare|comparison|\bvs\.?\b|versus)\b/i,
  /\bpurchase(d)?\s+(history|the\s+most)\b/i,
  /\b(items?\s+received|goods?\s+received|material(s)?\s+received|quantity\s+received|received\s+(qty|quantity|today|this\s+week|this\s+month))\b/i,
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

  // GRN / Receiving (wms_db)
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
  /\b(s?po[-_ ]?\d+[\w-_]*|po[-_ ]?[a-z0-9_-]+)\b/i,
];

/**
 * Classify the user's message into a routing decision.
 *
 * Returns one of:
 *   { route: 'LLM1' }                    – conversational / conceptual
 *   { route: 'LLM2' }                    – data query, forward to LLM2
 *   { route: 'BLOCK', reason: string }   – blocked (saves LLM tokens!):
 *       reason = 'MUTATION'      → read-only refusal
 *       reason = 'PII'           → confidentiality restriction
 *       reason = 'CODING'        → non-warehouse programming refusal
 *       reason = 'OUT_OF_SCOPE'  → outside DIZI's domain
 *       reason = 'SQL_INJECTION' → security warning
 */
function classifyMessage(message, history = []) {
  const trimmed = (message || '').trim();

  // 0. SQL injection attempts → BLOCK immediately
  if (SQL_INJECTION_PATTERNS.some((p) => p.test(trimmed))) {
    return { route: 'BLOCK', reason: 'SQL_INJECTION' };
  }

  // 1. PII / security queries → BLOCK before data triggers fire
  if (PII_PATTERNS.some((p) => p.test(trimmed))) {
    return { route: 'BLOCK', reason: 'PII' };
  }

  // 2. Data-mutation requests → BLOCK before data triggers fire
  if (MUTATION_PATTERNS.some((p) => p.test(trimmed))) {
    return { route: 'BLOCK', reason: 'MUTATION' };
  }

  // 3. Coding & programming requests → BLOCK immediately (saves LLM tokens!)
  if (CODING_PATTERNS.some((p) => p.test(trimmed))) {
    return { route: 'BLOCK', reason: 'CODING' };
  }

  // 4. Out-of-scope domain topics → BLOCK before data triggers fire
  if (OUT_OF_SCOPE_PATTERNS.some((p) => p.test(trimmed))) {
    return { route: 'BLOCK', reason: 'OUT_OF_SCOPE' };
  }

  // 5. PO follow-up reply
  if (wasWaitingForPO(history) && parsePOReply(trimmed)) {
    return { route: 'LLM2' };
  }

  // 6. Conceptual / conversational warehouse explanation → LLM1
  if (CONCEPTUAL_PATTERNS.some((p) => p.test(trimmed))) return { route: 'LLM1' };

  // 7. Process "why / how / can I" questions → LLM1 explains the rule
  if (
    PROCESS_QUESTION_PATTERN.test(trimmed) &&
    !DATA_ASK_PATTERN.test(trimmed) &&
    !/\d{3,}/.test(trimmed)
  ) {
    return { route: 'LLM1' };
  }

  // 8. Questions about one specific PO → LLM2
  if (isPORelated(trimmed)) return { route: 'LLM2' };

  // 9. Data query → route to LLM2
  if (DATA_TRIGGER_PATTERNS.some((p) => p.test(trimmed))) return { route: 'LLM2' };

  // 10. Greetings, capability ask, politeness, or single-word ambiguous checks → LLM1
  if (GREETING_OR_PERSONA_TERMS.test(trimmed)) {
    return { route: 'LLM1' };
  }

  // 11. Contains any recognized warehouse domain term → LLM1
  if (WAREHOUSE_DOMAIN_TERMS.test(trimmed)) {
    return { route: 'LLM1' };
  }

  // 12. If the message has NO warehouse relevance and is NOT a greeting → BLOCK as OUT_OF_SCOPE
  // (Prevents token consumption on arbitrary off-topic queries)
  return { route: 'BLOCK', reason: 'OUT_OF_SCOPE' };
}

/** Backward-compatible wrapper — returns boolean (true = needs warehouse data / LLM2) */
function requiresWarehouseData(message, history = []) {
  const result = classifyMessage(message, history);
  return result.route === 'LLM2';
}

module.exports = { requiresWarehouseData, classifyMessage };
