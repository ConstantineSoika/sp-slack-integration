require('dotenv').config();

const express    = require('express');
const path       = require('path');
const cookieParser = require('cookie-parser');

const authRoutes     = require('./routes/auth');
const slackRoutes    = require('./routes/slack');
const webhookRoutes  = require('./routes/webhook');
const uninstallRoute = require('./routes/uninstall');
const appRoutes      = require('./routes/app');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy headers (Render / Railway)
app.set('trust proxy', 1);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the iframe app at /app
app.get('/app', (req, res) => {
  if (Object.keys(req.query).length) console.log('[app] query:', JSON.stringify(req.query));
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Routes
app.use(authRoutes);
app.use(slackRoutes);
app.use(webhookRoutes);
app.use(uninstallRoute);
app.use(appRoutes);

// Health check
app.get('/health', (_, res) => res.json({ ok: true }));

// Root — redirect to app
app.get('/', (_, res) => res.redirect('/app'));

app.listen(PORT, () => {
  console.log(`SP × Slack running on port ${PORT}`);
  console.log(`Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
});
