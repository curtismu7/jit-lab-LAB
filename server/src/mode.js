// Mock / Real. Rule 19: runtime server-side mode, POST /api/mode with exactly {source}, GET /api/info
// returns {source, realAvailable, realReason}. Default: Real if configured, else Mock.
// Real = your own PingOne tenant mints the standing-pattern credential (owner-configured Worker);
// the JIT-vs-standing attack comparison runs identically. The lab's own .env carries the
// credentials; the secret is write-only, never returned.
import { loadSharedEnv } from './env.js';

export const MODES = ['mock', 'real'];

export const PF_ONLY = (e) => Boolean(e.JIT_LAB_PF_CLIENT_SECRET);

export function realConfigured(env = process.env) {
  const e = { ...env, ...loadSharedEnv() };
  const pingone = Boolean(e.PINGONE_ENVIRONMENT_ID && (e.PINGONE_WORKER_CLIENT_ID || e.PINGONE_WORKER_ID) && (e.PINGONE_WORKER_CLIENT_SECRET || e.PINGONE_WORKER_SECRET));
  return pingone || PF_ONLY(e);
}

export function realReason(env = process.env) {
  const e = { ...env, ...loadSharedEnv() };
  if (PF_ONLY(e)) return null;
  const pingone = Boolean(e.PINGONE_ENVIRONMENT_ID && (e.PINGONE_WORKER_CLIENT_ID || e.PINGONE_WORKER_ID) && (e.PINGONE_WORKER_CLIENT_SECRET || e.PINGONE_WORKER_SECRET));
  return pingone ? null : 'Real mode is not configured. Either the PingFederate client secret (JIT_LAB_PF_CLIENT_SECRET in the lab .env file; recipe in docs/pingfederate-client.md) or PINGONE_ENVIRONMENT_ID + the Worker app client id + secret. Then restart the lab. Agents never use live credentials; the owner sets them.';
}

export const NO_REAL = 'Real mode is not configured. Either the PingFederate client secret (JIT_LAB_PF_CLIENT_SECRET in the lab .env file; recipe in docs/pingfederate-client.md) or PINGONE_ENVIRONMENT_ID + the Worker app client id + secret. Then restart the lab. Agents never use live credentials; the owner sets them.';

export function createMode({ env = process.env, forceMock = false } = {}) {
  const canReal = !forceMock && realConfigured(env);
  const state = { source: canReal ? 'real' : 'mock' };
  return {
    info: () => ({ source: state.source, realAvailable: canReal, realReason: canReal ? null : realReason(env) ?? NO_REAL }),
    source: () => state.source,
    set: (source) => { state.source = source; },
  };
}
