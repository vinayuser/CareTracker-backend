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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/', routes);

app.use((req, res) => res.error(404, 'NOT_FOUND'));

app.use((error, req, res, next) => {
  return res.error(400, error.message || error);
});

const port = process.env.NODE_PORT || 3000;

const server = require('http').createServer(app);

server.listen(port, async () => {
  await connection.mongodb();
  await seedDatabase();
  console.log(`CareTraker API running on port ${port}`);
});

module.exports = app;
