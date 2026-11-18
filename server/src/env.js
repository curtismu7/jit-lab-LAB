// The lab's own settings file: `.env` beside docker-compose.yml (or the file named by STANDALONE_ENV).
// Read-only, never returned, never logged: only whether the Real-mode variables exist. A bare MODE is NOT read.
// Never ~/Development/.env or any AI-DEMO2 file (rulebook "Settings per app").
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const OWN_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

// The PingFederate runtime (engine) the PF Real path calls: ping-shared's own PingFederate by default
// (host port 4732, https, self-signed certificate). Override with JIT_LAB_PF_ENGINE (Docker: host.docker.internal).
export const DEFAULT_PF_ENGINE = 'https://127.0.0.1:4732';
export const pfEngine = (e) => e.JIT_LAB_PF_ENGINE || DEFAULT_PF_ENGINE;

const CANDIDATES = () => {
  const list = [];
  if (process.env.STANDALONE_ENV) list.push(process.env.STANDALONE_ENV);
  list.push(OWN_ENV_FILE);
  return list;
};

export function loadSharedEnv() {
  for (const f of CANDIDATES()) {
    try {
      const text = fs.readFileSync(f, 'utf8');
      const out = {};
      for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      return out;
    } catch { /* next candidate */ }
  }
  return {};
}
