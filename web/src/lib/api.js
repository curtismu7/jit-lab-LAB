// Same origin only: every URL is a path.
export async function getJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function postJson(path, body = {}) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
  return data;
}
export const getCatalog = () => getJson("/api/catalog");
export const getInfo = () => getJson("/api/info");
// Rule 19: switch the runtime mode. Real unconfigured -> 409 with the server's how-to message.
export const requestModeSwitch = (source) => postJson("/api/mode", { source });
export const resetServer = () => postJson("/api/reset");
export const mint = (kind, tool) => postJson("/api/mint", { kind, tool });
export const attack = (kind, tool, captureAgeS) => postJson("/api/attack", { kind, tool, captureAgeS });
export const revokeTool = (tool) => postJson("/api/revoke-tool", { tool });
export const getTalkTrack = () => getJson("/api/talk");
