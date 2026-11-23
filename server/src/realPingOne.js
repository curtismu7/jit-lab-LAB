// Real mode: your PingOne tenant mints the standing-pattern credential (client credentials for the
// agent, TTL as configured on the app). The captured-credential replay comparison then runs the
// same way as in Mock: the standing token is still alive at capture + 1 h - the risk, shown for real.
// The JIT pattern is mock-only teaching: per-call tool-bound minting is the lab's own broker.
import { loadSharedEnv, pfEngine } from './env.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';

// ping-shared's PingFederate presents a self-signed certificate (a mkcert-signed one if you replaced it); Node does
// not read the macOS keychain, so pin a CA file when one exists (default: the mkcert root; override JIT_LAB_PF_CA).
// With no CA file the check is off, which is acceptable only because the host is local (netguard).
const pfAgent = (env) => {
  const caPath = env.JIT_LAB_PF_CA || `${process.env.HOME}/Library/Application Support/mkcert/rootCA.pem`;
  const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;
  return new https.Agent({ ca, rejectUnauthorized: Boolean(ca) });
};

// The guarded fetch (netguard) forwards to global fetch, which ignores init.agent; the POST
// goes through https.request so the CA-pinned agent is honored. Loopback only (netguard).
const postForm = (url, { headers, body, agent }) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = https.request(u, { method: 'POST', headers, agent }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json: async () => { try { return JSON.parse(data || '{}'); } catch { return {}; } } }));
  });
  req.on('error', reject);
  req.end(body);
});

const form = (obj) => new URLSearchParams(obj).toString();

// Real via the SHARED local PingFederate (rule 20: probe, reuse, never spawn a second one).
// The client `jit-lab-agent` is created once with this lab's own recipe (docs/pingfederate-client.md); its secret
// lives in the lab's own .env (JIT_LAB_PF_CLIENT_SECRET) and is never printed or committed.
export async function realSharedPingFederate({ fetchFn = fetch, env = process.env } = {}) {
  const e = { ...env, ...loadSharedEnv() };
  const clientId = e.JIT_LAB_PF_CLIENT_ID || 'jit-lab-agent';
  const secret = e.JIT_LAB_PF_CLIENT_SECRET;
  if (!secret) {
    const err = new Error('no PingFederate client secret: set JIT_LAB_PF_CLIENT_SECRET in the lab .env file (recipe: docs/pingfederate-client.md)');
    err.status = 409; throw err;
  }
  const engine = pfEngine(e);
  const r = await postForm(`${engine}/as/token.oauth2`, {
    agent: pfAgent(e),
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}` },
    body: form({ grant_type: 'client_credentials', scope: e.JIT_LAB_PF_SCOPE || 'agent:invoke:identity' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`shared PingFederate answered HTTP ${r.status}: ${j.error ?? ''} ${j.error_description ?? ''}`.trim());
  const sha8 = (t) => `sha256 ${crypto.createHash('sha256').update(t).digest('hex').slice(0, 8)} (hash only)`;
  return {
    ok: true, real: true, issuer: 'pingfederate',
    tokenSha: sha8(j.access_token), tokenBody: null,
    claims: { expires_in: j.expires_in, scope: j.scope, token_type: j.token_type },
    ttlSeconds: j.expires_in,
  };
}

export async function realStanding({ fetchFn = fetch, env = process.env } = {}) {
  const e = { ...env, ...loadSharedEnv() };
  const envId = e.PINGONE_ENVIRONMENT_ID;
  const clientId = e.PINGONE_WORKER_CLIENT_ID || e.PINGONE_WORKER_ID;
  const secret = e.PINGONE_WORKER_CLIENT_SECRET || e.PINGONE_WORKER_SECRET;
  const key = `${clientId}:${secret}`;
  const r = await fetchFn(`https://auth.pingone.com/${envId}/as/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(key).toString('base64')}` },
    body: form({ grant_type: 'client_credentials', scope: e.JIT_LAB_AGENT_SCOPE || 'agent:identity' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PingOne answered HTTP ${r.status}: ${j.error ?? ''} ${j.error_description ?? ''}`.trim());
  const sha8 = (t) => `sha256 ${crypto.createHash('sha256').update(t).digest('hex').slice(0, 8)} (hash only)`;
  return {
    ok: true, real: true,
    tokenSha: sha8(j.access_token), tokenBody: null,
    claims: { expires_in: j.expires_in, scope: j.scope, token_type: j.token_type },
    ttlSeconds: j.expires_in,
  };
}
