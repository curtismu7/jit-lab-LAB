# JIT Ephemeral Credentials LAB

Tier: Demo
Repo: https://github.com/curtismu7/jit-lab-LAB
Catalog: D112

A long-lived agent credential is a standing risk: a captured copy stays useful until it expires. This lab mints both patterns — a 30-day standing credential the agent holds and reuses, and a 300-second tool-bound just-in-time credential minted per call — then replays the captured credential at capture + minutes-to-hours. The standing one keeps being accepted the whole time; the JIT one is dead within minutes. Revoking a tool at the issuer refuses even a fresh JIT credential.

## What is simulated

**Everything here is SIMULATED.** In Mock mode: in-process mock issuer (HS256 fixture key) and mock API; every token is mock and labelled; the replay clock is deterministic (no sleeping). Real mode mints the standing-pattern credential from your own PingOne tenant (claims and a sha256/8 hash only). The MOCK or REAL modal that opens the page says so.

## Run from a clone

```bash
npm ci
npm test          # server (node --test) + web (vitest) + repo checks
npm run doctor    # preflight: ports, hosts, netguard, the replay comparison behaves as written
npm start         # http://localhost:7570
./scripts/run.sh  # same, checks the port first
```

Endpoints: `GET /api/health`, `GET /api/catalog`, `POST /api/mint`, `POST /api/attack`, `POST /api/revoke-tool`, `POST /api/reset`, `POST /api/mode`, `GET /api/info`.

## Settings file

Real mode reads the ONE shared settings file `~/Development/.env`. Two issuers, first match wins:

1. **Shared local PingFederate (rule 20)** — `JIT_LAB_PF_CLIENT_SECRET` (client `jit-lab-agent`, scope `agent:invoke:identity`; the one-time recipe is in the `ping-shared` README). Probed, reused, never spawned.
2. **Your PingOne tenant** — `PINGONE_ENVIRONMENT_ID` + Worker client id + secret.

With neither set the Real button is disabled with a how-to tooltip and Mock answers everything. See `.env.example`.

## Ports, and what to do if the port is taken

Default 7570, allowed range 7570-7579.

```bash
lsof -iTCP:7570 -sTCP:LISTEN -n -P
PORT=<other port> npm start
```

## Mock and Real modes (rule 19)

A visible Mock / Real toggle sits in the header; pressed = current mode, switching needs no restart. Real mints the standing pattern from your tenant; the JIT-vs-standing replay comparison runs identically. Real unconfigured: the Real button is disabled with a how-to tooltip and `POST /api/mode {source:"real"}` answers 409. Default source is Real if configured, else Mock.

## Health, doctor and reset

`GET /api/health` returns `demo-health/1`. `npm run doctor` runs the same checks plus the replay comparison (standing accepted, JIT dead at capture + 1 h) and the mode toggle contract. `npm run reset` clears minted credentials, runs and revocations.

## Docker

```bash
HOST_PORT=7570 docker compose up --build -d
```

OrbStack only. Read-only container, cap-dropped, loopback publish only.

## Tests

```bash
npm test                    # server + web + repo checks
npm run content-pack        # rebuild content-pack.json
npm run mutation-check      # 7 mutants; every one must be killed
```

The suite pins: the standing credential is reused (rotating it would defeat the lesson), JIT is 300 s and tool-bound, expiry is enforced by the verifier, revocation is independent of TTL, the toggle contract, and cross-origin writes refused. `docs/architecture.md`, `docs/safety.md`, `docs/references.md` and `docs/talk-track.md` carry the details; `docs/shelf-entry.json` is the shelf registration (catalog J1, provisional).

## Troubleshooting

- **Port taken.** `PORT=<other port in 7570-7579> npm start`.
- **Real button disabled.** Set the `PINGONE_*` variables in `~/Development/.env` and restart.
- **Real run answers 502.** The tenant said no; the message carries the PingOne error verbatim (check the Worker app's grants).

## Ownership

Owned by the shelf-consolidation session (owner said go 2026-11-03). Ports 7570-7579. Catalog id J1 is provisional until the owner assigns a real one.
