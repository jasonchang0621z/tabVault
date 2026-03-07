#!/usr/bin/env node

/**
 * TabVault Demo Recorder v2 — Real Extension + macOS Screen Capture
 *
 * Launches Chromium with the real extension loaded, opens real tabs with
 * tab groups. Records the full browser window (including real tab bar)
 * using macOS screencapture. Requires screen recording permission for Terminal.
 *
 * All Chrome APIs work natively — no mocking required.
 * The only mock is for LemonSqueezy license validation.
 *
 * Usage:  npm run demo:record
 * Output: demo-popup.mp4
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXTENSION_PATH = path.resolve(ROOT, '.output/chrome-mv3');
const TEMP_DIR = path.resolve(ROOT, '.demo-temp');
const FRAMES_DIR = path.resolve(TEMP_DIR, 'frames');
const OUTPUT = path.resolve(ROOT, 'demo-popup.mp4');
const WIN_W = 1280;
const WIN_H = 800;
const ZOOM = 1.3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const humanSleep = (ms) => sleep(ms * (0.82 + Math.random() * 0.38));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ====== Tab data for realistic demo ======
const DEMO_TABS = [
  { title: 'anthropics/claude-code — GitHub', group: 'Dev Tools', groupColor: 'blue' },
  { title: 'MDN Web Docs', group: 'Dev Tools', groupColor: 'blue' },
  { title: 'Stack Overflow — Questions', group: 'Dev Tools', groupColor: 'blue' },
  { title: 'React — Quick Start', group: 'Frontend', groupColor: 'green' },
  { title: 'Tailwind CSS — Docs', group: 'Frontend', groupColor: 'green' },
  { title: 'Vite — Getting Started', group: 'Frontend', groupColor: 'green' },
  { title: 'TypeScript — Documentation', group: null, groupColor: null },
];

// =====================================================
// CHROME + EXTENSION HELPERS
// =====================================================

async function launchChrome() {
  // Use puppeteer's bundled Chromium (Chrome stable blocks --load-extension).
  // Remove --disable-extensions from default args to allow extension loading.
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      `--window-size=${WIN_W},${WIN_H}`,
      '--window-position=100,100',
      `--load-extension=${EXTENSION_PATH}`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
    ],
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
  });

  await sleep(3000);
  return browser;
}

/** Wait for OUR extension's service worker target with retries.
 *  Our SW file is background.js (from WXT build). */
async function waitForServiceWorker(browser, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const targets = await browser.targets();
    // Match our extension specifically: background.js (WXT output)
    const sw = targets.find(t =>
      t.type() === 'service_worker' &&
      t.url().includes('chrome-extension://') &&
      t.url().includes('background.js')
    );
    if (sw) return sw;

    // Debug: show all extension-related targets
    if (i === 0) {
      const extTargets = targets.filter(t => t.url().includes('chrome-extension://'));
      if (extTargets.length > 0) {
        console.log(`  Extension targets found but not matching background.js:`);
        for (const t of extTargets) {
          console.log(`    type=${t.type()} url=${t.url()}`);
        }
      }
    }

    console.log(`  Waiting for service worker... (${i + 1}/${maxRetries})`);
    await sleep(1000);
  }
  return null;
}

/** Get extension ID from service worker URL */
function getExtensionId(swTarget) {
  const url = swTarget.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  return match ? match[1] : null;
}

/**
 * Create tabs and group them. Uses service worker to create tabs one-by-one
 * and captures the returned tab ID directly (avoids serialization issues with
 * worker.evaluate when querying tab properties).
 */
async function setupTabs(browser, sw, tabsData) {
  const worker = await sw.worker();

  // Build group map: groupName -> { color, tabIds }
  const groups = new Map();

  // Create tabs one by one via service worker, capturing returned tab ID
  for (const tab of tabsData) {
    const html = `<html><head><title>${tab.title}</title></head><body style="background:#f8f9fa;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#666;font-size:1.5rem;">${tab.title}</body></html>`;
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    // Create tab and get its ID directly from the return value
    const tabIdStr = await worker.evaluate(async (url) => {
      const t = await chrome.tabs.create({ url, active: false });
      return String(t.id); // Return as string to avoid serialization issues
    }, dataUrl);
    const tabId = parseInt(tabIdStr, 10);

    if (tab.group && tabId) {
      if (!groups.has(tab.group)) {
        groups.set(tab.group, { color: tab.groupColor, tabIds: [] });
      }
      groups.get(tab.group).tabIds.push(tabId);
    }

    console.log(`    ✓ Tab ${tabId}: ${tab.title.slice(0, 30)}...`);
    await sleep(200);
  }

  // Create tab groups
  // Note: chrome.tabGroups may not be directly accessible in worker.evaluate().
  // We use the background script's own context instead via CDP Runtime.evaluate.
  const swPage = await sw.worker();
  for (const [groupName, { color, tabIds }] of groups) {
    try {
      // Step 1: Group the tabs
      const groupIdStr = await worker.evaluate(async (ids) => {
        const gid = await chrome.tabs.group({ tabIds: ids });
        return String(gid);
      }, tabIds);
      const groupId = parseInt(groupIdStr, 10);

      // Step 2: Update group metadata using CDP Runtime.evaluate on the SW target
      // This accesses the full chrome.tabGroups API in the actual SW context
      const swSession = await sw.createCDPSession();
      await swSession.send('Runtime.evaluate', {
        expression: `chrome.tabGroups.update(${groupId}, { title: ${JSON.stringify(groupName)}, color: ${JSON.stringify(color)}, collapsed: false })`,
        awaitPromise: true,
      });
      await swSession.detach();

      console.log(`    ✓ Group "${groupName}" (${color}): ${tabIds.length} tabs`);
    } catch (e) {
      console.log(`    ⚠ Failed to create group "${groupName}": ${e.message}`);
    }
    await sleep(300);
  }

  // Close initial about:blank / newtab
  try {
    const tabCountStr = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      for (const t of tabs) {
        // We can't read url due to serialization, but index 0 is usually the initial tab
        if (t.index === 0) {
          await chrome.tabs.remove(t.id);
          break;
        }
      }
      return String(tabs.length);
    });
    console.log(`    Total tabs: ${tabCountStr}`);
  } catch {}

  console.log(`  ✓ Created ${tabsData.length} tabs in ${groups.size} groups`);
}

/**
 * Open popup.html as a tab via the service worker (to avoid navigation restrictions).
 * The service worker creates the tab using chrome.tabs.create with the extension URL.
 * Returns the Puppeteer Page for the popup tab.
 */
async function openPopupAsTab(browser, swTarget) {
  const worker = await swTarget.worker();

  // Use the service worker to create a tab pointing to popup.html
  const popupUrl = await worker.evaluate(async () => {
    const url = chrome.runtime.getURL('popup.html');
    await chrome.tabs.create({ url, active: true });
    return url;
  });
  console.log(`  Popup URL: ${popupUrl}`);

  await sleep(2000);

  // Find the popup page target
  const targets = await browser.targets();
  const popupTarget = targets.find(t =>
    t.type() === 'page' && t.url().includes('popup.html')
  );

  if (!popupTarget) {
    console.log('  ⚠ Could not find popup page target');
    // List all targets for debugging
    for (const t of targets) {
      console.log(`    type=${t.type().padEnd(20)} url=${t.url()}`);
    }
    return null;
  }

  const popupPage = await popupTarget.page();
  await sleep(1000);

  return popupPage;
}

// =====================================================
// POPUP INTERACTION HELPERS
// =====================================================

async function injectCursorAndZoom(page) {
  await page.evaluate((zoom) => {
    // ====== Cursor ======
    const cursor = document.createElement('div');
    cursor.id = '__cursor';
    cursor.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:28px;height:28px;will-change:left,top;left:-50px;top:-50px;';
    cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 8-6 2-4 6z" fill="#222" stroke="#fff" stroke-width="1.5"/></svg>';
    document.body.appendChild(cursor);

    window.__setCursor = (x, y) => { cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; };

    window.__smoothMove = (targetX, targetY) => {
      return new Promise(resolve => {
        const startX = parseFloat(cursor.style.left) || 0;
        const startY = parseFloat(cursor.style.top) || 0;
        const dist = Math.hypot(targetX - startX, targetY - startY);
        const duration = Math.min(600, Math.max(250, dist * 1.2));
        const steps = Math.max(15, Math.floor(duration / 16));
        let step = 0;
        const overshootX = (Math.random() - 0.5) * 6;
        const overshootY = (Math.random() - 0.5) * 6;
        const cpX = (startX + targetX) / 2 + (Math.random() - 0.5) * dist * 0.3;
        const cpY = (startY + targetY) / 2 + (Math.random() - 0.5) * dist * 0.15;
        function animate() {
          step++;
          let t = step / steps;
          let ease = 1 - Math.pow(1 - t, 3);
          let invEase = 1 - ease;
          let x = invEase * invEase * startX + 2 * invEase * ease * cpX + ease * ease * (targetX + overshootX * (1 - t));
          let y = invEase * invEase * startY + 2 * invEase * ease * cpY + ease * ease * (targetY + overshootY * (1 - t));
          if (t < 0.9) { x += (Math.random() - 0.5) * 2; y += (Math.random() - 0.5) * 2; }
          window.__setCursor(x, y);
          if (step < steps) { requestAnimationFrame(animate); }
          else { window.__setCursor(targetX, targetY); resolve(); }
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

    // ====== Hide system cursor ======
    document.head.appendChild(Object.assign(document.createElement('style'), {
      textContent: '* { cursor: none !important; }'
    }));

    // ====== Zoom + centering (offset down for tab bar) ======
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = 'linear-gradient(135deg, #e8edf3 0%, #dfe6ee 50%, #e2e8f0 100%)';
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';

    const root = document.getElementById('root') || document.body.firstElementChild;
    if (root) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(${zoom});transform-origin:center center;`;
      root.parentNode.insertBefore(wrapper, root);
      wrapper.appendChild(root);
      root.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)';
      root.style.borderRadius = '12px';
    }
  }, ZOOM);
}

async function injectLemonSqueezyMock(page) {
  await page.evaluate(() => {
    const _origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (typeof url === 'string' && url.includes('lemonsqueezy.com/v1/licenses/validate')) {
        await new Promise(r => setTimeout(r, 800));
        return new Response(JSON.stringify({ valid: true, license_key: { status: 'active' } }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return _origFetch(url, opts);
    };
  });
}

async function getCenter(page, selector, text, exact = false) {
  return page.evaluate(({ s, t, ex }) => {
    const els = [...document.querySelectorAll(s)];
    const el = t ? (ex ? els.find(e => e.textContent?.trim() === t) : els.find(e => e.textContent?.includes(t))) : els[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { s: selector, t: text, ex: exact });
}

async function moveTo(page, x, y) {
  await page.evaluate(({ x, y }) => window.__smoothMove(x, y), { x, y });
  await sleep(randInt(320, 550));
}

async function clickEl(page, selector, { text, exact } = {}) {
  const c = await getCenter(page, selector, text, exact);
  if (!c) { console.log(`    ⚠ Not found: ${selector} ${text || ''}`); return false; }
  await moveTo(page, c.x, c.y);
  await sleep(randInt(80, 200));
  await page.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
  await page.mouse.click(c.x, c.y);
  await sleep(randInt(250, 500));
  return true;
}

async function humanType(page, el, text) {
  for (const char of text) {
    await el.type(char, { delay: 0 });
    const isSpace = char === ' ';
    const isPunct = '-_./'.includes(char);
    const baseDelay = isSpace ? randInt(60, 120) : isPunct ? randInt(80, 150) : randInt(35, 85);
    const thinkPause = Math.random() < 0.08 ? randInt(120, 280) : 0;
    await sleep(baseDelay + thinkPause);
  }
}

async function typeIn(page, selector, text, { clear = false } = {}) {
  const el = await page.$(selector);
  if (!el) { console.log(`    ⚠ Input not found: ${selector}`); return false; }
  const box = await el.boundingBox();
  if (!box) return false;
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(randInt(60, 150));
  await page.evaluate(({ x, y }) => window.__clickEffect(x, y), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await el.click();
  await sleep(randInt(100, 200));
  if (clear) {
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
  await humanType(page, el, text);
  return true;
}

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

  // Puppeteer's bundled Chromium is ~v107. Temporarily lower minimum_chrome_version
  // in the built manifest so the extension loads (production stays at 116).
  const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const origMinVersion = manifest.minimum_chrome_version;
  if (origMinVersion && parseInt(origMinVersion) > 105) {
    manifest.minimum_chrome_version = '105';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    console.log(`  Patched minimum_chrome_version: ${origMinVersion} → 105 (for Chromium)`);
  }

  console.log('=== TabVault Demo Recorder v2 (Real Extension) ===\n');

  // Step 1: Launch Chrome with extension
  console.log('Step 1: Launching Chrome with extension...');
  const browser = await launchChrome();

  try {
    // Step 2: Wait for extension service worker
    console.log('Step 2: Finding extension service worker...');
    const swTarget = await waitForServiceWorker(browser);
    if (!swTarget) {
      console.error('Service worker not found. Aborting.');
      process.exit(1);
    }
    const extensionId = getExtensionId(swTarget);
    console.log(`  ✓ Extension ID: ${extensionId}`);

    // Step 3: Create demo tabs with groups
    console.log('Step 3: Setting up demo tabs...');
    await setupTabs(browser, swTarget, DEMO_TABS);
    await sleep(1000);

    // Step 4: Open popup as a tab via service worker
    console.log('Step 4: Opening popup page...');
    const popupPage = await openPopupAsTab(browser, swTarget);
    // Wait for React to render
    await sleep(2000);
    await injectCursorAndZoom(popupPage);
    await injectLemonSqueezyMock(popupPage);
    await sleep(1500);

    // Step 5: Get Chromium window ID for screencapture
    console.log('Step 5: Getting Chromium window ID...');
    let cgWindowId;
    try {
      const swiftScript = `
import CoreGraphics
if let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] {
    for w in windows {
        if let owner = w["kCGWindowOwnerName"] as? String, owner.contains("Chromium"),
           let layer = w["kCGWindowLayer"] as? Int, layer == 0,
           let wid = w["kCGWindowNumber"] as? Int {
            print(wid)
            break
        }
    }
}`;
      const wid = execSync(`swift -e '${swiftScript}'`, { encoding: 'utf8', timeout: 15000 }).trim();
      cgWindowId = parseInt(wid, 10);
      if (isNaN(cgWindowId)) throw new Error('No Chromium window found');
      console.log(`  ✓ CGWindowID: ${cgWindowId}`);
    } catch (e) {
      console.error(`  ✗ Failed to get window ID: ${e.message}`);
      process.exit(1);
    }

    // Step 6: Start frame capture loop (background process)
    console.log('Step 6: Starting screen capture...');
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
    // Clean old frames
    for (const f of fs.readdirSync(FRAMES_DIR)) fs.unlinkSync(path.join(FRAMES_DIR, f));

    const sentinelFile = path.join(TEMP_DIR, 'capture_running');
    fs.writeFileSync(sentinelFile, '1');

    // Write a Node.js capture helper that records precise timestamps per frame
    const captureHelperPath = path.join(TEMP_DIR, 'capture-helper.mjs');
    fs.writeFileSync(captureHelperPath, [
      'import { execSync } from "child_process";',
      'import fs from "fs";',
      'import path from "path";',
      'const [,, sentinelFile, framesDir, windowIdStr] = process.argv;',
      'const windowId = parseInt(windowIdStr, 10);',
      'const timestamps = [];',
      'let i = 0;',
      'while (fs.existsSync(sentinelFile)) {',
      '  const padded = String(i).padStart(5, "0");',
      '  const framePath = path.join(framesDir, "frame_" + padded + ".png");',
      '  timestamps.push(Date.now());',
      '  try { execSync("screencapture -x -o -l " + windowId + " \\"" + framePath + "\\"", { stdio: "pipe", timeout: 5000 }); } catch {}',
      '  i++;',
      '}',
      'fs.writeFileSync(path.join(framesDir, "timestamps.json"), JSON.stringify(timestamps));',
    ].join('\n'));

    const captureProc = spawn('node', [captureHelperPath, sentinelFile, FRAMES_DIR, String(cgWindowId)], { stdio: 'ignore' });

    await sleep(500); // Let first frame capture start
    console.log('🔴 Recording (screencapture)...\n');

    // Timing tracker for post-processing (audio narration alignment)
    const sceneTimings = [];
    const recordStartTime = Date.now();
    function markScene(id) {
      const elapsed = (Date.now() - recordStartTime) / 1000;
      sceneTimings.push({ id, startTime: parseFloat(elapsed.toFixed(2)) });
    }

    // ── Scene 1: Empty State ──
    markScene('empty_state');
    console.log('Scene 1: Empty state');
    await humanSleep(3500);

    // ── Scene 2: Save "Frontend Research" ──
    markScene('save_frontend');
    console.log('Scene 2: Save — "Frontend Research"');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(600);
    await typeIn(popupPage, 'input[type="text"]', 'Frontend Research', { clear: true });
    await humanSleep(400);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1800);

    // ── Scene 3: Expand to show tabs ──
    markScene('expand_collapse');
    console.log('Scene 3: Expand workspace');
    await clickEl(popupPage, 'button', { text: 'Frontend Research' });
    await humanSleep(2500);
    await clickEl(popupPage, 'button', { text: 'Frontend Research' });
    await humanSleep(1200);

    // ── Scene 4: Restore (close tabs first, then restore — core feature!) ──
    markScene('restore');
    console.log('Scene 4: Restore (close tabs → restore)');
    // Close all non-popup tabs so the viewer sees an empty tab bar
    const restoreWorker = await swTarget.worker();
    await restoreWorker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      for (const tab of tabs) {
        if (!tab.url?.includes('popup.html')) {
          try { await chrome.tabs.remove(tab.id); } catch {}
        }
      }
    });
    await humanSleep(2000); // Let viewer see empty tab bar
    // Now click Restore — tabs and groups come back!
    await clickEl(popupPage, 'button', { text: 'Restore', exact: true });
    await humanSleep(2500);
    // Switch back to popup tab
    await popupPage.bringToFront();
    await humanSleep(1200);

    // ── Scene 5: Save "Backend API Docs" ──
    markScene('save_backend');
    console.log('Scene 5: Save — "Backend API Docs"');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(600);
    await typeIn(popupPage, 'input[placeholder="Workspace name"]', 'Backend API Docs', { clear: true });
    await humanSleep(400);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1800);

    // ── Scene 6: Save "Design Sprint" (free limit) ──
    markScene('save_design');
    console.log('Scene 6: Save — "Design Sprint" (free limit)');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(600);
    await typeIn(popupPage, 'input[placeholder="Workspace name"]', 'Design Sprint', { clear: true });
    await humanSleep(400);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1800);

    // ── Scene 7: Expand to show tab groups preserved ──
    markScene('expand_multiple');
    console.log('Scene 7: Expand workspaces to show tab groups');
    await clickEl(popupPage, 'button', { text: 'Backend API Docs' });
    await humanSleep(2000);
    await clickEl(popupPage, 'button', { text: 'Backend API Docs' });
    await humanSleep(800);
    await clickEl(popupPage, 'button', { text: 'Design Sprint' });
    await humanSleep(2000);
    await clickEl(popupPage, 'button', { text: 'Design Sprint' });
    await humanSleep(1200);

    // ── Scene 8: Search ──
    markScene('search');
    console.log('Scene 8: Search');
    await typeIn(popupPage, 'input[placeholder*="earch"]', 'Design');
    await humanSleep(2000);
    const searchEl = await popupPage.$('input[placeholder*="earch"]');
    if (searchEl) {
      await searchEl.click({ clickCount: 3 });
      await sleep(randInt(100, 200));
      await searchEl.press('Backspace');
    }
    await humanSleep(1500);

    // ── Scene 9: Rename ──
    markScene('rename');
    console.log('Scene 9: Rename');
    const pencilClicked = await clickEl(popupPage, 'button[title="Rename"]');
    if (pencilClicked) {
      await humanSleep(400);
      const renameInput = await popupPage.$('input[class*="border-blue"]');
      if (renameInput) {
        const box = await renameInput.boundingBox();
        if (box) {
          await moveTo(popupPage, box.x + box.width / 2, box.y + box.height / 2);
          await sleep(randInt(100, 200));
          await popupPage.evaluate(({ x, y }) => window.__clickEffect(x, y), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        }
        await renameInput.click({ clickCount: 3 });
        await sleep(randInt(150, 250));
        await humanType(popupPage, renameInput, 'API Reference');
        await humanSleep(500);
        await renameInput.press('Enter');
      }
    }
    await humanSleep(1800);

    // ── Scene 10: Settings ──
    markScene('settings');
    console.log('Scene 10: Settings');
    await clickEl(popupPage, 'button[title="Settings"]');
    await humanSleep(1000);
    await clickToggle(popupPage, 0);
    await humanSleep(500);
    await clickToggle(popupPage, 1);
    await humanSleep(500);

    await popupPage.evaluate(() => {
      const s = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (s) s.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await humanSleep(1200);

    const autoBackupToggle = await popupPage.$$('button[role="switch"][disabled]');
    if (autoBackupToggle.length > 0) {
      const box = await autoBackupToggle[0].boundingBox();
      if (box) { await moveTo(popupPage, box.x + box.width / 2, box.y + box.height / 2); await humanSleep(1000); }
    }

    const disabledBtns = await popupPage.$$('button[disabled]');
    for (const btn of disabledBtns) {
      const text = await popupPage.evaluate(el => el.textContent, btn);
      if (text?.includes('Export')) {
        const box = await btn.boundingBox();
        if (box) { await moveTo(popupPage, box.x + box.width / 2, box.y + box.height / 2); await humanSleep(1000); }
        break;
      }
    }

    const backClicked = await clickEl(popupPage, 'button svg.lucide-arrow-left');
    if (!backClicked) await popupPage.evaluate(() => { const btn = document.querySelector('button'); if (btn) btn.click(); });
    await humanSleep(1200);

    // ── Scene 11: 4th save — limit ──
    markScene('limit_warning');
    console.log('Scene 11: Save 4th — limit');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(2000);
    await popupPage.keyboard.press('Escape');
    await humanSleep(1200);

    // ── Scene 12: Pro Activation ──
    markScene('pro_activation');
    console.log('Scene 12: Pro activation');
    await clickEl(popupPage, 'button', { text: 'Unlock Pro' });
    await humanSleep(1500);

    const buyBox = await getCenter(popupPage, 'a', 'Buy Pro');
    if (buyBox) { await moveTo(popupPage, buyBox.x, buyBox.y); await humanSleep(1200); }

    await popupPage.evaluate(() => {
      const input = document.querySelector('input[placeholder*="license"]');
      if (input) input.style.webkitTextSecurity = 'disc';
    });
    await typeIn(popupPage, 'input[placeholder*="license"]', 'TV-PRO-A1B2C3D4-E5F6');
    await humanSleep(500);
    await clickEl(popupPage, 'button', { text: 'Activate', exact: true });
    await humanSleep(2000);

    // ── Scene 13: Post-Pro save ──
    markScene('post_pro_save');
    console.log('Scene 13: Save 4th (Pro)');
    await humanSleep(400);
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(600);
    await typeIn(popupPage, 'input[placeholder="Workspace name"]', 'Personal Reading', { clear: true });
    await humanSleep(400);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1800);

    // ── Scene 14: Pro settings ──
    markScene('pro_settings');
    console.log('Scene 14: Pro settings');
    await clickEl(popupPage, 'button[title="Settings"]');
    await humanSleep(800);
    await popupPage.evaluate(() => {
      const s = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (s) s.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await humanSleep(1200);

    const proToggles = await popupPage.$$('button[role="switch"]:not([disabled])');
    if (proToggles.length >= 4) {
      const box = await proToggles[3].boundingBox();
      if (box) {
        const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await moveTo(popupPage, c.x, c.y);
        await sleep(randInt(80, 180));
        await popupPage.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
        await proToggles[3].click();
        await humanSleep(800);
      }
    }

    const exportBtn = await popupPage.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => b.textContent?.includes('Export') && !b.disabled);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (exportBtn) { await moveTo(popupPage, exportBtn.x, exportBtn.y); await humanSleep(1200); }

    await popupPage.evaluate(() => {
      const el = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (el) el.scrollTop = 0;
    });
    await sleep(300);
    const backClicked2 = await clickEl(popupPage, 'button svg.lucide-arrow-left');
    if (!backClicked2) await popupPage.evaluate(() => { const btn = document.querySelector('button'); if (btn) btn.click(); });
    await humanSleep(1200);

    // ── Scene 15: Delete ──
    markScene('delete');
    console.log('Scene 15: Delete');
    const trashPos = await popupPage.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const trashBtns = btns.filter(b => b.querySelector('svg.lucide-trash2, svg.lucide-trash-2'));
      const btn = trashBtns[trashBtns.length - 1];
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (trashPos) {
      await moveTo(popupPage, trashPos.x, trashPos.y);
      await sleep(randInt(100, 200));
      await popupPage.evaluate(({ x, y }) => window.__clickEffect(x, y), trashPos);
      await popupPage.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const trashBtns = btns.filter(b => b.querySelector('svg.lucide-trash2, svg.lucide-trash-2'));
        const btn = trashBtns[trashBtns.length - 1];
        if (btn) btn.click();
      });
      await humanSleep(1500);

      const deletePos = await getCenter(popupPage, 'button', 'Delete', true);
      if (deletePos) {
        await moveTo(popupPage, deletePos.x, deletePos.y);
        await sleep(randInt(100, 200));
        await popupPage.evaluate(({ x, y }) => window.__clickEffect(x, y), deletePos);
        await popupPage.evaluate(() => {
          const btns = [...document.querySelectorAll('button')];
          const btn = btns.find(b => b.textContent?.trim() === 'Delete');
          if (btn) btn.click();
        });
      }
      await humanSleep(1800);
    }

    // ── Scene 16: End ──
    markScene('end');
    console.log('Scene 16: End');
    await popupPage.evaluate(() => window.__setCursor(-50, -50));
    await humanSleep(2500);

    // Stop frame capture
    const totalDuration = (Date.now() - recordStartTime) / 1000;
    try { fs.unlinkSync(sentinelFile); } catch {}
    await new Promise(resolve => captureProc.on('close', resolve));

    // Count frames and read timestamps for accurate sync
    const frameFiles = fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png')).sort();
    const frameCount = frameFiles.length;
    const timestampsPath = path.join(FRAMES_DIR, 'timestamps.json');
    const frameTimestamps = fs.existsSync(timestampsPath)
      ? JSON.parse(fs.readFileSync(timestampsPath, 'utf8'))
      : [];
    const fps = frameCount / totalDuration;
    console.log(`\n⏹️  Captured ${frameCount} frames in ${totalDuration.toFixed(1)}s (${fps.toFixed(1)} fps)`);

    // Build concat file with per-frame durations (ensures perfect wall-clock sync)
    console.log('Step 7: Stitching frames into video (timestamp-synced)...');
    const concatLines = [];
    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(FRAMES_DIR, frameFiles[i]);
      let duration;
      if (i < frameTimestamps.length - 1) {
        duration = (frameTimestamps[i + 1] - frameTimestamps[i]) / 1000;
        duration = Math.max(0.01, Math.min(0.5, duration)); // clamp to avoid glitches
      } else {
        duration = 1 / Math.max(1, fps); // fallback
      }
      concatLines.push(`file '${framePath}'`);
      concatLines.push(`duration ${duration.toFixed(6)}`);
    }
    // Concat demuxer requires last file listed again
    if (frameFiles.length > 0) {
      concatLines.push(`file '${path.join(FRAMES_DIR, frameFiles[frameFiles.length - 1])}'`);
    }
    const concatPath = path.join(TEMP_DIR, 'concat.txt');
    fs.writeFileSync(concatPath, concatLines.join('\n'));

    const stitchCmd = `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "${OUTPUT}"`;
    try {
      execSync(stitchCmd, { stdio: 'pipe', timeout: 300000 });
    } catch (e) {
      console.error(`  ✗ ffmpeg stitch failed: ${e.stderr?.toString().split('\n').slice(-3).join('\n') || e.message}`);
      process.exit(1);
    }

    // Write timing manifest for post-processing (audio narration)
    for (let i = 0; i < sceneTimings.length; i++) {
      const next = sceneTimings[i + 1];
      sceneTimings[i].duration = parseFloat(
        ((next ? next.startTime : totalDuration) - sceneTimings[i].startTime).toFixed(2)
      );
    }
    const timingsPath = path.resolve(ROOT, 'demo-timings.json');
    fs.writeFileSync(timingsPath, JSON.stringify({ totalDuration: parseFloat(totalDuration.toFixed(2)), scenes: sceneTimings }, null, 2));
    console.log(`📊 Timings: ${timingsPath}`);

  } finally {
    await browser.close();

    // Restore original manifest minimum_chrome_version
    if (origMinVersion) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.minimum_chrome_version = origMinVersion;
      fs.writeFileSync(manifestPath, JSON.stringify(m));
      console.log(`  Restored minimum_chrome_version: ${origMinVersion}`);
    }

    // Clean up frames
    try {
      const frames = fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png'));
      for (const f of frames) fs.unlinkSync(path.join(FRAMES_DIR, f));
      console.log(`  Cleaned up ${frames.length} frame files`);
    } catch {}
  }

  if (fs.existsSync(OUTPUT)) {
    const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
    console.log(`\n✅ Video: ${OUTPUT} (${size} KB)`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
