require('dotenv').config();
const Hapi = require('@hapi/hapi');
const assistantRoutes = require('./modules/assistant/assistant.routes');

const start = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 4300,
    host: 'localhost',
    routes: {
      cors: {
        origin: [process.env.FRONTEND_ORIGIN || 'http://localhost:4200'],
        headers: ['Accept', 'Content-Type']
      }
    }
  });

  server.route([
    { method: 'GET', path: '/api/health', handler: () => ({ status: 'ok' }) },
    ...assistantRoutes
  ]);

  server.ext('onPreResponse', (req, h) => {
    const res = req.response;
    if (res.isBoom) {
      return h.response({ success: false, message: res.message }).code(res.output.statusCode);
    }
    return h.continue;
  });

  await server.start();
  console.log('Warehouse Assistant LLM1 API running on', server.info.uri);
};

start();
