require('dotenv').config();

const cors = require('cors');
const express = require('express');
const multer = require('multer');
const { clerkMiddleware } = require('@clerk/express');
const http = require('http');
const { Server } = require('socket.io');

const analyzeRouter = require('./routes/analyze');
const alertRouter = require('./routes/alert');
const usersRouter = require('./routes/users');
const emergencyContactsRouter = require('./routes/emergencyContacts');
const emergencyAlertsRouter = require('./routes/emergencyAlerts');
const pitchHistoryRouter = require('./routes/pitchHistory');
const { registerRealtime } = require('./services/realtime');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:8080,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: { origin: allowedOrigins },
});
registerRealtime(io);
app.locals.io = io;
const port = Number(process.env.PORT) || 5000;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(clerkMiddleware());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SunoSaathi backend is running',
  });
});

app.use('/api/analyze', analyzeRouter);
app.use('/api/alert', alertRouter);
app.use('/api/users', usersRouter);
app.use('/api/emergency-contacts', emergencyContactsRouter);
app.use('/api/emergency-alerts', emergencyAlertsRouter);
app.use('/api/pitch-history', pitchHistoryRouter);


app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE'
        ? 'Audio file is too large.'
        : error.message,
    });
  }

  if (error) {
    const status = error.statusCode || 500;
    console.error(error);
    return res.status(status).json({
      success: false,
      message: status === 500 ? 'Unexpected server error.' : error.message,
    });
  }

  return next();
});

server.listen(port, () => {
  console.log(`SunoSaathi backend listening on http://localhost:${port}`);
});