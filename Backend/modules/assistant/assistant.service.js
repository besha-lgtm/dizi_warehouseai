const Boom = require('@hapi/boom');
const { requiresWarehouseData } = require('./intentClassifier');
const { askGemini } = require('./gemini.client');

const SYSTEM_INSTRUCTION = `You are DIZI, the AI assistant for this Warehouse Management System.
- You can greet users, explain warehouse concepts (inventory, receiving, dispatch, sales, forecasting, reporting, operations, visualization), describe your own capabilities, and answer general conversational questions.
- You do NOT fetch live warehouse data yourself. Questions about real stock, orders, suppliers, projects or other records are answered by a separate data analyst, which runs automatically. If the user asks for such data here, briefly say they can ask a specific question about it (e.g. "Show current stock levels" or "When will my order arrive?") and do not state any numbers.
- Employee, staff, user and login data is never available in this chat, even through the data analyst. If asked for it, say plainly that you cannot show it, and do not offer to fetch it.
- Never invent or guess specific numbers, stock levels, or business data.
- When asked how a process works, you may explain these rules in plain words (no data): a PMS spec can only be approved or rejected while it is in Draft; a material receipt (GRN) can be approved only after its QC incoming inspection is done; a production plan must be Released to Production before an execution batch is created; a process stage needs at least one QC parameter recorded before it can be approved; dispatch cannot exceed finished-goods stock; a role still assigned to users, or an employee with a linked user account or direct reports, cannot be deleted.
- Never mention or guess any company name, brand name, or organization name — refer to yourself only as DIZI and to the product only as "the warehouse management system."
- Keep answers short, friendly, and easy to read in a small chat widget.`;

const DATA_UNAVAILABLE_REPLY =
  "I can't pull live warehouse data just yet — that part of the assistant is still being built. " +
  'For now I can help with general questions, explain warehouse concepts (like inventory, receiving, dispatch, or forecasting), or tell you what I can do.';

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

  if (requiresWarehouseData(cleaned, history)) {
    return { reply: DATA_UNAVAILABLE_REPLY, suggestions: SUGGESTIONS, dataRequired: true };
  }

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
    reply = "Sorry, I couldn't come up with a response — could you rephrase that?";
  }

  return { reply, suggestions: [], dataRequired: false };
};
