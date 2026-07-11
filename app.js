require('module-alias/register');

const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

require('dotenv').config({ path: path.resolve(__dirname, 'config/.env') });

const responses = require('./common/responses');
const routes = require('./routes/index');
const connection = require('./common/connection');
const seedDatabase = require('./seed/seed');

const app = express();

app.use(
  cors({
    origin: '*',
  }),
);
app.use(cookieParser());
app.use(responses());
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));

app.get('/api/health', (req, res) => {
  const mongoReady = connection.isMongoReady();
  if (!mongoReady) {
    return res.status(503).send({
      statusCode: 503,
      message: 'Service Unavailable',
      data: { mongo: 'disconnected' },
      status: 0,
    });
  }
  return res.status(200).send({
    statusCode: 200,
    message: 'OK',
    data: { mongo: 'connected', uptime: process.uptime() },
    status: 1,
  });
});

app.use('/', routes);

app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.originalUrl}`);
  res.error(404, 'NOT_FOUND');
});

app.use((error, req, res, next) => {
  console.error('[error]', error);
  return res.error(400, error.message || error);
});

const port = Number(process.env.NODE_PORT) || 3000;
const server = require('http').createServer(app);

function registerProcessHandlers() {
  const shutdown = (signal) => {
    console.log(`${signal} received — closing server`);
    server.close(() => {
      require('mongoose').connection.close(false).then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });
}

async function start() {
  registerProcessHandlers();

  try {
    await connection.mongodb();

    // if (process.env.RUN_SEED !== 'false') {
    //   await seedDatabase();
    // }

    server.listen(port, () => {
      console.log(`CareTraker API running on port ${port} (pid ${process.pid})`);
    });
  } catch (error) {
    console.error('Failed to start API:', error);
    process.exit(1);
  }
}

start();

module.exports = app;
