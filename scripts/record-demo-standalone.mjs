#!/usr/bin/env node

/**
 * TabVault Comprehensive Demo Video Recorder (~90s)
 *
 * Records a full-featured demo with humanized mouse movement,
 * variable typing speed, and natural timing. Demonstrates every
 * feature including Pro activation.
 *
 * Usage:  npm run demo:record
 * Output: demo-popup.mp4
 * Requires: ffmpeg (for GIF conversion)
 */

import puppeteer from 'puppeteer-core';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXTENSION_PATH = path.resolve(ROOT, '.output/chrome-mv3');
const OUTPUT = path.resolve(ROOT, 'demo-popup.mp4');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 3456;

// ====== Video dimensions (16:9 standard) ======
const ZOOM = 1.3;
const POPUP_W = 380;
const POPUP_H = 520;
const VIEW_W = 1280;
const VIEW_H = 720;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Randomized sleep — adds ±20% jitter for natural timing */
const humanSleep = (ms) => sleep(ms * (0.82 + Math.random() * 0.38));

/** Random int in [min, max] */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ====== 3 different tab sets for variety ======
const TAB_SETS = [
  {
    tabs: [
      { id: 1, url: 'https://github.com/anthropics/claude-code', title: 'anthropics/claude-code - GitHub', favIconUrl: 'https://github.githubassets.com/favicons/favicon.svg', groupId: 1, index: 0, windowId: 1, pinned: false },
      { id: 2, url: 'https://developer.mozilla.org/en-US/docs/Web', title: 'MDN Web Docs', favIconUrl: '', groupId: 1, index: 1, windowId: 1, pinned: false },
      { id: 3, url: 'https://stackoverflow.com/questions', title: 'Stack Overflow - Questions', favIconUrl: '', groupId: 1, index: 2, windowId: 1, pinned: false },
      { id: 4, url: 'https://react.dev/learn', title: 'React - Quick Start', favIconUrl: '', groupId: 2, index: 3, windowId: 1, pinned: false },
      { id: 5, url: 'https://tailwindcss.com/docs', title: 'Tailwind CSS - Documentation', favIconUrl: '', groupId: 2, index: 4, windowId: 1, pinned: false },
      { id: 6, url: 'https://vitejs.dev/guide/', title: 'Vite - Getting Started', favIconUrl: '', groupId: 2, index: 5, windowId: 1, pinned: false },
      { id: 7, url: 'https://www.typescriptlang.org/docs/', title: 'TypeScript - Documentation', favIconUrl: '', groupId: -1, index: 6, windowId: 1, pinned: false },
    ],
    groups: [
      { id: 1, title: 'Dev Tools', color: 'blue', collapsed: false, windowId: 1 },
      { id: 2, title: 'Frontend', color: 'green', collapsed: false, windowId: 1 },
    ],
  },
  {
    tabs: [
      { id: 10, url: 'https://docs.python.org/3/', title: 'Python 3 Documentation', favIconUrl: '', groupId: 3, index: 0, windowId: 1, pinned: false },
      { id: 11, url: 'https://fastapi.tiangolo.com/', title: 'FastAPI', favIconUrl: '', groupId: 3, index: 1, windowId: 1, pinned: false },
      { id: 12, url: 'https://www.postgresql.org/docs/', title: 'PostgreSQL Documentation', favIconUrl: '', groupId: 4, index: 2, windowId: 1, pinned: false },
      { id: 13, url: 'https://redis.io/docs/', title: 'Redis Documentation', favIconUrl: '', groupId: 4, index: 3, windowId: 1, pinned: false },
      { id: 14, url: 'https://docs.docker.com/', title: 'Docker Documentation', favIconUrl: '', groupId: -1, index: 4, windowId: 1, pinned: false },
    ],
    groups: [
      { id: 3, title: 'Backend', color: 'red', collapsed: false, windowId: 1 },
      { id: 4, title: 'Database', color: 'yellow', collapsed: false, windowId: 1 },
    ],
  },
  {
    tabs: [
      { id: 20, url: 'https://www.figma.com/', title: 'Figma - Design Tool', favIconUrl: '', groupId: 5, index: 0, windowId: 1, pinned: false },
      { id: 21, url: 'https://dribbble.com/', title: 'Dribbble - Design Inspiration', favIconUrl: '', groupId: 5, index: 1, windowId: 1, pinned: false },
      { id: 22, url: 'https://fonts.google.com/', title: 'Google Fonts', favIconUrl: '', groupId: 5, index: 2, windowId: 1, pinned: false },
      { id: 23, url: 'https://coolors.co/', title: 'Coolors - Color Palette', favIconUrl: '', groupId: 6, index: 3, windowId: 1, pinned: false },
      { id: 24, url: 'https://undraw.co/', title: 'unDraw - Illustrations', favIconUrl: '', groupId: 6, index: 4, windowId: 1, pinned: false },
      { id: 25, url: 'https://css-tricks.com/', title: 'CSS-Tricks', favIconUrl: '', groupId: -1, index: 5, windowId: 1, pinned: false },
    ],
    groups: [
      { id: 5, title: 'Design', color: 'purple', collapsed: false, windowId: 1 },
      { id: 6, title: 'Assets', color: 'cyan', collapsed: false, windowId: 1 },
    ],
  },
];

// ====== Injected: Cursor overlay + Chrome API mocks ======
const INJECTED_HEAD = `
<script>
// ====== Humanized Cursor ======
(function() {
  const cursor = document.createElement('div');
  cursor.id = '__cursor';
  cursor.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:28px;height:28px;will-change:left,top;left:-50px;top:-50px;';
  cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6 2-4 6z" fill="#222" stroke="#fff" stroke-width="1.5"/></svg>';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(cursor));

  let curX = -50, curY = -50;

  // Instant position (no animation — animation is driven from Puppeteer side)
  window.__setCursor = (x, y) => {
    curX = x; curY = y;
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  };

  // Smooth multi-step move with human-like easing (called from Puppeteer)
  window.__smoothMove = (targetX, targetY) => {
    return new Promise(resolve => {
      const startX = curX, startY = curY;
      const dist = Math.hypot(targetX - startX, targetY - startY);
      const duration = Math.min(600, Math.max(250, dist * 1.2)); // 250-600ms based on distance
      const steps = Math.max(15, Math.floor(duration / 16));
      let step = 0;

      // Slight random overshoot offset (human imprecision)
      const overshootX = (Math.random() - 0.5) * 6;
      const overshootY = (Math.random() - 0.5) * 6;

      // Random control point for bezier curve (not a straight line)
      const cpX = (startX + targetX) / 2 + (Math.random() - 0.5) * dist * 0.3;
      const cpY = (startY + targetY) / 2 + (Math.random() - 0.5) * dist * 0.15;

      function animate() {
        step++;
        // Ease-out cubic
        let t = step / steps;
        let ease = 1 - Math.pow(1 - t, 3);

        // Quadratic bezier through control point
        let invEase = 1 - ease;
        let x = invEase * invEase * startX + 2 * invEase * ease * cpX + ease * ease * (targetX + overshootX * (1 - t));
        let y = invEase * invEase * startY + 2 * invEase * ease * cpY + ease * ease * (targetY + overshootY * (1 - t));

        // Add micro-jitter (1-2px random noise)
        if (t < 0.9) {
          x += (Math.random() - 0.5) * 2;
          y += (Math.random() - 0.5) * 2;
        }

        window.__setCursor(x, y);

        if (step < steps) {
          requestAnimationFrame(animate);
        } else {
          // Final snap to exact target
          window.__setCursor(targetX, targetY);
          resolve();
        }
      }
      requestAnimationFrame(animate);
    });
  };

  window.__clickEffect = (x, y) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:99998;pointer-events:none;border:2.5px solid #3B82F6;border-radius:50%;width:0;height:0;opacity:0.8;transition:all 0.4s ease-out;left:'+(x-18)+'px;top:'+(y-18)+'px;';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.width = '36px'; r.style.height = '36px'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 500);
  };
})();

// ====== Zoom + centering for wider viewport ======
document.addEventListener('DOMContentLoaded', () => {
  // Use zoom on wrapper div instead of body to avoid Puppeteer click coordinate issues
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.background = 'linear-gradient(135deg, #e8edf3 0%, #dfe6ee 50%, #e2e8f0 100%)';
  document.body.style.width = '100vw';
  document.body.style.height = '100vh';

  // Wrap root in centering container and apply zoom there
  const root = document.getElementById('root') || document.body.firstElementChild;
  if (root) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(${ZOOM});transform-origin:center center;';
    root.parentNode.insertBefore(wrapper, root);
    wrapper.appendChild(root);

    root.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)';
    root.style.borderRadius = '12px';
  }
});

// ====== Storage Engine ======
const _store = {};
const _listeners = { local: [], session: [], global: [] };
function _fireOnChanged(area, changes) {
  for (const fn of _listeners[area] || []) { try { fn(changes); } catch(e) {} }
  for (const fn of _listeners.global) { try { fn(changes, area); } catch(e) {} }
}
function _createStorageArea(area) {
  return {
    get: (keys) => new Promise(resolve => {
      const result = {};
      if (keys == null) { for (const k of Object.keys(_store)) { if (k.startsWith(area+':')) result[k.slice(area.length+1)] = _store[k]; } }
      else { const kl = typeof keys==='string'?[keys]:(Array.isArray(keys)?keys:Object.keys(keys)); for (const k of kl) { const v = _store[area+':'+k]; if (v !== undefined) result[k] = v; } }
      resolve(result);
    }),
    set: (items) => new Promise(resolve => {
      const changes = {};
      for (const [k,v] of Object.entries(items)) { const fk = area+':'+k; changes[k] = { newValue: v, oldValue: _store[fk] }; _store[fk] = v; }
      _fireOnChanged(area, changes); resolve();
    }),
    remove: (keys) => new Promise(resolve => {
      const kl = typeof keys==='string'?[keys]:keys; const changes = {};
      for (const k of kl) { const fk = area+':'+k; changes[k] = { oldValue: _store[fk] }; delete _store[fk]; }
      _fireOnChanged(area, changes); resolve();
    }),
    clear: () => new Promise(resolve => { for (const k of Object.keys(_store)) { if (k.startsWith(area+':')) delete _store[k]; } resolve(); }),
    onChanged: {
      addListener: (fn) => { _listeners[area] = _listeners[area]||[]; _listeners[area].push(fn); },
      removeListener: (fn) => { _listeners[area] = (_listeners[area]||[]).filter(f=>f!==fn); },
      hasListener: (fn) => (_listeners[area]||[]).includes(fn),
    },
  };
}
window.chrome = window.chrome || {};
chrome.storage = {
  local: _createStorageArea('local'), session: _createStorageArea('session'), sync: _createStorageArea('sync'),
  onChanged: { addListener: (fn) => _listeners.global.push(fn), removeListener: (fn) => { _listeners.global = _listeners.global.filter(f=>f!==fn); }, hasListener: (fn) => _listeners.global.includes(fn), },
};

// ====== Dynamic Tabs/Groups mock (changes per save) ======
let _currentTabSetIndex = 0;
const _allTabSets = ${JSON.stringify(TAB_SETS)};
function _getCurrentTabSet() { return _allTabSets[_currentTabSetIndex % _allTabSets.length]; }

chrome.tabs = {
  query: () => Promise.resolve(_getCurrentTabSet().tabs),
  create: (o) => Promise.resolve({ id: 99, ...o }),
  remove: () => Promise.resolve(),
  update: () => Promise.resolve({}),
  onUpdated: { addListener: () => {}, removeListener: () => {} },
  onRemoved: { addListener: () => {}, removeListener: () => {} },
};
chrome.tabGroups = {
  query: () => Promise.resolve(_getCurrentTabSet().groups),
  update: () => Promise.resolve({}),
  get: (id) => {
    const g = _getCurrentTabSet().groups.find(g => g.id === id);
    return Promise.resolve(g || _getCurrentTabSet().groups[0]);
  },
};
chrome.windows = { getCurrent:()=>Promise.resolve({id:1,focused:true,type:'normal'}), create:()=>Promise.resolve({id:2}), getAll:()=>Promise.resolve([{id:1,focused:true,type:'normal'}]) };

// ====== Runtime mock ======
chrome.runtime = {
  sendMessage: async (msg) => {
    if (msg?.type === 'SAVE_WORKSPACE') {
      const tabSet = _getCurrentTabSet();
      const gMap = {}; tabSet.groups.forEach(g => { gMap[g.id] = crypto.randomUUID(); });
      const tabs = tabSet.tabs.filter(t => !t.url.startsWith('chrome://')).map(t => ({
        url: t.url, title: t.title, favIconUrl: t.favIconUrl || '', pinned: t.pinned, index: t.index,
        groupId: t.groupId > 0 ? (gMap[t.groupId] || null) : null,
      }));
      const groups = tabSet.groups.map(g => ({ id: gMap[g.id], title: g.title, color: g.color, collapsed: g.collapsed }));
      const ws = { id: crypto.randomUUID(), name: msg.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tabs, tabGroups: groups, tabCount: tabs.length };
      const existing = (await chrome.storage.local.get('workspaces')).workspaces || [];
      await chrome.storage.local.set({ workspaces: [ws, ...existing] });
      // Rotate to next tab set for next save
      _currentTabSetIndex++;
      return { success: true, workspace: ws };
    }
    if (msg?.type === 'RESTORE_WORKSPACE') return { success: true };
    return {};
  },
  onMessage: { addListener: () => {}, removeListener: () => {} }, getURL: (p) => '/' + p, id: 'mock-ext',
};
chrome.alarms = { create:()=>{}, clear:()=>{}, get:()=>Promise.resolve(null), onAlarm:{addListener:()=>{},removeListener:()=>{}} };
chrome.commands = { onCommand:{addListener:()=>{},removeListener:()=>{}} };
window.browser = window.chrome;

// ====== Mock fetch for LemonSqueezy license validation ======
const _origFetch = window.fetch;
window.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.includes('lemonsqueezy.com/v1/licenses/validate')) {
    await new Promise(r => setTimeout(r, 800));
    return new Response(JSON.stringify({
      valid: true,
      license_key: { status: 'active' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return _origFetch(url, opts);
};
</script>
`;

function createServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/popup.html' : req.url.split('?')[0];
      const fullPath = path.join(EXTENSION_PATH, filePath);
      if (!fs.existsSync(fullPath)) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(fullPath);
      let content = fs.readFileSync(fullPath);
      if (filePath === '/popup.html') content = content.toString().replace('<head>', '<head>' + INJECTED_HEAD);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    });
    server.listen(PORT, () => { console.log(`Server: http://localhost:${PORT}`); resolve(server); });
  });
}

// ====== Humanized Interaction helpers ======

/** Get bounding box center of element */
async function getCenter(page, selector, text, exact = false) {
  return page.evaluate(({ s, t, ex }) => {
    const els = [...document.querySelectorAll(s)];
    const el = t ? (ex ? els.find(e => e.textContent?.trim() === t) : els.find(e => e.textContent?.includes(t))) : els[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { s: selector, t: text, ex: exact });
}

/** Move cursor with humanized bezier path, slight jitter, and variable speed */
async function moveTo(page, x, y) {
  await page.evaluate(({ x, y }) => window.__smoothMove(x, y), { x, y });
  // Wait for animation to complete (duration varies by distance)
  await sleep(randInt(320, 550));
}

/** Move cursor to element, pause, click with effect */
async function clickEl(page, selector, { text, exact } = {}) {
  const c = await getCenter(page, selector, text, exact);
  if (!c) { console.log(`    ⚠ Not found: ${selector} ${text || ''}`); return false; }

  // Move to target with human-like motion
  await moveTo(page, c.x, c.y);

  // Brief hesitation before clicking (humans pause to confirm target)
  await sleep(randInt(80, 200));

  await page.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
  await page.mouse.click(c.x, c.y);

  // Post-click pause (varies naturally)
  await sleep(randInt(250, 500));
  return true;
}

/** Type text with variable per-character speed */
async function humanType(page, el, text) {
  for (const char of text) {
    await el.type(char, { delay: 0 });
    // Variable delay: fast for common letters, occasional pauses
    const isSpace = char === ' ';
    const isPunctuation = '-_./'.includes(char);
    const baseDelay = isSpace ? randInt(60, 120) : isPunctuation ? randInt(80, 150) : randInt(35, 85);
    // Occasional longer pause (like thinking between words)
    const thinkPause = Math.random() < 0.08 ? randInt(120, 280) : 0;
    await sleep(baseDelay + thinkPause);
  }
}

/** Move to input, click, clear, then type with human speed */
async function typeIn(page, selector, text, { clear = false } = {}) {
  const el = await page.$(selector);
  if (!el) { console.log(`    ⚠ Input not found: ${selector}`); return false; }
  const box = await el.boundingBox();
  if (!box) return false;

  // Move to input
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(randInt(60, 150));
  await page.evaluate(({ x, y }) => window.__clickEffect(x, y), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await el.click();
  await sleep(randInt(100, 200));

  if (clear) {
    // Use native value setter to clear React controlled input (avoids default name flash)
    await page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, selector);
    await sleep(randInt(80, 150));
  }

  // Type with variable speed
  await humanType(page, el, text);
  return true;
}

/** Click a toggle switch by index with humanized movement */
async function clickToggle(page, index) {
  const toggles = await page.$$('button[role="switch"]');
  if (index >= toggles.length) return false;
  const box = await toggles[index].boundingBox();
  if (!box) return false;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await moveTo(page, c.x, c.y);
  await sleep(randInt(80, 180));
  await page.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
  await toggles[index].click();
  await humanSleep(500);
  return true;
}

// =====================================================
// MAIN RECORDING FLOW
// =====================================================

async function main() {
  if (!fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    console.error('Build not found. Run "npm run build" first.');
    process.exit(1);
  }

  console.log('=== TabVault Demo Recorder (Humanized) ===');
  console.log(`   Viewport: ${VIEW_W}x${VIEW_H} (zoom ${ZOOM}x)\n`);
  const server = await createServer();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: [`--window-size=${VIEW_W + 50},${VIEW_H + 100}`, '--no-first-run'],
  });

  try {
    const page = (await browser.pages())[0];
    await page.setViewport({ width: VIEW_W, height: VIEW_H });
    page.on('pageerror', (err) => console.log(`  [ERR] ${err.message}`));

    await page.goto(`http://localhost:${PORT}/popup.html`, { waitUntil: 'networkidle0', timeout: 15000 });
    await sleep(2500);

    // Hide system cursor
    await page.addStyleTag({ content: '* { cursor: none !important; }' });

    const recorder = new PuppeteerScreenRecorder(page, {
      fps: 30,
      videoFrame: { width: VIEW_W, height: VIEW_H },
    });
    await recorder.start(OUTPUT);
    console.log('🔴 Recording...\n');

    // ─────────────────────────────────────────────
    // Scene 1: Empty State (3s)
    // ─────────────────────────────────────────────
    console.log('Scene 1: Empty state');
    await humanSleep(3000);

    // ─────────────────────────────────────────────
    // Scene 2: Save "Frontend Research" (10s)
    //   Tab set 0: Dev Tools (blue) + Frontend (green), 7 tabs
    // ─────────────────────────────────────────────
    console.log('Scene 2: Save first workspace — "Frontend Research"');
    await clickEl(page, 'button', { text: 'Save Current' });
    await humanSleep(700);
    await typeIn(page, 'input[type="text"]', 'Frontend Research', { clear: true });
    await humanSleep(450);
    await clickEl(page, 'button', { text: 'Save', exact: true });
    await humanSleep(2200);

    // ─────────────────────────────────────────────
    // Scene 3: Expand workspace to show tabs (6s)
    // ─────────────────────────────────────────────
    console.log('Scene 3: Expand workspace to show tabs');
    await clickEl(page, 'button', { text: 'Frontend Research' });
    await humanSleep(3000);
    // Collapse
    await clickEl(page, 'button', { text: 'Frontend Research' });
    await humanSleep(1800);

    // ─────────────────────────────────────────────
    // Scene 4: Save "Backend API Docs" (10s)
    //   Tab set 1: Backend (red) + Database (yellow), 5 tabs
    // ─────────────────────────────────────────────
    console.log('Scene 4: Save second workspace — "Backend API Docs"');
    await clickEl(page, 'button', { text: 'Save Current' });
    await humanSleep(700);
    await typeIn(page, 'input[placeholder="Workspace name"]', 'Backend API Docs', { clear: true });
    await humanSleep(450);
    await clickEl(page, 'button', { text: 'Save', exact: true });
    await humanSleep(2200);

    // ─────────────────────────────────────────────
    // Scene 5: Save "Design Sprint" — hit free limit (10s)
    //   Tab set 2: Design (purple) + Assets (cyan), 6 tabs
    // ─────────────────────────────────────────────
    console.log('Scene 5: Save third workspace — "Design Sprint" (hits free limit)');
    await clickEl(page, 'button', { text: 'Save Current' });
    await humanSleep(700);
    await typeIn(page, 'input[placeholder="Workspace name"]', 'Design Sprint', { clear: true });
    await humanSleep(450);
    await clickEl(page, 'button', { text: 'Save', exact: true });
    await humanSleep(2200);

    // ─────────────────────────────────────────────
    // Scene 5b: Expand workspaces to show different tab content (12s)
    //   Shows Backend/Database tabs in workspace 2, Design/Assets in workspace 3
    // ─────────────────────────────────────────────
    console.log('Scene 5b: Expand workspaces to show different tabs');

    // Expand "Backend API Docs" to show Backend (red) + Database (yellow) tabs
    await clickEl(page, 'button', { text: 'Backend API Docs' });
    await humanSleep(2500);
    // Collapse
    await clickEl(page, 'button', { text: 'Backend API Docs' });
    await humanSleep(1000);

    // Expand "Design Sprint" to show Design (purple) + Assets (cyan) tabs
    await clickEl(page, 'button', { text: 'Design Sprint' });
    await humanSleep(2500);
    // Collapse
    await clickEl(page, 'button', { text: 'Design Sprint' });
    await humanSleep(1500);

    // ─────────────────────────────────────────────
    // Scene 6: Search (8s)
    // ─────────────────────────────────────────────
    console.log('Scene 6: Search workspaces');
    await typeIn(page, 'input[placeholder*="earch"]', 'Design');
    await humanSleep(2500);
    // Clear search
    const searchEl = await page.$('input[placeholder*="earch"]');
    if (searchEl) {
      await searchEl.click({ clickCount: 3 });
      await sleep(randInt(100, 200));
      await searchEl.press('Backspace');
    }
    await humanSleep(2000);

    // ─────────────────────────────────────────────
    // Scene 7: Rename workspace (8s)
    // ─────────────────────────────────────────────
    console.log('Scene 7: Rename workspace');
    const pencilClicked = await clickEl(page, 'button[title="Rename"]');
    if (pencilClicked) {
      await humanSleep(500);
      const renameInput = await page.$('input[class*="border-blue"]');
      if (renameInput) {
        const box = await renameInput.boundingBox();
        if (box) {
          await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
          await sleep(randInt(100, 200));
          await page.evaluate(({ x, y }) => window.__clickEffect(x, y), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        }
        await renameInput.click({ clickCount: 3 });
        await sleep(randInt(150, 250));
        await humanType(page, renameInput, 'API Reference');
        await humanSleep(700);
        await renameInput.press('Enter');
      }
    }
    await humanSleep(2200);

    // ─────────────────────────────────────────────
    // Scene 8: Settings panel (12s)
    // ─────────────────────────────────────────────
    console.log('Scene 8: Settings panel');
    await clickEl(page, 'button[title="Settings"]');
    await humanSleep(1400);

    // Toggle "Lazy load tabs" ON
    console.log('  → Toggle lazy load');
    await clickToggle(page, 0);
    await humanSleep(600);

    // Toggle "Restore in new window" OFF
    console.log('  → Toggle restore in new window');
    await clickToggle(page, 1);
    await humanSleep(600);

    // Scroll down
    await page.evaluate(() => {
      const s = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (s) s.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await humanSleep(1500);

    // Show auto-backup (disabled)
    console.log('  → Show auto-backup (Pro locked)');
    const autoBackupToggle = await page.$$('button[role="switch"][disabled]');
    if (autoBackupToggle.length > 0) {
      const box = await autoBackupToggle[0].boundingBox();
      if (box) {
        await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
        await humanSleep(1200);
      }
    }

    // Show Export/Import (disabled)
    console.log('  → Show export/import (Pro locked)');
    const disabledBtns = await page.$$('button[disabled]');
    for (const btn of disabledBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.includes('Export')) {
        const box = await btn.boundingBox();
        if (box) {
          await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
          await humanSleep(1200);
        }
        break;
      }
    }

    // Go back
    const backClicked = await clickEl(page, 'button svg.lucide-arrow-left');
    if (!backClicked) {
      await page.evaluate(() => { const btn = document.querySelector('button'); if (btn) btn.click(); });
    }
    await humanSleep(1500);

    // ─────────────────────────────────────────────
    // Scene 9: Try to save 4th — limit reached (6s)
    // ─────────────────────────────────────────────
    console.log('Scene 9: Try to save 4th workspace — limit reached');
    await clickEl(page, 'button', { text: 'Save Current' });
    await humanSleep(2500);
    // Close limit dialog
    await page.keyboard.press('Escape');
    await humanSleep(1500);

    // ─────────────────────────────────────────────
    // Scene 10: Pro Activation (15s)
    // ─────────────────────────────────────────────
    console.log('Scene 10: Pro activation');
    await clickEl(page, 'button', { text: 'Unlock Pro' });
    await humanSleep(2000);

    // Hover over "Buy Pro" button
    const buyBox = await getCenter(page, 'a', 'Buy Pro');
    if (buyBox) {
      await moveTo(page, buyBox.x, buyBox.y);
      await humanSleep(1500);
    }

    // Type license key (masked with dots for privacy)
    console.log('  → Enter license key (masked)');
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="license"]');
      if (input) input.style.webkitTextSecurity = 'disc';
    });
    await typeIn(page, 'input[placeholder*="license"]', 'TV-PRO-A1B2C3D4-E5F6');
    await humanSleep(700);

    // Click Activate
    console.log('  → Activate');
    await clickEl(page, 'button', { text: 'Activate', exact: true });
    await humanSleep(2500);

    // ─────────────────────────────────────────────
    // Scene 11: Post-Pro — save 4th workspace (8s)
    //   Tab set 0 again (rotated): Dev Tools + Frontend
    // ─────────────────────────────────────────────
    console.log('Scene 11: Save 4th workspace (Pro unlocked)');
    await humanSleep(500);
    await clickEl(page, 'button', { text: 'Save Current' });
    await humanSleep(700);
    await typeIn(page, 'input[placeholder="Workspace name"]', 'Personal Reading', { clear: true });
    await humanSleep(450);
    await clickEl(page, 'button', { text: 'Save', exact: true });
    await humanSleep(2200);

    // ─────────────────────────────────────────────
    // Scene 12: Post-Pro — settings unlocked (8s)
    // ─────────────────────────────────────────────
    console.log('Scene 12: Settings with Pro features unlocked');
    await clickEl(page, 'button[title="Settings"]');
    await humanSleep(1000);

    // Scroll down
    await page.evaluate(() => {
      const s = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (s) s.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await humanSleep(1500);

    // Toggle auto-backup ON
    console.log('  → Enable auto-backup');
    const proToggles = await page.$$('button[role="switch"]:not([disabled])');
    if (proToggles.length >= 4) {
      const box = await proToggles[3].boundingBox();
      if (box) {
        const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await moveTo(page, c.x, c.y);
        await sleep(randInt(80, 180));
        await page.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
        await proToggles[3].click();
        await humanSleep(1000);
      }
    }

    // Show Export (enabled)
    console.log('  → Show export (now enabled)');
    const exportBtn = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => b.textContent?.includes('Export') && !b.disabled);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (exportBtn) {
      await moveTo(page, exportBtn.x, exportBtn.y);
      await humanSleep(1500);
    }

    // Go back
    await page.evaluate(() => {
      const scrollEl = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (scrollEl) scrollEl.scrollTop = 0;
    });
    await sleep(300);
    const backClicked2 = await clickEl(page, 'button svg.lucide-arrow-left');
    if (!backClicked2) {
      await page.evaluate(() => { const btn = document.querySelector('button'); if (btn) btn.click(); });
    }
    await humanSleep(1500);

    // ─────────────────────────────────────────────
    // Scene 13: Restore (5s)
    // ─────────────────────────────────────────────
    console.log('Scene 13: Restore workspace');
    await clickEl(page, 'button', { text: 'Restore', exact: true });
    await humanSleep(3000);

    // ─────────────────────────────────────────────
    // Scene 14: Delete (6s)
    // ─────────────────────────────────────────────
    console.log('Scene 14: Delete workspace');
    // Use direct DOM click for trash (transform can offset small icon buttons)
    const trashPos = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const trashBtns = btns.filter(b => b.querySelector('svg.lucide-trash2, svg.lucide-trash-2'));
      const btn = trashBtns[trashBtns.length - 1];
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (trashPos) {
      await moveTo(page, trashPos.x, trashPos.y);
      await sleep(randInt(100, 200));
      await page.evaluate(({ x, y }) => window.__clickEffect(x, y), trashPos);
      // Direct DOM click to avoid coordinate mismatch under transform
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const trashBtns = btns.filter(b => b.querySelector('svg.lucide-trash2, svg.lucide-trash-2'));
        const btn = trashBtns[trashBtns.length - 1];
        if (btn) btn.click();
      });
      await humanSleep(2000);

      // Confirm delete — also use DOM click
      const deletePos = await getCenter(page, 'button', 'Delete', true);
      if (deletePos) {
        await moveTo(page, deletePos.x, deletePos.y);
        await sleep(randInt(100, 200));
        await page.evaluate(({ x, y }) => window.__clickEffect(x, y), deletePos);
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button')];
          const btn = btns.find(b => b.textContent?.trim() === 'Delete');
          if (btn) btn.click();
        });
      }
      await humanSleep(2200);
    } else {
      console.log('    ⚠ Trash button not found');
      await humanSleep(2000);
    }

    // ─────────────────────────────────────────────
    // Scene 15: End (3s)
    // ─────────────────────────────────────────────
    console.log('Scene 15: End');
    await page.evaluate(() => window.__setCursor(-50, -50));
    await humanSleep(3000);

    await recorder.stop();
    console.log('\n⏹️  Done recording.');

  } finally {
    await browser.close();
    server.close();
  }

  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  console.log(`\n✅ Video: ${OUTPUT} (${size} KB)`);
  console.log(`\nTo create GIF:\n  ffmpeg -i demo-popup.mp4 -vf "fps=12,scale=${VIEW_W}:-1:flags=lanczos" demo.gif`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
