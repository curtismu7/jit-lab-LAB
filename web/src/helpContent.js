// What the Help dialog says. Plain, and as hedged as the rest of the lab (rule 2): what was measured, what is simulated, what is UNVERIFIED.
export const HELP_SECTIONS = [
  {
    heading: "What this lab is",
    body: "A long-lived agent credential is a standing risk: a captured copy stays useful until it expires. This lab mints both patterns side by side — a 30-day standing credential the agent holds and reuses, and a 300-second tool-bound just-in-time credential minted per call — then replays a captured credential at capture + minutes-to-hours. The standing one keeps being accepted the whole time; the JIT one is dead within minutes. Revoking a tool at the issuer refuses even a fresh JIT credential."
  },
  {
    heading: "Measured vs UNVERIFIED",
    body: [
      "SIMULATED (everything in Mock mode): an in-process mock issuer (HS256 fixture key) and mock API; every token is mock and labelled; the replay clock is deterministic, so no demo ever waits. The comparison itself is real logic in this process, pinned by tests: the standing credential is reused, JIT is 300 s and tool-bound, expiry is enforced by the verifier, and revocation is independent of TTL.",
      "UNVERIFIED: anything about a real issuer's revocation propagation speed or a real product's JIT issuance. Nothing here was measured on a tenant; the TTLs (30 days, 300 seconds) are the lab's illustrative choices."
    ]
  },
  {
    heading: "How to use the page",
    body: [
      "One view: Credential broker.",
      "Mint either pattern with 'Mint standing credential (30 days)' or 'Mint JIT credential (300 s)'. Under the attack panel, 'Replay the standing credential' and 'Replay the JIT credential' show who is still holding a working key — the tools table shows who is holding what right now.",
      "'Revoke this tool at the issuer' kills the tool: even a freshly minted JIT credential for it is refused. Each result tells you accepted vs refused and why. The header menu has mode, theme, font size, Present (P), Talk track, Help, version and Reset; Reset clears minted credentials, runs and revocations.",
      "The footer carries the one-line lesson: a captured credential is the question — how long does it stay useful? Standing: days. JIT: minutes."
    ]
  },
  {
    heading: "Mock vs Real honesty",
    body: "The header badge says Mock or Real, with the detail spelled out: Mock means in-process mock issuer, no tenant contacted; Real means the standing-pattern credential comes from the configured issuer — the shared local PingFederate or your own PingOne tenant (claims and a sha256/8 hash only; no secrets are displayed). If Real is not configured the button is disabled with a how-to tooltip and switching answers 409. The JIT-vs-standing replay comparison runs identically in both modes; in Real mode it still uses the mock issuer for the JIT leg."
  }
];
