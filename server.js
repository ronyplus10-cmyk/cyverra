// ═══════════════════════════════════════════════════
//  CYVERRA LLC — Real Backend Server
//  - Stores messages in messages.json (persistent)
//  - Sends email via Gmail/SMTP on every submission
//  - Admin API: GET /api/messages  (with password)
//  - Contact API: POST /api/contact
// ═══════════════════════════════════════════════════

const express    = require('express');
const cors       = require('cors');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Files ──
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const CONFIG_FILE   = path.join(__dirname, 'config.json');

// ── Init files if missing ──
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
if (!fs.existsSync(CONFIG_FILE))   fs.writeFileSync(CONFIG_FILE, JSON.stringify({
  adminPassword: 'cyverra2025',
  emailUser:     '',   // your Gmail address
  emailPass:     '',   // your Gmail app password
  emailTo:       ''    // where to receive messages
}, null, 2));

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));  // serve index.html

// ── Helpers ──
function loadMessages() {
  try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); }
  catch(e) { return []; }
}
function saveMessages(arr) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(arr, null, 2));
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch(e) { return {}; }
}

// ═══════════════════════════════════════════════════
//  POST /api/contact  — receive a message
// ═══════════════════════════════════════════════════
app.post('/api/contact', async (req, res) => {
  const { name, email, service, message } = req.body;

  // Validate
  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Invalid email' });
  }

  // Build message object
  const msg = {
    id:      Date.now(),
    name:    String(name).slice(0,200),
    email:   String(email).slice(0,200),
    service: String(service||'General Enquiry').slice(0,200),
    message: String(message).slice(0,2000),
    time:    new Date().toLocaleString(),
    read:    false
  };

  // Save to file
  const all = loadMessages();
  all.unshift(msg);
  saveMessages(all);
  console.log('[Contact] New message from', msg.name, '-', msg.email);

  // Send email if configured
  const cfg = loadConfig();
  if (cfg.emailUser && cfg.emailPass && cfg.emailTo) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: cfg.emailUser, pass: cfg.emailPass }
      });
      await transporter.sendMail({
        from:    `"Cyverra LLC Website" <${cfg.emailUser}>`,
        to:      cfg.emailTo,
        subject: `New message from ${msg.name} — Cyverra LLC`,
        html: `
          <h2 style="color:#1e3a8a;">New Contact Form Submission</h2>
          <table style="font-family:Arial;font-size:14px;border-collapse:collapse;width:100%;">
            <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;width:140px;">Name</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${msg.name}</td></tr>
            <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Email</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><a href="mailto:${msg.email}">${msg.email}</a></td></tr>
            <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Service</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${msg.service}</td></tr>
            <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Message</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${msg.message.replace(/\n/g,'<br>')}</td></tr>
            <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Time</td><td style="padding:8px;">${msg.time}</td></tr>
          </table>
          <p style="color:#64748b;font-size:12px;margin-top:20px;">Sent from Cyverra LLC website contact form.</p>
        `
      });
      console.log('[Email] Sent to', cfg.emailTo);
    } catch(err) {
      console.error('[Email] Failed:', err.message);
      // Message is still saved — email failure is not fatal
    }
  }

  res.json({ ok: true, message: 'Message received' });
});

// ═══════════════════════════════════════════════════
//  GET /api/messages  — admin inbox
// ═══════════════════════════════════════════════════
app.get('/api/messages', (req, res) => {
  const cfg  = loadConfig();
  const pass = req.headers['x-admin-password'] || req.query.p;
  if (pass !== cfg.adminPassword) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const all = loadMessages();
  res.json({ ok: true, messages: all, total: all.length });
});

// ═══════════════════════════════════════════════════
//  PATCH /api/messages/:id/read  — mark as read
// ═══════════════════════════════════════════════════
app.patch('/api/messages/:id/read', (req, res) => {
  const cfg  = loadConfig();
  const pass = req.headers['x-admin-password'];
  if (pass !== cfg.adminPassword) return res.status(401).json({ ok: false });
  const all = loadMessages();
  const msg = all.find(function(m){ return String(m.id) === req.params.id; });
  if (msg) { msg.read = true; saveMessages(all); }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
//  DELETE /api/messages/:id  — delete message
// ═══════════════════════════════════════════════════
app.delete('/api/messages/:id', (req, res) => {
  const cfg  = loadConfig();
  const pass = req.headers['x-admin-password'];
  if (pass !== cfg.adminPassword) return res.status(401).json({ ok: false });
  const all     = loadMessages();
  const filtered = all.filter(function(m){ return String(m.id) !== req.params.id; });
  saveMessages(filtered);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
//  POST /api/config  — update email/password config
// ═══════════════════════════════════════════════════
app.post('/api/config', (req, res) => {
  const cfg  = loadConfig();
  const pass = req.headers['x-admin-password'];
  if (pass !== cfg.adminPassword) return res.status(401).json({ ok: false });
  const { emailUser, emailPass, emailTo, newPassword } = req.body;
  if (emailUser !== undefined) cfg.emailUser = emailUser;
  if (emailPass !== undefined) cfg.emailPass = emailPass;
  if (emailTo   !== undefined) cfg.emailTo   = emailTo;
  if (newPassword && newPassword.length >= 8) cfg.adminPassword = newPassword;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  res.json({ ok: true });
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ ok: true, messages: loadMessages().length, time: new Date().toISOString() });
});

// ── Start ──
app.listen(PORT, function() {
  console.log('');
  console.log('  ╔════════════════════════════════════╗');
  console.log('  ║   CYVERRA LLC — Backend Running    ║');
  console.log('  ║   http://localhost:' + PORT + '             ║');
  console.log('  ╚════════════════════════════════════╝');
  console.log('');
  console.log('  Admin password: cyverra2025');
  console.log('  Messages stored in: messages.json');
  console.log('  Edit config.json to add your email');
  console.log('');
});
