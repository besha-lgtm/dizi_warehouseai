require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const Hapi = require('@hapi/hapi');
const analystRoutes = require('./modules/analyst/analyst.routes');

const start = async () => {
  const server = Hapi.server({
    port: process.env.LLM2_PORT || 4301,
    host: 'localhost',
    routes: {
      cors: {
        origin: [process.env.FRONTEND_ORIGIN || 'http://localhost:4200'],
        headers: ['Accept', 'Content-Type']
      }
    }
  });

  server.route([
    {
      method: 'GET',
      path: '/api/health',
      handler: () => ({ status: 'ok', service: 'LLM2 Analyst' })
    },
    ...analystRoutes
  ]);

  // Unified error-response shaping
  server.ext('onPreResponse', (req, h) => {
    const res = req.response;
    if (res.isBoom) {
      return h
        .response({ success: false, message: res.message })
        .code(res.output.statusCode);
    }
    return h.continue;
  });

  await server.start();
  console.log(
    'Warehouse Assistant LLM2 (Data Analyst) API running on',
    server.info.uri
  );
};

start();
