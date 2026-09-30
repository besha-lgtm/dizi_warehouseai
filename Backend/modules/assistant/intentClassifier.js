// Lightweight rule-based classifier for the LLM1 pipeline's "Simple Query?" branch
// (Day 3 spec: "use lightweight rules + Gemini for intent classification").
// It only answers one question: does this message need real warehouse data
// (inventory, sales, receiving, dispatch, operations, forecasting, reporting, visualization)?
// If not, it's safe for LLM1 (Gemini) to answer directly from conversation alone.

// "What is inventory?" / "Explain dispatch." — conceptual questions, never need live data.
const DEFINITION_PATTERN =
  /^(what\s+is|what'?s|define|explain|meaning\s+of|tell\s+me\s+about)\s+(the\s+)?(an?\s+)?(inventory|stock|receiving|dispatch(ing)?|issuing|sales|forecasting|reporting|operations|warehouse(ing)?|customers?|visuali[sz]ation)\b\s*[?.]?\s*$/i;

const DATA_TRIGGER_PATTERNS = [
  /\b(current\s+stock|stock\s+(of|for|level|available)|low\s+in\s+stock|out\s+of\s+stock|low[- ]stock)\b/i,
  /\bhow\s+(much|many)\b/i,
  /\btop\s*\d+\b/i,
  /\b(highest|lowest|most|best[- ]selling|top[- ]selling)\b/i,
  /\b(sales|revenue)\b/i,
  /\b(compare|comparison|\bvs\.?\b|versus)\b/i,
  /\bpurchase(d)?\s+(history|the\s+most)\b/i,
  /\breceived\b/i,
  /\bdispatch(ed)?\b/i,
  /\bwarehouse[- ]wise\b/i,
  /\bwhich\s+warehouse\b/i,
  /\b(forecast|demand|replenish(ment)?)\b/i,
  /\b(generate|create)\b.*\breport\b/i,
  /\b(chart|graph|visuali[sz]e|plot)\b/i
];

function requiresWarehouseData(message) {
  const trimmed = message.trim();
  if (DEFINITION_PATTERN.test(trimmed)) return false;
  return DATA_TRIGGER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

module.exports = { requiresWarehouseData };
