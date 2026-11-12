import React, { useCallback, useEffect, useState } from "react";
import fs from "node:fs";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import { getCatalog, getInfo, requestModeSwitch, resetServer } from "./lib/api.js";
import ShelfLink from "./components/ShelfLink.jsx";
// Opened from Customer Agent LAB (UC17 routes here): strip + header Back only. Nothing is preselected.
import ReturnLink from "./return-link/ReturnLink.jsx";
import BrokerTab from "./tabs/BrokerTab.jsx";

const LAB_VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version || null; } catch { return null; } })();

export const FALLBACK_BANNER = "MOCK mode. SIMULATED: in-process mock issuer and mock API. Every token is mock and labelled. No tenant, no outbound network.";
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } };
const typing = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [theme, setTheme] = useState(() => (["light", "dark"].includes(read("jitl.theme", "")) ? read("jitl.theme", "") : "system"));
  const [present, setPresent] = useState(() => read("jitl.present", "0") === "1");
  const [fontStep, setFontStep] = useState(() => { const f = read("jitl.font", "M"); return ["S", "M", "L"].includes(f) ? f : "M"; });
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [announce, setAnnounce] = useState("");

  const loadAll = useCallback(async () => {
    const [c, i] = await Promise.all([getCatalog(), getInfo()]);
    setCatalog(c); setInfo(i);
  }, []);
  useEffect(() => { loadAll().catch((e) => setLoadError(e.message)); }, [loadAll]);
  useEffect(() => { if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (present) document.documentElement.dataset.present = "1"; else delete document.documentElement.dataset.present; }, [present]);
  useEffect(() => { applyFontSize(fontStep); write("jitl.font", fontStep); }, [fontStep]);
  useEffect(() => {
    const on = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === "p" || e.key === "P") setPresent((v) => { write("jitl.present", v ? "0" : "1"); return !v; });
      else if (e.key === "Escape") setPresent((v) => { if (v) write("jitl.present", "0"); return false; });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const onMode = useCallback(async (next) => {
    try {
      const r = await requestModeSwitch(next);
      setInfo(r);
      setAnnounce(r.message ?? `Mode: ${r.source}.`);
      const c = await getCatalog(); setCatalog(c); // reload all data after a switch (rule 19)
    } catch (e) { setAnnounce(e.message); }
  }, []);

  const banner = info?.banner ?? FALLBACK_BANNER;

  if (loadError || !catalog) {
    return (
      <>
        <a className="skip" href="#main">Skip to content</a>
        <header><p className="banner">{FALLBACK_BANNER}</p></header>
        <main className="page" id="main" tabIndex={-1}>
          {loadError ? <p className="alert" role="alert">Could not reach the lab server: {loadError}</p> : <p className="muted" role="status">Loading the credential broker...</p>}
        </main>
      </>
    );
  }

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header>
        <p className="banner" data-testid="banner">{banner}</p>
        <ReturnLink app="jit-lab" />
        <div className="head">
          <h1 className="head__title">JIT Ephemeral Credentials LAB</h1>
          <div className="head__tools">
            <ReturnLink app="jit-lab" variant="header" />
            <TopMenu
              mode={{ value: info?.source === "real" ? "real" : "mock", onChange: onMode, realAvailable: info ? info.realAvailable === true : null, realHint: info?.realReason || undefined }}
              theme={{ value: theme, onChange: (t) => { setTheme(t); try { localStorage.setItem("jitl.theme", t); } catch { /* not remembered */ } } }}
              fontSize={{ value: fontStep, onChange: setFontStep }}
              present={{ active: present, onToggle: () => setPresent((v) => { write("jitl.present", v ? "0" : "1"); return !v; }), label: "Present (P)" }}
              help={{ href: "https://github.com/curtismu7/jit-lab-LAB#readme" }}
              version={LAB_VERSION}
              onReset={async () => { await resetServer(); setHistory([]); setAnnounce("Reset."); }}
            >
              <ShelfLink />
            </TopMenu>
          </div>
        </div>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        <BrokerTab
          catalog={catalog} history={history} setHistory={setHistory}
          busy={busy} setBusy={setBusy} error={error} setError={setError}
          onNotify={setAnnounce} source={info?.source}
        />
      </main>
      <footer><p className="muted small">A captured credential is the question: how long does it stay useful? Standing: days. JIT: minutes. The tools table shows who is holding what right now.</p></footer>
      <div aria-live="polite" className="visually-hidden">{announce}</div>
    </>
  );
}
