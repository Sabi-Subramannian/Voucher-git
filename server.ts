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

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    location_id INTEGER,
    permissions TEXT, -- JSON array of strings
    FOREIGN KEY (location_id) REFERENCES locations (id)
  );

  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    is_used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    starts_at DATETIME,
    expires_at DATETIME,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    batch_id INTEGER,
    FOREIGN KEY (batch_id) REFERENCES batches (id)
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

// Ensure starts_at column exists for existing databases
try {
  db.prepare('ALTER TABLE vouchers ADD COLUMN starts_at DATETIME').run();
} catch (e) {
  // Column likely already exists
}

// Migration: Add permissions to users, batch_id to vouchers
try {
  const userTableInfo = db.prepare('PRAGMA table_info(users)').all() as any[];
  if (!userTableInfo.some(col => col.name === 'permissions')) {
    db.prepare('ALTER TABLE users ADD COLUMN permissions TEXT').run();
    // Default admin gets all permissions
    db.prepare("UPDATE users SET permissions = '[\"dashboard\", \"create_voucher\", \"manage_users\", \"manage_locations\", \"reports\", \"redeem\"]' WHERE role = 'admin'").run();
    // Default staff gets redeem only
    db.prepare("UPDATE users SET permissions = '[\"redeem\"]' WHERE role = 'staff'").run();
  }

  const voucherTableInfo = db.prepare('PRAGMA table_info(vouchers)').all() as any[];
  if (!voucherTableInfo.some(col => col.name === 'batch_id')) {
    db.prepare('ALTER TABLE vouchers ADD COLUMN batch_id INTEGER').run();
  }
} catch (e) {
  console.error('Migration failed:', e);
}

// Seed default data
const seed = () => {
  const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    const perms = JSON.stringify(["dashboard", "create_voucher", "manage_users", "manage_locations", "reports", "redeem"]);
    db.prepare('INSERT INTO users (username, password, role, permissions) VALUES (?, ?, ?, ?)').run('admin', hashedPw, 'admin', perms);
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
    if (userWithoutPassword.permissions) {
      userWithoutPassword.permissions = JSON.parse(userWithoutPassword.permissions);
    } else {
      userWithoutPassword.permissions = userWithoutPassword.role === 'admin' ? 
        ["dashboard", "create_voucher", "manage_users", "manage_locations", "reports", "redeem"] : ["redeem"];
    }
    res.json({ user: userWithoutPassword });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Admin: Manage Users
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare("SELECT u.id, u.username, u.role, u.location_id, u.permissions, l.name as location_name FROM users u LEFT JOIN locations l ON u.location_id = l.id").all() as any[];
  users.forEach(u => {
    if (u.permissions) u.permissions = JSON.parse(u.permissions);
  });
  res.json(users);
});

app.post('/api/admin/users', (req, res) => {
  const { username, password, location_id, role, permissions } = req.body;
  const hashedPw = bcrypt.hashSync(password, 10);
  const permsJson = JSON.stringify(permissions || (role === 'admin' ? ["dashboard", "create_voucher", "manage_users", "manage_locations", "reports", "redeem"] : ["redeem"]));
  try {
    db.prepare("INSERT INTO users (username, password, role, location_id, permissions) VALUES (?, ?, ?, ?, ?)").run(username, hashedPw, role || 'user', location_id, permsJson);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.put('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { username, role, permissions, password, location_id } = req.body;
  try {
    if (password) {
      const hashedPw = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET username = ?, password = ?, role = ?, permissions = ?, location_id = ? WHERE id = ?').run(username, hashedPw, role, JSON.stringify(permissions), location_id, id);
    } else {
      db.prepare('UPDATE users SET username = ?, role = ?, permissions = ?, location_id = ? WHERE id = ?').run(username, role, JSON.stringify(permissions), location_id, id);
    }
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

// Admin: Batches
app.get('/api/admin/batches', (req, res) => {
  const batches = db.prepare(`
    SELECT b.*, COUNT(v.id) as voucher_count 
    FROM batches b 
    LEFT JOIN vouchers v ON b.id = v.batch_id 
    GROUP BY b.id 
    ORDER BY b.created_at DESC
  `).all();
  res.json(batches);
});

app.post('/api/admin/batches', (req, res) => {
  const { name } = req.body;
  try {
    const result = db.prepare('INSERT INTO batches (name) VALUES (?)').run(name);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create batch' });
  }
});

app.put('/api/admin/batches/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    db.prepare('UPDATE batches SET name = ? WHERE id = ?').run(name, id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update batch' });
  }
});

app.delete('/api/admin/batches/:id', (req, res) => {
  const { id } = req.params;
  try {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM vouchers WHERE batch_id = ?').run(id);
      db.prepare('DELETE FROM batches WHERE id = ?').run(id);
    });
    transaction();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete batch' });
  }
});

// Admin: Vouchers
app.post('/api/admin/vouchers/generate', (req, res) => {
  let { count, length, isNumeric, startsAt, expiresAt, maxUses, batchId, batchName } = req.body;
  count = parseInt(count);
  length = parseInt(length) || 8;
  maxUses = parseInt(maxUses) || 1;
  
  if (isNaN(count) || count <= 0) {
    return res.status(400).json({ error: 'Invalid count' });
  }

  let finalBatchId = batchId;
  if (batchName && !finalBatchId) {
    const result = db.prepare('INSERT INTO batches (name) VALUES (?)').run(batchName);
    finalBatchId = result.lastInsertRowid;
  }

  const insert = db.prepare('INSERT INTO vouchers (code, starts_at, expires_at, max_uses, batch_id) VALUES (?, ?, ?, ?, ?)');
  
  const generateCode = () => {
    const chars = isNumeric ? '0123456789' : 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const startsAtStr = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
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
      insert.run(code, startsAtStr, expiresAtStr, maxUses, finalBatchId);
      generated++;
    } catch (e) {
      i--; // Retry on duplicate
    }
  }
  res.json({ success: true, count: generated, batchId: finalBatchId });
});

app.get('/api/admin/vouchers/batch/:id', (req, res) => {
  const { id } = req.params;
  const vouchers = db.prepare('SELECT * FROM vouchers WHERE batch_id = ? ORDER BY created_at DESC').all(id);
  res.json(vouchers);
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
  const vouchers = db.prepare('SELECT code, created_at, starts_at, expires_at, is_used, max_uses, current_uses FROM vouchers ORDER BY created_at DESC').all() as any[];
  
  const headers = ['Code', 'Created At', 'Valid From', 'Expires At', 'Is Fully Used', 'Uses'];
  const rows = vouchers.map(v => [
    v.code,
    v.created_at,
    v.starts_at,
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
  const { startDate, endDate, batchId, locationId, search } = req.query;
  
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) {
    whereClause += ' AND vl.validated_at >= ?';
    params.push(new Date(startDate as string).toISOString());
  }
  if (endDate) {
    whereClause += ' AND vl.validated_at <= ?';
    params.push(new Date(endDate as string).toISOString());
  }
  if (batchId) {
    whereClause += ' AND v.batch_id = ?';
    params.push(batchId);
  }
  if (locationId) {
    whereClause += ' AND vl.location_id = ?';
    params.push(locationId);
  }
  if (search) {
    whereClause += ' AND v.code LIKE ?';
    params.push(`%${search}%`);
  }

  // Statistics
  const totalValidated = db.prepare(`
    SELECT COUNT(*) as count 
    FROM validation_logs vl
    JOIN vouchers v ON vl.voucher_id = v.id
    ${whereClause}
  `).get(...params) as any;

  const totalVouchers = db.prepare('SELECT COUNT(*) as count FROM vouchers').get() as any;

  const validationsByLoc = db.prepare(`
    SELECT l.name, COUNT(filtered_vl.id) as count 
    FROM locations l 
    LEFT JOIN (
      SELECT vl.location_id, vl.id
      FROM validation_logs vl
      JOIN vouchers v ON vl.voucher_id = v.id
      ${whereClause}
    ) filtered_vl ON l.id = filtered_vl.location_id
    GROUP BY l.id
  `).all(...params);

  const recentActivity = db.prepare(`
    SELECT v.code, l.name as location, u.username, vl.validated_at 
    FROM validation_logs vl
    JOIN vouchers v ON vl.voucher_id = v.id
    JOIN locations l ON vl.location_id = l.id
    JOIN users u ON vl.user_id = u.id
    ${whereClause}
    ORDER BY vl.validated_at DESC LIMIT 20
  `).all(...params);

  // Latest Vouchers (filtered by batch and search if provided)
  let voucherWhere = 'WHERE 1=1';
  const vParams: any[] = [];
  if (batchId) {
    voucherWhere += ' AND v.batch_id = ?';
    vParams.push(batchId);
  }
  if (search) {
    voucherWhere += ' AND v.code LIKE ?';
    vParams.push(`%${search}%`);
  }

  const latestVouchers = db.prepare(`
    SELECT v.code, v.created_at, v.is_used, v.starts_at, v.expires_at, b.name as batch_name
    FROM vouchers v
    LEFT JOIN batches b ON v.batch_id = b.id
    ${voucherWhere}
    ORDER BY v.created_at DESC LIMIT 15
  `).all(...vParams);

  // Extra Analytics: Daily Trend (Last 7 days)
  const dailyTrend = db.prepare(`
    SELECT date(vl.validated_at, '+4 hours') as date, COUNT(*) as count
    FROM validation_logs vl
    JOIN vouchers v ON vl.voucher_id = v.id
    ${whereClause}
    GROUP BY date
    ORDER BY date DESC LIMIT 7
  `).all(...params);

  // Extra Analytics: Top Batches
  const topBatches = db.prepare(`
    SELECT b.name, COUNT(vl.id) as count
    FROM batches b
    JOIN vouchers v ON b.id = v.batch_id
    JOIN validation_logs vl ON v.id = vl.voucher_id
    ${whereClause}
    GROUP BY b.id
    ORDER BY count DESC LIMIT 5
  `).all(...params);

  res.json({
    totalValidated: totalValidated.count,
    totalVouchers: totalVouchers.count,
    validationsByLoc,
    recentActivity,
    latestVouchers,
    dailyTrend,
    topBatches
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
  if (voucher.starts_at && new Date(voucher.starts_at) > now) {
    return res.status(400).json({ error: 'Voucher is not yet valid' });
  }
  if (voucher.expires_at && new Date(voucher.expires_at) < now) {
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
