import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || 'vouchers.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// --- Database Initialization ---
db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    location_id INTEGER,
    FOREIGN KEY (location_id) REFERENCES locations (id)
  );

  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    is_used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS validation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    validated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES vouchers (id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (location_id) REFERENCES locations (id)
  );
`);

// Migration: Add max_uses and current_uses if they don't exist
try {
  const tableInfo = db.prepare('PRAGMA table_info(vouchers)').all() as any[];
  const hasMaxUses = tableInfo.some(col => col.name === 'max_uses');
  if (!hasMaxUses) {
    console.log('Migrating vouchers table...');
    db.prepare('ALTER TABLE vouchers ADD COLUMN max_uses INTEGER DEFAULT 1').run();
    db.prepare('ALTER TABLE vouchers ADD COLUMN current_uses INTEGER DEFAULT 0').run();
    db.prepare('UPDATE vouchers SET current_uses = 1 WHERE is_used = 1').run();
  }
} catch (e) {
  console.error('Migration failed:', e);
}

// Seed default data
const seed = () => {
  const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPw, 'admin');
  }

  const locations = ['Branch A', 'Branch B', 'Branch C'];
  const insertLoc = db.prepare('INSERT OR IGNORE INTO locations (name) VALUES (?)');
  locations.forEach(loc => insertLoc.run(loc));
};
seed();

const app = express();
app.use(express.json());
app.use(cors());

// --- API Routes ---

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user: any = db.prepare('SELECT u.*, l.name as location_name FROM users u LEFT JOIN locations l ON u.location_id = l.id WHERE username = ?').get(username);
  
  if (user && bcrypt.compareSync(password, user.password)) {
    const { password, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Admin: Manage Users
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare("SELECT u.id, u.username, u.role, u.location_id, l.name as location_name FROM users u LEFT JOIN locations l ON u.location_id = l.id").all();
  res.json(users);
});

app.post('/api/admin/users', (req, res) => {
  const { username, password, location_id } = req.body;
  const hashedPw = bcrypt.hashSync(password, 10);
  try {
    db.prepare("INSERT INTO users (username, password, role, location_id) VALUES (?, ?, 'user', ?)").run(username, hashedPw, location_id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.put('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Prevent deleting the last admin
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any).count;
    const userToDelete = db.prepare("SELECT role FROM users WHERE id = ?").get(id) as any;
    
    if (userToDelete.role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// User: History
app.get('/api/user/stats/:id', (req, res) => {
  const { id } = req.params;
  const total = db.prepare('SELECT COUNT(*) as count FROM validation_logs WHERE user_id = ?').get(id) as any;
  const today = db.prepare("SELECT COUNT(*) as count FROM validation_logs WHERE user_id = ? AND date(validated_at, '+4 hours') = date('now', '+4 hours')").get(id) as any;
  
  res.json({
    total: total.count,
    today: today.count
  });
});

app.get('/api/user/history/:id', (req, res) => {
  const { id } = req.params;
  const history = db.prepare(`
      SELECT v.code, vl.validated_at, l.name as location_name
      FROM validation_logs vl
      JOIN vouchers v ON vl.voucher_id = v.id
      JOIN locations l ON vl.location_id = l.id
      WHERE vl.user_id = ?
      ORDER BY vl.validated_at DESC
      LIMIT 50
  `).all(id);
  res.json(history);
});

app.get('/api/locations', (req, res) => {
  const locations = db.prepare('SELECT * FROM locations').all();
  res.json(locations);
});

app.post('/api/admin/locations', (req, res) => {
  const { name } = req.body;
  try {
    const result = db.prepare('INSERT INTO locations (name) VALUES (?)').run(name);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Location already exists' });
  }
});

app.put('/api/admin/locations/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    db.prepare('UPDATE locations SET name = ? WHERE id = ?').run(name, id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update location' });
  }
});

// Admin: Vouchers
app.post('/api/admin/vouchers/generate', (req, res) => {
  let { count, length, isNumeric, expiresAt, maxUses } = req.body;
  count = parseInt(count);
  length = parseInt(length) || 8;
  maxUses = parseInt(maxUses) || 1;
  
  if (isNaN(count) || count <= 0) {
    return res.status(400).json({ error: 'Invalid count' });
  }
  const insert = db.prepare('INSERT INTO vouchers (code, expires_at, max_uses) VALUES (?, ?, ?)');
  
  const generateCode = () => {
    const chars = isNumeric ? '0123456789' : 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  let expiresAtStr: string;
  if (expiresAt) {
    expiresAtStr = new Date(expiresAt).toISOString();
  } else {
    const defaultExpires = new Date();
    defaultExpires.setDate(defaultExpires.getDate() + 30);
    expiresAtStr = defaultExpires.toISOString();
  }

  let generated = 0;
  for (let i = 0; i < count; i++) {
    try {
      const code = generateCode();
      insert.run(code, expiresAtStr, maxUses);
      generated++;
      console.log(`Generated voucher: ${code}`);
    } catch (e) {
      i--; // Retry on duplicate
    }
  }
  res.json({ success: true, count: generated });
});

app.get('/api/admin/reports/usage', (req, res) => {
  const usageByDate = db.prepare(`
    SELECT date(validated_at, '+4 hours') as date, COUNT(*) as count 
    FROM validation_logs 
    GROUP BY date(validated_at, '+4 hours') 
    ORDER BY date(validated_at, '+4 hours') ASC
  `).all();
  
  const usageByLocation = db.prepare(`
    SELECT l.name, COUNT(vl.id) as count 
    FROM locations l 
    LEFT JOIN validation_logs vl ON l.id = vl.location_id 
    GROUP BY l.id
  `).all();

  res.json({ usageByDate, usageByLocation });
});

app.get('/api/admin/vouchers/export', (req, res) => {
  const vouchers = db.prepare('SELECT code, created_at, expires_at, is_used, max_uses, current_uses FROM vouchers ORDER BY created_at DESC').all() as any[];
  
  const headers = ['Code', 'Created At', 'Expires At', 'Is Fully Used', 'Uses'];
  const rows = vouchers.map(v => [
    v.code,
    v.created_at,
    v.expires_at,
    (v.is_used || v.current_uses >= v.max_uses) ? 'Yes' : 'No',
    `${v.current_uses}/${v.max_uses}`
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=vouchers.csv');
  res.send(csvContent);
});

app.get('/api/admin/dashboard', (req, res) => {
  const totalValidated = db.prepare('SELECT COUNT(*) as count FROM validation_logs').get() as any;
  const totalVouchers = db.prepare('SELECT COUNT(*) as count FROM vouchers').get() as any;
  const validationsByLoc = db.prepare(`
    SELECT l.name, COUNT(vl.id) as count 
    FROM locations l 
    LEFT JOIN validation_logs vl ON l.id = vl.location_id 
    GROUP BY l.id
  `).all();
  const recentActivity = db.prepare(`
    SELECT v.code, l.name as location, u.username, vl.validated_at 
    FROM validation_logs vl
    JOIN vouchers v ON vl.voucher_id = v.id
    JOIN locations l ON vl.location_id = l.id
    JOIN users u ON vl.user_id = u.id
    ORDER BY vl.validated_at DESC LIMIT 10
  `).all();

  const latestVouchers = db.prepare(`
    SELECT code, created_at, is_used 
    FROM vouchers 
    ORDER BY created_at DESC LIMIT 10
  `).all();

  res.json({
    totalValidated: totalValidated.count,
    totalVouchers: totalVouchers.count,
    validationsByLoc,
    recentActivity,
    latestVouchers
  });
});

// User: Validate
app.post('/api/validate', (req, res) => {
  const { code, user_id, location_id } = req.body;
  const voucher: any = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(code.toUpperCase());

  if (!voucher) {
    return res.status(404).json({ error: 'Invalid voucher code' });
  }
  
  // Check if fully used (legacy is_used OR new max_uses logic)
  if (voucher.is_used || (voucher.current_uses >= voucher.max_uses)) {
    return res.status(400).json({ error: 'Voucher has been fully redeemed' });
  }

  const now = new Date();
  if (new Date(voucher.expires_at) < now) {
    return res.status(400).json({ error: 'Voucher expired' });
  }

  // Increment usage
  const newUses = voucher.current_uses + 1;
  const isFullyRedeemed = newUses >= voucher.max_uses ? 1 : 0;

  const update = db.prepare('UPDATE vouchers SET current_uses = ?, is_used = ? WHERE id = ?');
  const log = db.prepare('INSERT INTO validation_logs (voucher_id, user_id, location_id) VALUES (?, ?, ?)');

  const transaction = db.transaction(() => {
    update.run(newUses, isFullyRedeemed, voucher.id);
    log.run(voucher.id, user_id, location_id);
  });

  transaction();
  
  const remaining = voucher.max_uses - newUses;
  res.json({ 
    success: true, 
    message: `Voucher validated successfully! (${remaining} uses remaining)` 
  });
});

// 404 for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// --- Vite Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  });

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
