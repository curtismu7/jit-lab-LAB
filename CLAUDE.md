# jit-lab — JIT Ephemeral Credentials LAB (catalog J1 provisional, Demo tier)

Standing vs just-in-time credentials for an agent, and the only question that matters: how long does a captured credential stay useful. Mint a 30-day standing credential once (the lab reuses it on every mint, visibly), or a 300-second tool-bound JIT credential per call. Replay the captured copy; the standing one keeps working, the JIT one is dead. Revoking a tool at the issuer refuses even a fresh JIT credential.

Follow the rulebook at `~/Development/STANDALONE-RULES.md`.

## Real and Mock (rule 19)

- **Mock** (default when Real is not configured): in-process mock issuer (HS256 fixture key) and mock API; deterministic replay clock (exp shifted, no sleeping). Fully offline.
- **Real**: the standing-pattern credential is minted by **ping-shared's PingFederate** (default `https://127.0.0.1:4732`, `JIT_LAB_PF_ENGINE` overrides; reused, never spawned; client `jit-lab-agent`, recipe `docs/pingfederate-client.md`, UNVERIFIED), or by your PingOne tenant if PF is not configured. Settings are the lab's own `.env` beside the compose file, never `~/Development/.env`. Only claims and a sha256/8 hash are shown. The replay comparison runs identically and honestly shows the standing risk for real. The JIT pattern is mock-only teaching.
- Header toggle POSTs `/api/mode {source}`; default Real if configured else Mock; Real unconfigured answers 409 with the how-to.

## Non-negotiables

- Loopback bind only (`JITL_BIND` opt-in; Docker publishes `127.0.0.1:` only), Host check, same-origin writes.
- Mock: zero outbound (netguard, self-test at boot). Real: exactly the configured PingOne call.
- Pinned behaviours (each has a mutation): standing is reused on mint (rotating it would defeat the lesson), JIT is 300 s and tool-bound, the verifier enforces expiry, revocation is independent of TTL.
- Node 26 only.

## Module map

- `server/src/broker.js` — the two credential patterns, the replay attack, revocation.
- `server/src/jwt.js` — HS256 fixture signer/verifier with a configurable clock.
- `server/src/realPingOne.js` — the Real-mode tenant client (owner-configured).
- `server/src/app.js` — `/api/mint`, `/api/attack`, `/api/revoke-tool`, `/api/mode`, `/api/catalog`.
- `web/src/tabs/BrokerTab.jsx` — the one screen: mints, the capture-age slider, the replay table.

## Verify before claiming done

```bash
npm ci && npm test && npm run doctor && npm run mutation-check && npm run build -w web
```

Then drive the real page (port 7570): mint both, replay each at capture + 1 h, drag the slider to 5 min (the JIT dies at exactly 300 s), revoke the tool and show a fresh JIT refused.
