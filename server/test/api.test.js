import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMode } from '../src/mode.js';

const call = async (app, method, path, body, extraHeaders = {}) => {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } finally { await new Promise((r) => server.close(r)); }
};
const mk = () => createApp({ mode: createMode({ forceMock: true }) });

test('health returns demo-health/1 ready', async () => {
  const app = mk();
  for (let i = 0; i < 20 && (await call(app, 'GET', '/api/health')).json.state !== 'ready'; i++) await new Promise((r) => setTimeout(r, 100));
  const r = await call(app, 'GET', '/api/health');
  assert.equal(r.json.schema, 'demo-health/1');
  assert.equal(r.json.state, 'ready');
});

test('mint standing: reused second time; mint jit: fresh per call with tool scope', async () => {
  const app = mk();
  const s1 = await call(app, 'POST', '/api/mint', { kind: 'standing' });
  const s2 = await call(app, 'POST', '/api/mint', { kind: 'standing' });
  assert.equal(s1.json.ttlS, 30 * 24 * 3600);
  assert.equal(s2.json.reused, true);
  const j = await call(app, 'POST', '/api/mint', { kind: 'jit', tool: 'transfer' });
  assert.equal(j.json.ttlS, 300);
  assert.equal(j.json.claims.tool, 'transfer');
});

test('attack: standing accepted at capture + 1 h; jit refused', async () => {
  const app = mk();
  const s = await call(app, 'POST', '/api/attack', { kind: 'standing', captureAgeS: 3600 });
  assert.equal(s.json.accepted, true);
  const j = await call(app, 'POST', '/api/attack', { kind: 'jit', captureAgeS: 3600 });
  assert.equal(j.json.accepted, false);
});

test('revoke-tool: a fresh JIT for the revoked tool is refused', async () => {
  const app = mk();
  await call(app, 'POST', '/api/revoke-tool', { tool: 'get_balance' });
  const r = await call(app, 'POST', '/api/attack', { kind: 'jit', tool: 'get_balance', captureAgeS: 0 });
  assert.equal(r.json.accepted, false);
  assert.match(r.json.why, /revoked/);
});

test('bad inputs are refused: unknown kind, bad captureAgeS, unknown tool', async () => {
  const app = mk();
  assert.equal((await call(app, 'POST', '/api/mint', { kind: 'nope' })).status, 400);
  assert.equal((await call(app, 'POST', '/api/attack', { kind: 'jit', captureAgeS: -5 })).status, 400);
  assert.equal((await call(app, 'POST', '/api/mint', { kind: 'jit', tool: 'nope' })).status, 502);
});

test('rule 19: default mock; real 409 with how-to; switch back; body shape enforced', async () => {
  const app = mk();
  const info = (await call(app, 'GET', '/api/info')).json;
  assert.equal(info.source, 'mock');
  assert.equal(info.realAvailable, false);
  assert.match(info.realReason, /PINGONE_ENVIRONMENT_ID/);
  assert.equal((await call(app, 'POST', '/api/mode', { source: 'real' })).status, 409);
  assert.equal((await call(app, 'POST', '/api/mode', { source: 'mock' })).status, 200);
  assert.equal((await call(app, 'POST', '/api/mode', { source: 'live' })).status, 400);
  assert.equal((await call(app, 'POST', '/api/mode', { source: 'mock', extra: 1 })).status, 400);
});

test('real mode configured: default source is real, switching needs no restart', async () => {
  const m = createMode({ env: { PINGONE_ENVIRONMENT_ID: 'x', PINGONE_WORKER_CLIENT_ID: 'y', PINGONE_WORKER_CLIENT_SECRET: 'z' } });
  assert.equal(m.info().source, 'real');
  m.set('mock');
  assert.equal(m.info().source, 'mock');
});

test('cross-origin write is refused', async () => {
  const r = await call(mk(), 'POST', '/api/mint', { kind: 'jit' }, { origin: 'http://evil.invalid' });
  assert.equal(r.status, 403);
});

test('GET /api/shelf answers the shelf URL (null when unconfigured)', async () => {
  const r = await call(createApp({ mode: createMode({ forceMock: true }), env: {} }), 'GET', '/api/shelf');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json), ['shelfUrl']);
  assert.equal(r.json.shelfUrl, null);
});

test('GET /api/shelf is reachable with no web build: returns the SHELF_URL (trailing slash trimmed); POST is not 200', async () => {
  const app = createApp({ mode: createMode({ forceMock: true }), env: { STANDALONE_ENV: '/nonexistent/settings.env', SHELF_URL: 'https://shelf.example:8443/' } });
  const got = await call(app, 'GET', '/api/shelf');
  assert.equal(got.status, 200);
  assert.deepEqual(got.json, { shelfUrl: 'https://shelf.example:8443' });
  assert.notEqual((await call(app, 'POST', '/api/shelf', {})).status, 200);
});
