// Preflight checks shared by `npm run doctor` and GET /api/health. Never prints a secret, needs no network.
import { assertBindAllowed, bindHost, portProblem, scanHosts, scanKeys, DEFAULT_PORT, PORT_MIN, PORT_MAX } from './safety.js';
import { netguardSelfTest } from './netguard.js';
import { createWorld, TOOLS, STANDING_TTL_S, JIT_TTL_S } from './broker.js';
import { cast } from './cast.js';
import { createMode, realConfigured } from './mode.js';
import { loadSharedEnv } from './env.js';
import { DIAGRAM_NAMES, loadDiagram } from './diagramData.js';

export async function runChecks({ env = process.env } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 26 ? 'pass' : 'fail', `v${process.versions.node} (need >= 26)`);

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.JITL_BIND ? ' (JITL_BIND opt-in)' : ' (loopback)'}`); }
  catch (e) { add('bind', 'fail', e.message); }

  const port = env.PORT === undefined || env.PORT === '' ? DEFAULT_PORT : Number(env.PORT);
  const problem = portProblem(port);
  add('port-range', problem ? 'fail' : 'pass', problem || `${port} is inside ${PORT_MIN}-${PORT_MAX} and not reserved`);

  const shipped = JSON.stringify({ tools: TOOLS, cast: cast() });
  add('text-hosts', scanHosts(shipped).length ? 'fail' : 'pass', 'every host in shipped constants is .invalid, .example or loopback');
  add('text-keys', scanKeys(shipped).length ? 'fail' : 'pass', 'no key-looking value and no literal JWT in shipped constants');

  const ng = await netguardSelfTest();
  add('netguard', ng.ok ? 'pass' : 'fail', ng.ok ? `blocked fetch, socket, socket-by-IP, dns lookup, dns resolve, udp send and udp connect to a non-loopback host (${ng.blocked}/7)` : ng.detail);

  // the comparison must behave as written: standing survives, JIT dies, revocation kills a fresh JIT
  try {
    const w = createWorld();
    const s = await w.attack('standing', TOOLS[0].id, { captureAgeS: 3600 });
    const j = await w.attack('jit', TOOLS[0].id, { captureAgeS: 3600 });
    const ok = s.accepted === true && j.accepted === false && /expired/.test(j.why);
    add('comparison', ok ? 'pass' : 'fail', ok ? `capture + 1 h: the standing credential is still accepted (${STANDING_TTL_S / 86400} day TTL), the JIT credential (${JIT_TTL_S} s) is dead` : `comparison misbehaves: standing=${s.accepted} jit=${j.accepted}`);
    w.revokeTool(TOOLS[0].id);
    const freshRevoked = await w.attack('jit', TOOLS[0].id, { captureAgeS: 0 });
    add('revocation', freshRevoked.accepted === false ? 'pass' : 'fail', freshRevoked.accepted === false ? 'a revoked tool refuses even a fresh JIT credential' : 'revocation did not stop a fresh JIT credential');
  } catch (e) { add('comparison', 'fail', e.message); }

  try { for (const n of DIAGRAM_NAMES) loadDiagram(n); add('diagrams', 'pass', `${DIAGRAM_NAMES.length} diagram(s) are valid diagram-studio/1 data, loaded by name`); }
  catch (e) { add('diagrams', 'fail', e.message); }
  const modeState = createMode({ env });
  const e = { ...env, ...loadSharedEnv() };
  const pfReal = Boolean(e.JIT_LAB_PF_CLIENT_SECRET);
  add('mode', 'pass', realConfigured(env)
    ? `Mock and Real: ${pfReal ? 'the shared local PingFederate is configured (rule 20: probed, reused, never spawned)' : 'your PingOne tenant is configured'}; the toggle switches without a restart.`
    : 'Mock and Real toggle present; Real is not configured (set JIT_LAB_PF_CLIENT_SECRET or the PINGONE_* variables in the lab .env file), so the Real button is disabled with the how-to. Default: Mock.');
  add('tenant', 'pass', 'mock only by default: no tenant, no credentials, no outbound network (Real makes exactly the one configured issuer call)');
  if (pfReal) {
    try {
      const { realSharedPingFederate } = await import('./realPingOne.js');
      const r = await realSharedPingFederate({ env });
      add('real-mint', 'pass', `the shared PingFederate mints the standing pattern (sha256/8 only): ${r.issuer} TTL ${r.ttlSeconds}s (rule 20 reuse proven live)`);
    } catch (err) { add('real-mint', 'fail', `the shared PingFederate mint failed: ${err.message}`); }
  }
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
