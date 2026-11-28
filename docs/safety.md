# Safety

- Loopback bind only unless `JITL_BIND` is set on purpose. Docker publishes `127.0.0.1:` only.
- Host header must be a loopback name (DNS-rebinding defence); writes must be same-origin.
- Zero outbound calls: the netguard blocks fetch, socket, DNS and UDP to non-loopback hosts and self-tests at startup. The lab calls no LLM API.
- Every host in shipped text is reserved (`.invalid` / `.example` / `example.com`); the doctor checks this on every run.
- No key-looking strings and no literal JWTs in shipped text; scanKeys enforces it.
- No tenant, no credentials, no real identifiers. Reset is epoch-bump only; the lab holds no personal state.

## What is simulated

**The decision model.** It is a deterministic feature scorer (override phrasing, sensitive targets, urgency, new-payee, gift-card, off-topic markers), pinned by tests and mutation checks. It is not Jev, not a neural network, not an API. The UI labels every model score SIMULATED and the MOCK modal that opens the page says so. No claim is made about any product's accuracy, latency or cost.

## UNVERIFIED

Vendor claims about real decision-model products (latency, cost, behaviour) are NOT reproduced or verified here. This lab teaches the shape of the decision — typed verdicts vs prose, score-as-policy-input, the two mistake kinds — with its own simulated scorer.
