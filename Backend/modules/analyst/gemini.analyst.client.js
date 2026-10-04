require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const PRIMARY_MODEL = process.env.GEMINI_MODEL_LLM2 || 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = [PRIMARY_MODEL, 'gemini-3.6-flash', 'gemini-3.7-flash'];

/**
 * Low-level Gemini REST call with automatic fallback across models on 503/429.
 * @param {{ systemInstruction: string, userMessage: string }} opts
 * @returns {Promise<string>} Raw text output from the model.
 */
async function callGemini({ systemInstruction, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  // De-duplicate model list while preserving order
  const modelsToTry = [...new Set(FALLBACK_MODELS)];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 503 || response.status === 429) {
          console.warn(`[Gemini] Model ${model} returned ${response.status}. Trying fallback model...`);
          lastError = new Error(`Gemini API error (${response.status}): ${errText}`);
          continue;
        }
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    } catch (err) {
      lastError = err;
      if (err.message && (err.message.includes('503') || err.message.includes('429'))) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

/**
 * Strip markdown code fences from a Gemini SQL response.
 * @param {string} text
 * @returns {string}
 */
function extractSQL(text) {
  const match = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (match) return match[1].trim();
  return text.trim();
}

/**
 * Ask Gemini to generate a MySQL SELECT query for the given question and schema.
 * @param {{ schema: string, question: string }} opts
 * @returns {Promise<string>} SQL string, or the sentinel "CANNOT_ANSWER".
 */
async function generateSQL({ schema, question }) {
  const systemInstruction = `You are a MySQL SQL query generator for a dual-database warehouse management system.
The system has TWO databases: project_db (manufacturing ERP) and wms_db (warehouse stock management).
Given a database schema and a user question, generate a single valid MySQL SELECT query.
Rules:
- Only generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE.
- ALWAYS use fully-qualified table names: database_name.table_name (e.g. wms_db.stock, project_db.part_master).
- Never query these tables: users, employees, departments, roles, role_permissions, permissions, project_owner_allocation.
- Use table aliases for readability.
- Data conventions:
  * For parts/products queries → use project_db.part_master (status='A' for active, status='I' for inactive, part_status='APPROVED').
  * For stock/inventory levels → use wms_db.stock (available_quantity = quantity - reserved_quantity).
  * For low stock → JOIN wms_db.stock with wms_db.items WHERE stock.quantity < items.minimum_stock.
  * For purchase orders → use wms_db.purchase_orders JOIN wms_db.suppliers. Filter WHERE po_number = '<PO>' if a PO number is mentioned.
  * For purchase order items → use wms_db.purchase_order_items JOIN wms_db.purchase_orders JOIN wms_db.items. Filter by po_number if mentioned.
  * For goods received (GRN) → use wms_db.receiving_verification JOIN wms_db.receiving_items.
  * For issue requests → use wms_db.issue_requests JOIN wms_db.issue_request_items.
  * For active materials → use project_db.material_master WHERE is_active = 'Y'.
  * For billing clearance → use project_db.billing_readiness_checklist (cleared_for_billing = 1 means cleared).
- Add LIMIT 100 unless the user asks for all records.
- Output ONLY the raw SQL query, no explanation, no markdown fences.
- If the question cannot be answered with the given schema, output: CANNOT_ANSWER`;

  const userMessage = `Database Schema:
${schema}

User Question: ${question}

Generate the MySQL SELECT query:`;

  const raw = await callGemini({ systemInstruction, userMessage });
  return extractSQL(raw);
}

/**
 * Ask Gemini to write a prose summary of the query results.
 * @param {{ question: string, sql: string, rows: Array }} opts
 * @returns {Promise<string>} Prose summary.
 */
async function generateSummary({ question, sql, rows }) {
  const systemInstruction = `You are DIZI, the AI data analyst for a warehouse management system.
You have just executed a database query on behalf of the user and received results.
Write a clear, concise, friendly prose answer to the user's question based on the data.
- Mention key numbers, counts, or notable findings.
- Keep it under 150 words.
- Do not reveal SQL internals to the user.
- If the result is empty, say no matching records were found.
- Never mention table names or column names directly — translate them to plain English.
- Never mention company staff names or personal information.`;

  const sample = rows.slice(0, 50);
  const userMessage = `User asked: "${question}"

Query result (${rows.length} total records, showing up to 50):
${JSON.stringify(sample, null, 2)}

Write a helpful prose summary:`;

  return callGemini({ systemInstruction, userMessage });
}

module.exports = { generateSQL, generateSummary };
