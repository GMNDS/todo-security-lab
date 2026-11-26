const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const BetterSqlite3 = require('better-sqlite3');
const { isString } = require('lodash');

const USERNAME = 'demo';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? null : crypto.randomBytes(32).toString('hex'));
const PASSWORD_SALT = crypto.randomBytes(16);
const PASSWORD_LENGTH = 64;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || (IS_PRODUCTION ? null : 'demo-password');

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, PASSWORD_SALT, PASSWORD_LENGTH, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    // Sessions persist in the same SQLite database as tasks; deleting that DB clears both.
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`);
    this.getStatement = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?');
    this.setStatement = db.prepare(`INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`);
    this.destroyStatement = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStatement = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.cleanupStatement = db.prepare('DELETE FROM sessions WHERE expires <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.sess) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.setStatement.run(sid, JSON.stringify(sess), expires);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.touchStatement.run(expires, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const isFirstInitialization = !db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
  ).get();
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
    description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
    done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
    createdAt TEXT NOT NULL
  )`);
  if (isFirstInitialization) {
    const insert = db.prepare('INSERT INTO tasks (title, description, done, createdAt) VALUES (?, ?, 0, ?)');
    const now = new Date().toISOString();
    insert.run('Welcome to your todo list', 'This sample task is stored in SQLite.', now);
    insert.run('Try searching tasks', 'The search endpoint is an intentional SQL injection training fixture.', now);
  }
  return db;
}

function createApp(options = {}) {
  const password = options.password ?? DEMO_PASSWORD;
  const sessionSecret = options.sessionSecret ?? SESSION_SECRET;
  if (!password) throw new Error('DEMO_PASSWORD is required in production');
  if (!sessionSecret || (IS_PRODUCTION && sessionSecret.length < 32)) {
    throw new Error('SESSION_SECRET of at least 32 characters is required in production');
  }
  const dbPath = options.dbPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'todo.sqlite');
  const db = options.db || openDatabase(dbPath);
  const passwordHashPromise = hashPassword(password);
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(session({
    name: 'todo.sid',
    secret: sessionSecret,
    store: new SqliteSessionStore(db),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: 'auto', maxAge: 86400000 }
  }));

  // SameSite cookies are the primary CSRF mitigation; reject explicit cross-origin writes as defense in depth.
  app.use('/api', (req, res, next) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return res.status(403).json({ error: 'Origin header required' });
    try {
      const expectedOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin;
      if (new URL(origin).origin !== expectedOrigin) {
        return res.status(403).json({ error: 'Cross-origin request rejected' });
      }
    } catch {
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
    next();
  });

  app.post('/api/login', async (req, res, next) => {
    try {
      const { username, password: supplied } = req.body || {};
      if (!isString(username) || username.length > 64 || !isString(supplied) || supplied.length > 256) {
        return res.status(400).json({ error: 'Invalid username or password' });
      }
      const [actual, expected] = await Promise.all([
        hashPassword(supplied),
        passwordHashPromise
      ]);
      if (username !== USERNAME || !crypto.timingSafeEqual(actual, expected)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      req.session.regenerate((error) => {
        if (error) return next(error);
        req.session.user = { id: 1, username: USERNAME };
        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.json({ user: req.session.user });
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/logout', (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('todo.sid', { httpOnly: true, sameSite: 'strict', secure: req.secure });
      res.status(204).end();
    });
  });

  app.use('/api', (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
    next();
  });

  app.get('/api/me', (req, res) => res.json({ user: req.session.user }));

  app.get('/api/tasks', (req, res, next) => {
    const q = req.query.q === undefined ? '' : req.query.q;
    if (!isString(q) || q.length > 200) return res.status(400).json({ error: 'Invalid search query' });
    try {
      // INTENTIONAL SQLi training fixture: keep this user-controlled interpolation isolated to this query.
      const query = `SELECT id, title, description, done, createdAt FROM tasks WHERE title LIKE '%${q}%' OR description LIKE '%${q}%' ORDER BY id`;
      const tasks = db.prepare(query).all().map((task) => ({ ...task, done: Boolean(task.done) }));
      res.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks', (req, res, next) => {
    const { title, description = '' } = req.body || {};
    if (!isString(title) || title.trim().length < 1 || title.length > 200 ||
        !isString(description) || description.length > 2000) {
      return res.status(400).json({ error: 'Invalid task title or description' });
    }
    try {
      const result = db.prepare('INSERT INTO tasks (title, description, createdAt) VALUES (?, ?, ?)')
        .run(title.trim(), description, new Date().toISOString());
      const task = db.prepare('SELECT id, title, description, done, createdAt FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ task: { ...task, done: Boolean(task.done) } });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/tasks/:id', (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.done !== 'boolean' || Object.keys(req.body).length !== 1) {
      return res.status(400).json({ error: 'Invalid task update' });
    }
    try {
      const result = db.prepare('UPDATE tasks SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, id);
      if (!result.changes) return res.status(404).json({ error: 'Task not found' });
      const task = db.prepare('SELECT id, title, description, done, createdAt FROM tasks WHERE id = ?').get(id);
      res.json({ task: { ...task, done: Boolean(task.done) } });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/tasks/:id', (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid task id' });
    try {
      const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      if (!result.changes) return res.status(404).json({ error: 'Task not found' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  app.use(express.static(publicDir, { index: 'index.html', fallthrough: true }));
  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html'), (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).end();
  }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    res.status(500).json({ error: 'Internal server error' });
  });
  return { app, db };
}

if (require.main === module) {
  const { app } = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Todo app listening on port ${port}.`));
}

module.exports = { createApp, openDatabase };
