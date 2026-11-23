// Real PingFederate path defaults: ping-shared's PingFederate (127.0.0.1:4732), settings from the lab's own .env,
// nothing from AI-DEMO2. Stubs only: https.request is replaced, no real PingFederate or tenant is ever called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PF_ENGINE, OWN_ENV_FILE, loadSharedEnv, pfEngine } from '../src/env.js';
import { realSharedPingFederate } from '../src/realPingOne.js';
import { createMode, realConfigured } from '../src/mode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Replace https.request for one call and record what the lab would have sent.
async function withStub(fn) {
  const seen = [];
  const real = https.request;
  https.request = (url, opts, cb) => {
    const req = new EventEmitter();
    let body = '';
    req.end = (b) => {
      body = String(b ?? '');
      seen.push({ url: String(url), method: opts.method, auth: opts.headers.authorization, body });
      const res = new EventEmitter();
      res.statusCode = 200;
      cb(res);
      res.emit('data', JSON.stringify({ access_token: 'stub.token.value', expires_in: 3600, scope: 'agent:invoke:identity', token_type: 'Bearer' }));
      res.emit('end');
    };
    return req;
  };
  try { await fn(seen); } finally { https.request = real; }
}

test('the default PingFederate engine is ping-shared (127.0.0.1:4732), not an AI-DEMO2 address', () => {
  assert.equal(DEFAULT_PF_ENGINE, 'https://127.0.0.1:4732');
  assert.equal(pfEngine({}), 'https://127.0.0.1:4732');
  assert.equal(pfEngine({ JIT_LAB_PF_ENGINE: 'https://pf.example:9999' }), 'https://pf.example:9999');
});

test('Real via PingFederate posts client credentials to the default engine, and JIT_LAB_PF_ENGINE overrides it', async () => {
  await withStub(async (seen) => {
    const r = await realSharedPingFederate({ env: { JIT_LAB_PF_CLIENT_SECRET: 'stub-secret', STANDALONE_ENV: '/nonexistent' } });
    assert.equal(seen[0].url, 'https://127.0.0.1:4732/as/token.oauth2');
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].auth, `Basic ${Buffer.from('jit-lab-agent:stub-secret').toString('base64')}`);
    assert.match(seen[0].body, /grant_type=client_credentials/);
    assert.match(seen[0].body, /scope=agent%3Ainvoke%3Aidentity/);
    assert.equal(r.real, true);
    assert.equal(r.tokenBody, null, 'only a hash of the token is shown');
    assert.ok(!JSON.stringify(r).includes('stub-secret'));
    await realSharedPingFederate({ env: { JIT_LAB_PF_CLIENT_SECRET: 'stub-secret', JIT_LAB_PF_ENGINE: 'https://pf.example:9999' } });
    assert.equal(seen[1].url, 'https://pf.example:9999/as/token.oauth2');
  });
});

test('Real via PingFederate without a secret is refused (409) and points at the lab recipe, not an AI-DEMO2 or shared env file', async () => {
  const err = await realSharedPingFederate({ env: {} }).then(() => null, (e) => e);
  assert.equal(err.status, 409);
  assert.match(err.message, /docs\/pingfederate-client\.md/);
  assert.doesNotMatch(err.message, /Development\/\.env|AI-DEMO2/);
});

test('Real stays disabled with a reason when unconfigured, and enables when the PF client secret is set', () => {
  const env = { STANDALONE_ENV: '/nonexistent/settings.env' };
  if (fs.existsSync(OWN_ENV_FILE)) return; // a developer's own .env would configure Real; the cases below need it absent
  assert.equal(realConfigured(env), false);
  const info = createMode({ env }).info();
  assert.equal(info.realAvailable, false);
  assert.equal(info.source, 'mock');
  assert.match(info.realReason, /JIT_LAB_PF_CLIENT_SECRET/);
  assert.match(info.realReason, /pingfederate-client\.md/);
  assert.doesNotMatch(info.realReason, /Development\/\.env/);
  assert.equal(realConfigured({ ...env, JIT_LAB_PF_CLIENT_SECRET: 'x' }), true);
});

test('settings come from the lab own .env or STANDALONE_ENV, never from ~/Development/.env', () => {
  assert.equal(OWN_ENV_FILE, path.join(root, '.env'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-home-'));
  fs.mkdirSync(path.join(home, 'Development'));
  fs.writeFileSync(path.join(home, 'Development', '.env'), 'JIT_LAB_PF_CLIENT_SECRET=from-shared-file\n');
  const own = path.join(home, 'own.env');
  fs.writeFileSync(own, 'JIT_LAB_PF_ENGINE=https://pf.example:8443\n');
  const saved = { HOME: process.env.HOME, STANDALONE_ENV: process.env.STANDALONE_ENV };
  try {
    process.env.HOME = home;
    delete process.env.STANDALONE_ENV;
    assert.equal(loadSharedEnv().JIT_LAB_PF_CLIENT_SECRET, undefined, '~/Development/.env is not read');
    process.env.STANDALONE_ENV = own;
    assert.equal(loadSharedEnv().JIT_LAB_PF_ENGINE, 'https://pf.example:8443');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('no AI-DEMO2 PingFederate address (9031) in the Real path code, compose, settings or docs', () => {
  const files = ['server/src/env.js', 'server/src/realPingOne.js', 'server/src/netguard.js', 'server/src/mode.js', 'server/src/doctor.js',
    'docker-compose.yml', '.env.example', 'README.md', 'CLAUDE.md', 'docs/pingfederate-client.md', 'docs/shelf-entry.json'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(text, /9031/, `${f}: AI-DEMO2 PingFederate port`);
    if (f.startsWith('server/src/') && f !== 'server/src/env.js') assert.doesNotMatch(text, /Development\/\.env/, `${f}: shared env file`);
  }
});

test('the compose file defaults the engine to the host (host.docker.internal:4732) and passes the optional own .env', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /JIT_LAB_PF_ENGINE: \$\{JIT_LAB_PF_ENGINE:-https:\/\/host\.docker\.internal:4732\}/);
  assert.match(compose, /env_file:\n\s+- path: \.env\n\s+required: false/);
});
