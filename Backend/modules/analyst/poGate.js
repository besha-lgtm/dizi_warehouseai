// Shared rules for questions about ONE specific Purchase Order.
// Used by LLM1 (to route the question to LLM2) and by LLM2 (to ask for the PO number).

// Explicit PO identifier. Must contain a digit, so ordinary words such as
// "position", "spoiled" or "policy" are not mistaken for a PO number.
// Examples: SPO-2026-0001, PO0001, PO-SEP-04, po 123
const PO_CODE_REGEX = /\b(?:s?po)[-_ ]?(?=[\w-]*\d)[\w-]+\b/i;

// "order number 12345", "order no: 12345"
const ORDER_NO_REGEX = /\border\s*(?:no\.?|number|#)\s*:?\s*(?=[\w-]*\d)[\w-]+/i;

// Creating or raising a PO is not a data question
const CREATE_REGEX = /\b(create|make|raise|place|add|new|generate)\b/i;

// Plural / listing forms: "POs", "purchase orders", "orders", "pending PO", "open orders".
// These ask about many orders, so the PO number is not needed.
const PLURAL_PO_REGEX =
  /\b(purchase\s+orders|p\.?o\.?s|orders)\b|\b(pending|open|approved|rejected|draft|submitted|closed|cancelled|canceled|overdue|delayed|late)\s+(purchase\s+orders?|p\.?o\.?s?|orders?)\b/i;

// Singular reference to one order: "purchase order", "PO", "my order", "order status"
const SINGULAR_PO_REGEX =
  /(?:\bpurchase\s+order|\bp\.?o\.?(?!\w)|\b(?:my|the|this|that|our|your|same|given)\s+order\b|\border\s+(?:status|details?|date|value|items?|info)\b)/i;

// What the user wants to know about an order (status, items, quantities, supplier, dates...)
const SPEC_REGEX =
  /\b(status|track\w*|details?|info|information|show|tell|check|expected|estimated|estimate|eta|delivery|deliver\w*|arriv\w*|due|received|receiv\w*|pending|balance|remaining|outstanding|items?|lines?|quantit\w*|qty|supplier|vendor|amount|value|approv\w*|cancel\w*|closed?|lead\s+time|grn|receipts?|created|delayed|late|overdue|when|date|dispatch\w*|shipment|shipped|left|still|how\s+(?:much|many|long))\b/i;

// Delivery / arrival questions that usually refer to one order even without the word "PO"
const DELIVERY_REGEX =
  /\b(eta|estimated\s+(?:delivery|arrival|date)|expected\s+(?:delivery|arrival|date)|arrival\s+date|delivery\s+(?:date|status|update|time)|shipment\s+status|(?:when|how\s+long)\b.{0,40}\b(?:arriv\w*|deliver\w*|reach\w*)|where\s+is\s+(?:my|the|this)\s+(?:order|shipment|delivery|material|goods)|track\w*\s+(?:my|the|this)\s+(?:order|shipment|delivery|material|goods))\b/i;

const AGGREGATE_REGEX = /\b(all|every|list|how\s+many|count|summary|overview)\b/i;

/**
 * True when the question is about one specific PO but does not name it,
 * so LLM2 must ask for the PO number first.
 * @param {string} text
 * @returns {boolean}
 */
function needsPONumber(text) {
  const q = String(text || '').trim();
  if (!q) return false;
  if (PO_CODE_REGEX.test(q) || ORDER_NO_REGEX.test(q)) return false; // PO already given
  if (CREATE_REGEX.test(q)) return false;
  if (PLURAL_PO_REGEX.test(q)) return false; // listing / aggregate question
  if (SINGULAR_PO_REGEX.test(q)) return SPEC_REGEX.test(q) || DELIVERY_REGEX.test(q);
  return DELIVERY_REGEX.test(q) && !AGGREGATE_REGEX.test(q);
}

/**
 * True when the question is PO-related in any way (PO named, or needs a PO number).
 * Used by LLM1 to decide whether to hand the message to LLM2.
 * @param {string} text
 * @returns {boolean}
 */
function isPORelated(text) {
  const q = String(text || '');
  return PO_CODE_REGEX.test(q) || ORDER_NO_REGEX.test(q) || needsPONumber(q);
}

/**
 * Parse the user's reply to "please provide the PO number".
 * @param {string} text
 * @returns {{ type: 'all' } | { type: 'code', value: string } | null}
 *   null means the user moved on to something else.
 */
function parsePOReply(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^(all|show\s+all|list\s+all|view\s+all|every(thing)?|none)\b/i.test(t)) return { type: 'all' };
  const m = t.match(PO_CODE_REGEX);
  if (m) return { type: 'code', value: m[0].toUpperCase() };
  // A bare number such as "0001" is accepted as a PO number
  if (/^[A-Za-z0-9][\w\-\/]{2,30}$/.test(t) && /\d/.test(t)) return { type: 'code', value: t.toUpperCase() };
  return null;
}

/**
 * True when the last assistant turn asked the user for a PO number.
 * @param {Array<{role: string, content: string}>} history
 * @returns {boolean}
 */
function wasWaitingForPO(history) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const lastAi = [...history].reverse().find((m) => m && m.role === 'ai');
  return !!(lastAi && /po[- ]?number|purchase\s+order\s+number/i.test(lastAi.content));
}

module.exports = {
  PO_CODE_REGEX,
  needsPONumber,
  isPORelated,
  parsePOReply,
  wasWaitingForPO
};
