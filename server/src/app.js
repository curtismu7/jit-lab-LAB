// One Express app. /api = the JIT lab: mint standing vs JIT credentials, replay the captured
// credential at capture + N, and watch one survive while the other is dead. Loopback Host check
// and same-origin writes everywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { hostCheck, sameOriginWrites } from './safety.js';
import { createHealth } from './health.js';
import { createWorld, TOOLS, STANDING_TTL_S, JIT_TTL_S } from './broker.js';
import { createMode, MODES } from './mode.js';
import { realStanding, realSharedPingFederate } from './realPingOne.js';
import { workspaceId } from './workspace.js';
import { DIAGRAM_NAMES, loadDiagram } from './diagramData.js';
import { TALK_INTRO, TALK_OUTRO, talkLines } from './talkTrack.js';
import { loadSharedEnv } from './env.js';
import { shelfInfo } from './shelfLink.js';

const pfConfigured = () => Boolean((process.env.JIT_LAB_PF_CLIENT_SECRET) || (loadSharedEnv().JIT_LAB_PF_CLIENT_SECRET));

const WEB_DIST = process.env.WEB_DIST || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const bad = (res, message, status = 400) => res.status(status).json({ error: status === 404 ? 'not_found' : 'bad_request', message });
export const BANNER = (source) => source === 'real'
  ? 'REAL mode: the standing-pattern credential comes from YOUR issuer (the shared local PingFederate, or your PingOne tenant; owner-configured). Only claims and a sha256/8 hash are shown. The replay comparison is the same engine.'
  : 'MOCK mode. SIMULATED: in-process mock issuer and mock API. Every token is mock and labelled. No tenant, no outbound network.';

export function createApp({ health = createHealth(), mode = createMode(), world = createWorld(), env = process.env } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use(sameOriginWrites);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });

  const api = express.Router();
  api.use(express.json({ limit: '8kb' }));
  api.use('/health', health.router);
  api.get('/shelf', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json(shelfInfo(env)); });

  api.get('/info', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ...mode.info(), banner: BANNER(mode.source()) }); });
  // Rule 19: POST /api/mode with exactly {"source": "mock"|"real"}. Real unconfigured -> 409 with the how-to.
  api.post('/mode', (req, res) => {
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 1 || !MODES.includes(b.source)) return bad(res, 'body must be exactly {"source": "mock" or "real"}');
    if (b.source === 'real' && mode.info().realAvailable !== true) return res.status(409).json({ error: 'conflict', message: mode.info().realReason });
    mode.set(b.source);
    return res.json({ ...mode.info(), banner: BANNER(mode.source()) });
  });

  api.get('/diagram', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const name = DIAGRAM_NAMES.includes(req.query.name) ? req.query.name : DIAGRAM_NAMES[0];
    return res.json(loadDiagram(name));
  });
  api.get('/talk', (req, res) => res.json({ talkTrack: [{ id: 'intro', title: 'Say first', say: TALK_INTRO }, ...talkLines(), { id: 'outro', title: 'Close', say: TALK_OUTRO }] }));
  api.get('/catalog', (_req, res) => res.json({
    banner: BANNER(mode.source()), source: mode.source(),
    tools: TOOLS, standingTtlS: STANDING_TTL_S, jitTtlS: JIT_TTL_S, workspaceId: 'default', diagrams: DIAGRAM_NAMES,
  }));

  // Mint on demand: standing (reused - that is the point) or JIT per call.
  api.post('/mint', async (req, res) => {
    const kind = req.body?.kind === 'standing' ? 'standing' : req.body?.kind === 'jit' ? 'jit' : null;
    if (!kind) return bad(res, 'kind must be standing or jit');
    try {
      if (mode.source() === 'real') {
        if (kind === 'jit') return bad(res, 'Real mints the standing pattern only; the JIT comparison is mock teaching (switch to Mock to mint a JIT credential)');
        const r = await (pfConfigured() ? realSharedPingFederate() : realStanding());
        return res.json({
          banner: BANNER(mode.source()), source: mode.source(), kind: 'standing', reused: false, ...r, workspaceId: workspaceId(req),
          ttlS: r.ttlSeconds, claims: { ...r.claims, scope: r.claims.scope || 'agent:invoke:identity (PF client restricted scope)' },
        });
      }
      const out = kind === 'standing' ? await world.standing() : await world.jit(req.body?.tool ?? TOOLS[0].id);
      return res.json({
        banner: BANNER(mode.source()), source: mode.source(), kind, workspaceId: workspaceId(req),
        token: out.token, claims: out.claims, reused: out.reused ?? false,
        ttlS: kind === 'standing' ? STANDING_TTL_S : JIT_TTL_S,
      });
    } catch (e) { return res.status(502).json({ error: 'real_unavailable', message: e.message }); }
  });

  // The attack: capture a credential, wait CAPTURE_AGE_S (mock clock), replay it.
  api.post('/attack', async (req, res) => {
    const kind = req.body?.kind === 'standing' ? 'standing' : 'jit';
    const captureAgeS = Number(req.body?.captureAgeS ?? 3600);
    if (!Number.isFinite(captureAgeS) || captureAgeS < 0 || captureAgeS > 60 * 24 * 3600) return bad(res, 'captureAgeS must be 0..86400');
    try {
      const run = await world.attack(kind, req.body?.tool ?? TOOLS[0].id, { captureAgeS });
      return res.json({ banner: BANNER(mode.source()), source: mode.source(), workspaceId: workspaceId(req), ...run });
    } catch (e) { return res.status(502).json({ error: 'real_unavailable', message: e.message }); }
  });

  api.post('/revoke-tool', (req, res) => {
    const id = String(req.body?.tool ?? '');
    if (!TOOLS.some((t) => t.id === id)) return bad(res, 'unknown tool');
    world.revokeTool(id);
    return res.json({ ok: true, note: `${id} revoked at the issuer: even a fresh JIT credential for it is refused` });
  });
  api.post('/reset', (_req, res) => { world.reset(); return res.json({ ok: true }); });

  if (fs.existsSync(WEB_DIST)) app.use(express.static(WEB_DIST));
  app.get('/favicon.ico', (_req, res) => { res.set('Content-Type', 'image/svg+xml'); res.set('Cache-Control', 'public, max-age=86400'); res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="%232f7d4f"/><path d="M8 2v7M5 6l3 3 3-3M3 13h10" stroke="white" stroke-width="2" fill="none"/></svg>'); });
  app.use('/api', api);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}
