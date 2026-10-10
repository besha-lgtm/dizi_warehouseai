const Boom = require('@hapi/boom');
const { classifyMessage } = require('./intentClassifier');
const { askGemini } = require('./gemini.client');

const SYSTEM_INSTRUCTION = `You are DIZI, the AI assistant for this Warehouse Management System.

Role and Purpose:
- You help warehouse staff understand warehouse concepts, explain operating rules and workflows, and describe how to use the system.
- Live database queries (such as stock balances, order status, parts lookup) are handled by a separate data analyst service. You do not generate raw database numbers.

How to Respond to Unclear or Misspelled Inquiries:
- If a user's question is unclear, misspelled, garbled, or you do not understand what they are looking for, do NOT say "I don't have access to live warehouse data".
- Instead, politely explain that you didn't understand the question, describe what you can help with as DIZI, and invite them to clarify. For example:
  "I am not sure what you are looking for. I am DIZI, your warehouse assistant. I can help you check stock levels, view purchase orders, monitor work orders and parts, review quality reports, or explain warehouse processes. Could you please clarify what you would like to find?"

Scope and Boundaries:
- You are strictly dedicated to this warehouse and manufacturing management system.
- Never answer general coding or programming tasks, non-warehouse math/science, trivia, creative writing, or external general knowledge questions. Politely decline and redirect back to warehouse operations.
- Employee personal information, user accounts, and login credentials are strictly restricted. State plainly that this information is confidential.

Process Rules (explain in plain words when asked):
- A PMS specification can only be approved or rejected while in Draft status.
- A material receipt (GRN) can only be approved after its incoming QC inspection is completed.
- A production plan must be Released to Production before an execution batch is created.
- A process stage requires at least one QC parameter recorded before it can be approved.
- Dispatch quantities cannot exceed available finished-goods stock.
- A role still assigned to users, or an employee with linked user accounts or direct reports, cannot be deleted.

Tone, Formatting, and Style:
- Keep all responses clean, neat, well-formatted, and concise.
- Use a balanced professional yet approachable tone.
- Do NOT use emojis anywhere in your responses.
- Refer to yourself only as DIZI and the software as "the warehouse management system".`;

// ── Specific block responses (clean, neat, zero emojis, formal yet approachable) ──

const CODING_REPLY =
  'I am DIZI, your warehouse and manufacturing assistant, and I do not handle general programming or software development requests. ' +
  'I can help you monitor inventory, track purchase orders, check stock levels, review quality reports, and guide you through warehouse workflows. ' +
  'Please let me know how I can assist with your warehouse operations.';

const MUTATION_REPLY =
  'DIZI operates in read-only mode and cannot create, update, approve, or delete records. ' +
  'To perform modifications, please use the corresponding section in the warehouse management system, ' +
  'such as Purchase Orders, Work Order Management, or Inventory Adjustments.';

const PII_REPLY =
  'Access restricted: User credentials, employee personal information, and system permission details are confidential and cannot be displayed. ' +
  'Please contact your system administrator for user and access management.';

const OUT_OF_SCOPE_REPLY =
  'I am DIZI, your warehouse management assistant, and that topic is outside my scope. ' +
  'I can help you look up stock levels, purchase orders, suppliers, work orders, parts catalog, quality reports, billing status, and warehouse procedures. ' +
  'How can I help you with your warehouse operations?';

const SQL_INJECTION_REPLY =
  'Your message contains characters or syntax patterns that are restricted for security reasons. ' +
  'Please rephrase your question in plain language, such as "Show all active parts" or "List pending purchase orders".';

const DATA_UNAVAILABLE_REPLY =
  'Live warehouse data queries are currently being routed to the data analyst service. ' +
  'You can ask specific questions about inventory balances, purchase orders, work orders, or warehouse concepts.';

const SUGGESTIONS = ['What can you do?', 'What is inventory?', 'Explain dispatch.'];

function preprocess(message) {
  return (message || '').replace(/\s+/g, ' ').trim();
}

function toGeminiHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'ai'))
    .slice(-10);
}

exports.handleMessage = async ({ message, history }) => {
  const cleaned = preprocess(message);
  if (!cleaned) throw Boom.badRequest('message is required');

  const classification = classifyMessage(cleaned, history);

  // ── Handle BLOCK decisions locally (0 API tokens consumed) ─────────────────
  if (classification.route === 'BLOCK') {
    let reply;
    switch (classification.reason) {
      case 'CODING':
        reply = CODING_REPLY;
        break;
      case 'SQL_INJECTION':
        reply = SQL_INJECTION_REPLY;
        break;
      case 'PII':
        reply = PII_REPLY;
        break;
      case 'MUTATION':
        reply = MUTATION_REPLY;
        break;
      case 'OUT_OF_SCOPE':
        reply = OUT_OF_SCOPE_REPLY;
        break;
      default:
        reply =
          'I am not sure what you are looking for. I am DIZI, your warehouse assistant. ' +
          'I can help you check inventory levels, track purchase orders, look up parts and work orders, ' +
          'review quality reports, or explain warehouse procedures. Could you please clarify your request?';
    }
    return { reply, suggestions: [], dataRequired: false, blocked: true, blockReason: classification.reason };
  }

  // ── Route to LLM2 ─────────────────────────────────────────────────────────
  if (classification.route === 'LLM2') {
    return { reply: DATA_UNAVAILABLE_REPLY, suggestions: SUGGESTIONS, dataRequired: true };
  }

  // ── LLM1: answer conversationally ─────────────────────────────────────────
  let reply;
  try {
    reply = await askGemini({
      systemInstruction: SYSTEM_INSTRUCTION,
      history: toGeminiHistory(history),
      message: cleaned
    });
  } catch (err) {
    console.error('[assistant] Gemini call failed:', err.message);
    throw Boom.badGateway('The assistant is temporarily unavailable. Please try again.');
  }

  if (!reply) {
    reply =
      'I am not sure what you are looking for. I am DIZI, your warehouse assistant. ' +
      'I can help you check stock levels, view purchase orders, look up parts and work orders, ' +
      'review quality reports, or explain warehouse procedures. Could you please clarify your question?';
  }

  return { reply, suggestions: [], dataRequired: false };
};
