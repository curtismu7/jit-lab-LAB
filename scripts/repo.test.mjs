// Repo-level checks: content pack, shelf entry, docs truth, hygiene, CI shape, the pre-commit hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePack } from './validate-content-pack.mjs';
import { buildPack } from './build-content-pack.mjs';
import { MUTATIONS } from './mutation-check.mjs';
import { portProblem, scanHosts, scanKeys } from '../server/src/safety.js';
import { renderTalkTrackMarkdown, talkLines } from '../server/src/talkTrack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tracked = () => {
  try { return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !/package-lock\.json$/.test(f) && fs.existsSync(path.join(ROOT, f))); }
  catch { return fs.readdirSync(ROOT, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !/node_modules|(^|\/)\.|dist|package-lock|attic/.test(e.name) && !/node_modules|attic|dist/.test(e.parentPath ?? '')).map((e) => path.join(e.parentPath ?? '', e.name).replace(ROOT + '/', '')); }
};

test('content pack validates and is in sync with the scenario data', () => {
  const pack = JSON.parse(read('content-pack.json'));
  assert.deepEqual(validatePack(pack), []);
  assert.deepEqual(pack, buildPack(), 'run: node scripts/build-content-pack.mjs');
  assert.deepEqual(pack.cards.map((c) => c.id.replace('tool-', '')), JSON.parse(read('server/data/scenarios.json')).tools.map((t) => t.id));
  assert.equal(pack.demo.doctor, '/api/health');
});

test('content pack validation rejects a broken pack', () => {
  const pack = buildPack();
  pack.cards[0].terms = ['no-such-term'];
  assert.ok(validatePack(pack).some((e) => /unknown term/.test(e)));
  delete pack.glossary;
  assert.ok(validatePack(pack).length > 0);
});

test('shelf entry matches the demo: id, provisional catalog E12, port, health path, loopback url, portable composeFile', () => {
  const [d] = JSON.parse(read('docs/shelf-entry.json')).demos;
  assert.equal(d.id, 'jit-lab');
  assert.equal(d.catalogId, 'D112');
  assert.equal(d.kind, 'Demo');
  assert.equal(d.healthPath, '/api/health');
  const u = new URL(d.url);
  assert.equal(u.hostname, 'localhost');
  assert.equal(portProblem(Number(u.port)), null);
  assert.equal(JSON.parse(read('content-pack.json')).demo.baseUrl, d.url);
  assert.ok(!path.isAbsolute(d.composeFile), 'composeFile must be relative');
  assert.ok(!d.composeFile.includes('..'));
  assert.equal(d.composeFile, 'jit-lab/docker-compose.yml', 'the repo folder name, relative to the demo root');
  assert.ok(!/\/Users\/|\/home\//.test(read('docs/shelf-entry.json')));
});

test('README is true: default port, commands exist, endpoints are real, files exist', () => {
  const readme = read('README.md');
  const pkg = JSON.parse(read('package.json'));
  for (const s of ['doctor', 'test', 'reset', 'mutation-check', 'content-pack']) { assert.ok(pkg.scripts[s], s); assert.ok(readme.includes(s === 'test' ? 'npm test' : `npm run ${s}`), s); }
  for (const f of ['scripts/run.sh', 'docs/architecture.md', 'docs/safety.md', 'docs/references.md', 'docs/talk-track.md', 'content-pack.json', 'docs/shelf-entry.json']) { assert.ok(readme.includes(f), f); assert.ok(fs.existsSync(path.join(ROOT, f)), f); }
  assert.match(readme, /localhost:7570/);
  const app = read('server/src/app.js');
  for (const m of readme.matchAll(/`(?:GET|POST|PUT)? ?(\/api\/[a-z/-]+)/g)) {
    const route = m[1].replace(/^\/api/, '');
    assert.ok(app.includes(`'${route}'`), `README documents ${m[1]} but app.js has no ${route}`);
  }
  for (const p of new Set([...readme.matchAll(/localhost:(\d{4,5})/g)].map((m) => Number(m[1])))) assert.equal(portProblem(p), null, String(p));
  assert.match(readme, /\*\*Everything here is SIMULATED\.\*\*/);
  assert.match(readme, /PORT=<other port in 7570-7579> npm start|PORT=<other port> npm start/);
  assert.equal(JSON.parse(read('server/data/scenarios.json')).tools.length, 3);
});

test('docs/safety.md labels the simulated model and has the UNVERIFIED section', () => {
  const doc = read('docs/safety.md');
  assert.match(doc, /## What is simulated/);
  assert.match(doc, /deterministic feature scorer/);
  assert.match(doc, /## UNVERIFIED/);
  assert.doesNotMatch(doc, /Jev (scores|achieves|delivers)/i);
});

test('docs/references.md marks every product claim UNVERIFIED', () => {
  const doc = read('docs/references.md');
  assert.match(doc, /UNVERIFIED/);
  assert.match(doc, /verified in part/);
});

test('every banner-bearing surface says what is simulated and names the mode (placeholder page, API banner and the page fallback)', () => {
  assert.match(read('web/index.html'), /MOCK mode\. SIMULATED/);
  assert.match(read('server/src/app.js'), /MOCK mode\. SIMULATED/);
  assert.match(read('web/src/App.jsx'), /FALLBACK_BANNER = "MOCK mode\. SIMULATED/);
});

test('hygiene: every host in every tracked text file is reserved, no keys or literal JWTs, no tenant-looking ids, no mermaid', () => {
  for (const f of tracked().filter((x) => !/\.(png|ico|woff2?)$/.test(x) && !x.startsWith('node_modules/'))) {
    const text = read(f);
    if (f !== 'scripts/repo.test.mjs') {
      assert.deepEqual(scanHosts(text).filter((h) => !/^(www\.rfc-editor\.org|json-schema\.org|github\.com|raw\.githubusercontent\.com|www\.w3\.org|auth\.pingone\.com|api\.pingone\.com|0\.0\.0\.0|192\.0\.2\.\d+|localhost.*|127\.0\.0\.1.*|local\.ping-devops\.com)$/.test(h) && !h.includes('$')), [], `${f}: real host`);
      assert.deepEqual(scanKeys(text), [], `${f}: key or literal JWT`);
    }
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(text), `${f}: uuid-shaped id`);
    if (f !== 'scripts/repo.test.mjs') assert.ok(!/mermaid/i.test(text), `${f}: mermaid`);
  }
});

test('hygiene: .env is ignored, no .env committed, gitleaks pre-commit hook is executable', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.ok(!tracked().includes('.env'));
  const hook = path.join(ROOT, '.githooks/pre-commit');
  assert.ok(fs.statSync(hook).mode & 0o111, 'hook not executable');
  assert.match(fs.readFileSync(hook, 'utf8'), /gitleaks protect --staged/);
  assert.match(read('package.json'), /core\.hooksPath \.githooks/);
});

test('the CI workflow is GitHub-hosted, Node 26 only, and has build, test, doctor, forbidden-identifier and gitleaks jobs', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.ok(!/self-hosted/.test(ci));
  const versions = [...ci.matchAll(/node-version: (\S+)/g)].map((m) => m[1]);
  assert.ok(versions.length >= 3 && versions.every((v) => v === '26'), versions.join());
  for (const job of ['build:', 'test:', 'doctor:', 'forbidden-strings:', 'gitleaks:']) assert.ok(ci.includes(`  ${job}`), job);
  assert.match(ci, /secrets\.FORBIDDEN_STRINGS/);
  assert.match(ci, /actions\/checkout@v5/);
  assert.match(ci, /PORT=7579 npm run doctor/);
});

test('Node 26 everywhere: engines, .nvmrc, both Docker stages', () => {
  assert.equal(JSON.parse(read('package.json')).engines.node, '>=26');
  assert.equal(read('.nvmrc').trim(), '26');
  assert.equal((read('Dockerfile').match(/^FROM node:26-alpine/gm) || []).length, 2);
});

test('the talk track is generated from the scenario data and the committed file has not drifted', () => {
  assert.equal(read('docs/talk-track.md'), renderTalkTrackMarkdown(), 'run: npm run talk-track');
  for (const l of talkLines()) assert.ok(read('docs/talk-track.md').includes(l.title), l.title);
});

test('README follows the README standard: title ends in LAB, plain Tier and Repo and Catalog lines, the 12 sections in order, the port text', () => {
  const r = read('README.md');
  assert.match(r.split('\n')[0], /^# .* LAB$/);
  assert.match(r, /^Tier: Demo$/m);
  assert.match(r, /^Repo: https:\/\/github\.com\/curtismu7\/jit-lab-LAB$/m);
  assert.match(r, /^Catalog: D112/m);
  const heads = [...r.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const want = ['What is simulated', 'Run from a clone', 'Settings file', 'Ports, and what to do if the port is taken', 'Mock and Real modes', 'Health, doctor and reset', 'Docker', 'Tests', 'Troubleshooting', 'Ownership'];
  const at = want.map((w) => heads.findIndex((h) => h.startsWith(w)));
  assert.ok(at.every((i) => i >= 0), at.join());
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'sections are in the standard order');
  assert.match(r, /lsof -iTCP:7570 -sTCP:LISTEN -n -P/);
  assert.ok(!/ping-devops|cmuir|curtismu/i.test(r.replace(/^Repo: .*$/m, "")), "only the Repo line may name the org");
});

test('app CSS follows the CSS standard and the shared stylesheet loads first', () => {
  const css = read('web/src/app.css');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css), 'no colour literal');
  assert.ok(!/prefers-color-scheme/.test(css)); assert.ok(!/!important/.test(css)); assert.ok(!/font-style:\s*italic/.test(css));
  const widths = [...css.matchAll(/@media \((?:max|min)-width: (\d+)px\)/g)].map((m) => m[1]);
  assert.ok(widths.length > 0 && widths.every((w) => w === '600' || w === '900'), widths.join());
  assert.ok(!/purple|violet|magenta|indigo/i.test(css));
  const main = read('web/src/main.jsx');
  assert.ok(main.indexOf('standalone-ui.css') > 0 && main.indexOf('standalone-ui.css') < main.indexOf('app.css'));
  assert.match(read('web/src/styles/standalone-ui.css'), /standalone-ui\.css: the shared UI standard/);
});

test('no per-app settings loader, no bare MODE, no k8s manifests, no password field in the web code', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'k8s')) && !fs.existsSync(path.join(ROOT, 'deploy')));
  for (const f of tracked().filter((x) => /\.(m?js|jsx)$/.test(x) && x !== 'scripts/repo.test.mjs')) {
    const t = read(f);
    assert.ok(!/loadEnvFile/.test(t), `${f}: a per-app .env loader`);
    assert.ok(!/\benv\.MODE\b/.test(t), `${f}: a bare MODE variable`);
    assert.ok(!/type="password"/.test(t), `${f}: a password field`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, '.env')));
});

test('the forbidden-strings list is never read or embedded by the repo', () => {
  for (const f of tracked().filter((x) => x !== '.github/workflows/ci.yml' && x !== 'scripts/repo.test.mjs')) assert.ok(!read(f).includes('forbidden-strings'), `${f} mentions the forbidden-strings list`);
});

test('every mutation names a real file, and each rule the lesson needs is pinned', () => {
  for (const [label, file] of MUTATIONS) assert.ok(fs.existsSync(path.join(ROOT, 'server/src', file)), `${label}: ${file}`);
});

test('no crypto.generateKeyPairSync anywhere (aborts under GC on Node 20 here)', () => {
  for (const f of tracked().filter((x) => /\.(m?js|jsx)$/.test(x) && x !== 'scripts/repo.test.mjs')) assert.ok(!/generateKeyPair/.test(read(f)), f);
});

test('workspaces are server and web; ports in every file are in 7570-7579 (or loopback docs)', () => {
  assert.deepEqual(JSON.parse(read('package.json')).workspaces, ['server', 'web']);
  const forbidden = [5000, 8080, 5173, 3900, 4000, 4400, 4510, 4840];
  for (const f of ['README.md', 'docker-compose.yml', 'Dockerfile', '.env.example', 'docs/shelf-entry.json']) for (const p of read(f).replace(/^\s*SHELF_URL:.*$/m, '').matchAll(/(?:localhost|127\.0\.0\.1):(\d{4,5})/g)) assert.ok(!forbidden.includes(Number(p[1])), `${f}: ${p[0]}`);
});

test('talk track covers every scenario id or title keyword', () => {
  const doc = read('docs/talk-track.md');
  for (const l of MUTATIONS) assert.ok(fs.existsSync(path.join(ROOT, 'server/src', l[1])), `${l[0]}: ${l[1]}`);
});
