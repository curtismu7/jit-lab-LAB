# Real mode with PingFederate: create the `jit-lab-agent` client

Status: **UNVERIFIED.** The lab's code and tests use stubs only. These steps use PingFederate's documented admin
API, but nobody has run them end to end for this lab. If a step fails, create the same objects in the admin console.

Real mode asks a PingFederate to mint the standing-pattern credential with the OAuth 2.0 client-credentials grant
(RFC 6749 section 4.4). It needs a client called `jit-lab-agent` and its secret. The lab never creates the client
and never calls PingFederate with admin rights. You do it once, here.

## Which PingFederate

By default the lab calls the PingFederate that `ping-shared` runs: runtime `https://127.0.0.1:4732`, admin
`https://127.0.0.1:4731`. Start it from the AI-DEMO-Standalone checkout (it needs your own PingFederate licence at
`~/.config/demo-kit/pingfederate.lic` and you accept Ping's terms):

```bash
shared/ping-shared/scripts/ping-shared.sh up pingfederate
```

To use another PingFederate, set `JIT_LAB_PF_ENGINE` (its runtime base URL) in the lab's `.env`. There is no built-in
default for any other host.

## What to create

| Object | Value |
|---|---|
| Client ID | `jit-lab-agent` (override the name with `JIT_LAB_PF_CLIENT_ID`) |
| Grant type | Client Credentials only |
| Client authentication | Client secret (HTTP Basic at the token endpoint) |
| Scope | `agent:invoke:identity` (a common scope; override with `JIT_LAB_PF_SCOPE`), restricted to this client |
| Access token manager | any existing one (the lab only reads `expires_in` and `scope`, and shows a hash of the token) |

## Steps (admin API)

Run from a shell that can read the PingFederate administrator login. The login is saved by the ping-shared setup in
`~/.config/demo-kit/provisioning.json` (mode 600); never paste it on a command line or into a file in this repo.

```bash
PF_ADMIN=https://127.0.0.1:4731/pf-admin-api/v1
pfcurl() { # administrator login read from the provisioning file, passed to curl on stdin
  node -e 'const p=JSON.parse(require("fs").readFileSync(process.env.HOME+"/.config/demo-kit/provisioning.json","utf8")).pingfederate;process.stdout.write(`user = "${p.username}:${p.password}"\n`)' \
    | curl -sk -K - -H 'X-XSRF-Header: PingFederate' -H 'Content-Type: application/json' "$@"
}

# 1. the scope
pfcurl -X POST "$PF_ADMIN/oauth/authServerSettings/scopes/commonScopes" \
  -d '{"name":"agent:invoke:identity","description":"jit-lab: invoke as the agent identity"}'

# 2. pick an access token manager id (the "id" field of one entry)
pfcurl "$PF_ADMIN/oauth/accessTokenManagers"

# 3. the client, with a generated secret that goes straight into the lab's .env (never echoed)
SECRET="$(openssl rand -base64 32)"
pfcurl -X POST "$PF_ADMIN/oauth/clients" -d "{
  \"clientId\": \"jit-lab-agent\", \"name\": \"JIT lab agent\",
  \"grantTypes\": [\"CLIENT_CREDENTIALS\"],
  \"clientAuth\": {\"type\": \"SECRET\", \"secret\": \"$SECRET\"},
  \"defaultAccessTokenManagerRef\": {\"id\": \"<id from step 2>\"},
  \"restrictScopes\": true, \"restrictedScopes\": [\"agent:invoke:identity\"]
}" -o /dev/null -w '%{http_code}\n'      # expect 201
printf 'JIT_LAB_PF_CLIENT_SECRET=%s\n' "$SECRET" >> .env && chmod 600 .env; unset SECRET
```

Never loop on a 401 from the admin API: repeated failed administrator logins lock the account.

## Then

1. `.env` in the lab folder (beside `docker-compose.yml`; `.env.example` lists the names) now has
   `JIT_LAB_PF_CLIENT_SECRET`. Restart the lab; the Real button enables.
2. In Docker the engine is not on the container's loopback: the compose file defaults `JIT_LAB_PF_ENGINE` to
   `https://host.docker.internal:4732`. Host-run (`npm start`) uses `https://127.0.0.1:4732`.
3. `npm run doctor` makes one token call to the configured PingFederate when the secret is set (owner-run; agents never
   use live credentials).

The secret is write-only: the lab never returns or logs it, and the page shows claims plus a sha256/8 hash of the token
only. The JIT pattern stays Mock-only teaching.
