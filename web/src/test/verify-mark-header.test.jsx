import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import fs from "node:fs";
import path from "node:path";

vi.mock("../lib/api.js", () => ({
  getTalkTrack: vi.fn(async () => ({ talkTrack: [] })),
  requestModeSwitch: vi.fn(),
  getCatalog: vi.fn(async () => ({
    banner: "B", source: "mock",
    tools: [{ id: "get_balance", scope: "checking:read" }, { id: "transfer", scope: "transfer:write" }],
    standingTtlS: 2592000, jitTtlS: 300,
  })),
  getInfo: vi.fn(async () => ({ source: "mock", realAvailable: false, realReason: "x", banner: "B" })),
  resetServer: vi.fn(async () => ({ ok: true })),
  mint: vi.fn(), attack: vi.fn(), revokeTool: vi.fn(async () => ({ ok: true })), decodeToken: vi.fn(),
}));
import App from "../App.jsx";

// The header shows this lab's own Verified / In progress mark, read from the same /api/shelf call the Shelf link makes (through the lab-proxy
// that call reaches the shelf, whose payload lists every demo with its mark). The lab's own /api/shelf has no demos, so there is no mark then.
const mark = (status, label, extra = {}) => ({ status, label, note: "", updatedAt: "2026-11-15", source: "shipped", ...extra });
function withShelf(payload) {
  const real = globalThis.fetch;
  globalThis.fetch = (url, init) => (url === "/api/shelf" ? Promise.resolve(new Response(JSON.stringify(payload))) : real(url, init));
  return () => { globalThis.fetch = real; };
}
afterEach(() => cleanup());

describe("verification mark in the header", () => {
  it("shows this lab's own mark beside the Shelf link, and no other lab's", async () => {
    const restore = withShelf({ shelfUrl: "http://shelf.example", demos: [{ id: "other-lab", verification: mark("in-progress", "In progress") }, { id: "jit-lab", verification: mark("verified", "Verified", { note: "Mint, replay and revoke run on the mock" }) }] });
    try {
      render(<App />);
      const bar = within(await screen.findByTestId("top-menu"));
      expect(await bar.findByText("Verified")).toBeInTheDocument();
      expect(bar.getByRole("link", { name: "Shelf" })).toBeInTheDocument();
      expect(bar.queryByText("In progress")).toBeNull();
      expect(document.querySelectorAll(".verify")).toHaveLength(1);
      expect(bar.getByText("Verified").closest(".verify")).toHaveAttribute("title", expect.stringContaining("Mint, replay and revoke run on the mock"));
    } finally { restore(); }
  });

  it("shows nothing when the lab is opened on its own port (its /api/shelf has no demos) or the shelf has no mark for it", async () => {
    for (const payload of [{ shelfUrl: "http://shelf.example" }, { shelfUrl: "http://shelf.example", demos: [{ id: "jit-lab", verification: null }] }]) {
      const restore = withShelf(payload);
      try {
        const { unmount } = render(<App />);
        const bar = within(await screen.findByTestId("top-menu"));
        expect(await bar.findByRole("link", { name: "Shelf" })).toBeInTheDocument(); // the shelf answered, and still no badge
        expect(document.querySelector(".verify")).toBeNull();
        unmount();
      } finally { restore(); }
    }
  });

  it("App.jsx renders exactly one <VerifyMark id=\"jit-lab\" /> (the id in docs/shelf-entry.json)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "App.jsx"), "utf8");
    expect(src.match(/<VerifyMark\b/g)).toHaveLength(1);
    expect(src).toContain('<VerifyMark id="jit-lab" />');
    const entry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "docs", "shelf-entry.json"), "utf8"));
    expect(entry.demos[0].id).toBe("jit-lab");
  });
});
