const service = require('./analyst.service');

/**
 * POST /api/analyst/query
 * Receives a natural-language question and returns a prose reply + raw table rows.
 */
exports.query = async (req, h) => {
  const { question, history } = req.payload || {};
  const result = await service.handleQuery({ question, history });
  return h.response({ success: true, data: result }).code(200);
};
