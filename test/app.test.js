const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, openDatabase } = require('../server');

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-test-'));
  const dbPath = path.join(dir, 'todo.sqlite');
  const { app, db } = createApp({ dbPath, password: 'unit-test-password', sessionSecret: 'test-session-secret-that-is-long-enough' });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const makeClient = () => {
    let cookie = '';
    return async (route, options = {}) => {
       const headers = {
         ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
         ...(cookie ? { cookie } : {}),
         ...(['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method) ? { origin: base } : {}),
         ...options.headers
       };
      const response = await fetch(`${base}${route}`, { ...options, headers });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return response;
    };
  };
  let closed = false;
  t.after(async () => {
    if (!closed) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    request: makeClient(),
    newClient: makeClient,
    dbPath,
    db,
    closeServer: async () => {
      if (closed) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      closed = true;
    }
  };
}

test('auth protects APIs, isolates sessions, and login/logout uses a session', async (t) => {
  const { request, newClient } = await setup(t);
  const otherClient = newClient();
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: 'wrong' }) })).status, 401);
  const login = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: 'unit-test-password' }) });
  assert.deepEqual(await login.json(), { user: { id: 1, username: 'demo' } });
  assert.deepEqual(await (await request('/api/me')).json(), { user: { id: 1, username: 'demo' } });
  assert.equal((await otherClient('/api/me')).status, 401);
  assert.equal((await request('/api/logout', { method: 'POST' })).status, 204);
  assert.equal((await request('/api/me')).status, 401);
});

test('cross-origin state-changing requests are rejected', async (t) => {
  const { request } = await setup(t);
  const response = await request('/api/login', {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
    body: JSON.stringify({ username: 'demo', password: 'unit-test-password' })
  });
  assert.equal(response.status, 403);
  const missingOrigin = await request('/api/login', {
    method: 'POST',
    headers: { origin: '' },
    body: JSON.stringify({ username: 'demo', password: 'unit-test-password' })
  });
  assert.equal(missingOrigin.status, 403);
});

test('task CRUD and validation', async (t) => {
  const { request } = await setup(t);
  await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: 'unit-test-password' }) });
  assert.equal((await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: '  ' }) })).status, 400);
  const created = await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Buy milk', description: 'Oat' }) });
  assert.equal(created.status, 201);
  const { task } = await created.json();
  assert.equal(task.title, 'Buy milk');
  assert.equal(task.done, false);
  assert.equal((await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) })).status, 200);
  assert.equal((await (await request('/api/tasks?q=milk')).json()).tasks.some((item) => item.id === task.id), true);
  assert.equal((await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: 'yes' }) })).status, 400);
  assert.equal((await request(`/api/tasks/${task.id}`, { method: 'DELETE' })).status, 204);
});

test('tasks persist after database reopen', async (t) => {
  const { request, dbPath, db, closeServer } = await setup(t);
  await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: 'unit-test-password' }) });
  await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Persistent task' }) });
  await closeServer();
  db.close();
  const reopened = createApp({ dbPath, password: 'unit-test-password', sessionSecret: 'test-session-secret-that-is-long-enough' });
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE title = ?').get('Persistent task').n, 1);
  reopened.db.close();
});

test('an intentionally emptied database remains empty after reopen', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-empty-'));
  const dbPath = path.join(dir, 'todo.sqlite');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = openDatabase(dbPath);
  first.prepare('DELETE FROM tasks').run();
  assert.equal(first.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
  first.close();

  const reopened = openDatabase(dbPath);
  assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
  reopened.close();
});

test('search treats SQL injection payloads as literal text', async (t) => {
  const { request, dbPath } = await setup(t);
  assert.match(dbPath, /todo-test-/);
  await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'demo', password: 'unit-test-password' }) });
  const ordinarySearch = await request('/api/tasks?q=search');
  assert.equal(ordinarySearch.status, 200);
  assert.equal((await ordinarySearch.json()).tasks.length, 1);
  const response = await request("/api/tasks?q=' OR 1=1 --");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).tasks.length, 0);
});
