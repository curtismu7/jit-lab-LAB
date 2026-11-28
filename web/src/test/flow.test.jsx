import { test, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import App, { MODE_LINES } from "../App.jsx";
import { mint, attack, revokeTool, requestModeSwitch, getInfo } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  getTalkTrack: vi.fn(async () => ({ talkTrack: [] })),
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
  await screen.findByTestId("mode-badge");
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
  await screen.findByTestId("mode-badge");
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
  await screen.findByTestId("mode-badge");
  const real = screen.getByRole("option", { name: "Real" });
  expect(real).toBeDisabled();
  expect(real.getAttribute("title")).toMatch(/PINGONE_ENVIRONMENT_ID/);
  expect(screen.getByTestId("mode-select").value).toBe("mock");
});

test("the Real-or-mock modal is there while loading and after, says MOCK with the lab's own line, and the old banner is gone", async () => {
  render(<App />);
  // while the catalog and info are loading the modal is already up
  expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "mock");
  await screen.findByTestId("mode-badge");
  const modal = screen.getByTestId("mode-modal");
  expect(modal).toHaveTextContent(/MOCK/);
  expect(modal).toHaveTextContent(MODE_LINES.mock);
  expect(modal).toHaveTextContent(/SIMULATED: in-process mock issuer and mock API/);
  expect(screen.queryByTestId("banner")).toBeNull();
  expect(document.querySelector(".banner")).toBeNull();
});

test("Got it on the loading page closes the modal for the session, and it stays closed when the page finishes loading", async () => {
  render(<App />);
  fireEvent.click(screen.getByTestId("mode-modal-ok")); // clicked on the loading page
  expect(screen.queryByTestId("mode-modal")).toBeNull();
  await screen.findByTestId("mode-badge");
  expect(screen.queryByTestId("mode-modal")).toBeNull();
});

test("a lab in Real shows MOCK until /api/info answers, then REAL, and the REAL line says the JIT credential stays mock teaching", async () => {
  let release; const held = new Promise((r) => { release = r; });
  getInfo.mockImplementationOnce(() => held);
  render(<App />);
  expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "mock");
  fireEvent.click(screen.getByTestId("mode-modal-ok")); // MOCK dismissed; REAL must still appear
  release({ source: "real", realAvailable: true, realReason: null, banner: "B" });
  await waitFor(() => expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "real"));
  const modal = screen.getByTestId("mode-modal");
  expect(modal).toHaveTextContent(/REAL/);
  expect(modal).toHaveTextContent(MODE_LINES.real);
  expect(modal).toHaveTextContent(/sha256\/8 hash/);
  expect(modal).toHaveTextContent(/the JIT credential stays mock teaching/);
});

