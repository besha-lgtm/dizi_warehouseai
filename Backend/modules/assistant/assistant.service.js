const Boom = require('@hapi/boom');
const { requiresWarehouseData } = require('./intentClassifier');
const { askGemini } = require('./gemini.client');

const SYSTEM_INSTRUCTION = `You are DIZI, the AI assistant for this Warehouse Management System.
- You can greet users, explain warehouse concepts (inventory, receiving, dispatch, sales, forecasting, reporting, operations, visualization), describe your own capabilities, and answer general conversational questions.
- You do NOT have live access to warehouse data yet (no stock levels, sales figures, dispatch records, customer data, reports or charts). If the user asks for real numbers, records, reports or charts, politely explain that data-driven analysis is coming soon, and suggest a general question instead (e.g. "What can you do?" or "What is inventory?").
- Never invent or guess specific numbers, stock levels, or business data.
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

  if (requiresWarehouseData(cleaned)) {
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
