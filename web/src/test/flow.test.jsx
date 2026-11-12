import { test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import App, { FALLBACK_BANNER } from "../App.jsx";
import { mint, attack, revokeTool, requestModeSwitch } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  requestModeSwitch: vi.fn(async (source) => ({ source, realAvailable: false, realReason: "Set PINGONE_ENVIRONMENT_ID in ~/Development/.env", banner: "B" })),
  getCatalog: vi.fn(async () => ({
    banner: "B", source: "mock",
    tools: [{ id: "get_balance", scope: "checking:read" }, { id: "transfer", scope: "transfer:write" }],
    standingTtlS: 2592000, jitTtlS: 300,
  })),
  getInfo: vi.fn(async () => ({ source: "mock", realAvailable: false, realReason: "Set PINGONE_ENVIRONMENT_ID", banner: "B" })),
  resetServer: vi.fn(async () => ({ ok: true })),
  mint: vi.fn(), attack: vi.fn(), revokeTool: vi.fn(async () => ({ ok: true })), decodeToken: vi.fn(),
}));

test("mint standing then jit: both cards render with their TTLs", async () => {
  mint.mockImplementation(async (kind) => kind === "standing"
    ? { kind, token: "tok", claims: { scope: "checking:read transfer:write" }, ttlS: 2592000, reused: false }
    : { kind, token: "tok2", claims: { scope: "checking:read", tool: "get_balance" }, ttlS: 300 });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId("banner");
  await user.click(screen.getByTestId("mint-standing"));
  await waitFor(() => expect(screen.getByTestId("standing-card")).toBeTruthy());
  await user.click(screen.getByTestId("mint-jit"));
  await waitFor(() => expect(screen.getByTestId("jit-card")).toBeTruthy());
  expect(screen.getByTestId("standing-card")).toHaveTextContent(/30 days/);
  expect(screen.getByTestId("jit-card")).toHaveTextContent(/TTL 300s/);
});

test("the attack table shows standing accepted and jit refused at capture + 1 h", async () => {
  attack.mockImplementation(async (kind) => kind === "standing"
    ? { kind, tool: "get_balance", captureAgeS: 3600, accepted: true, why: "still valid: 30 days remain." }
    : { kind, tool: "get_balance", captureAgeS: 3600, accepted: false, why: "dead: the 300 s TTL expired 55 min before the replay." });
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId("banner");
  await user.click(screen.getByTestId("attack-standing"));
  await user.click(screen.getByTestId("attack-jit"));
  await waitFor(() => expect(screen.getByTestId("attack-table")).toBeTruthy());
  const rows = screen.getAllByTestId("attack-row");
  expect(rows.length).toBe(2);
  expect(rows[0]).toHaveTextContent("REFUSED");
  expect(rows[1]).toHaveTextContent("ACCEPTED");
});

test("rule 19: toggle present; Real disabled with the how-to when unconfigured", async () => {
  render(<App />);
  await screen.findByTestId("banner");
  const real = screen.getByRole("option", { name: "Real" });
  expect(real).toBeDisabled();
  expect(real.getAttribute("title")).toMatch(/PINGONE_ENVIRONMENT_ID/);
  expect(screen.getByTestId("mode-select").value).toBe("mock");
});

test("fallback banner mentions simulation", () => {
  expect(FALLBACK_BANNER).toMatch(/SIMULATED/i);
});
