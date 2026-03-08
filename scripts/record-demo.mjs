#!/usr/bin/env node

/**
 * TabVault Demo Recorder v4 — Dual Capture + Composite
 *
 * Launches Chrome for Testing with the real extension loaded.
 * - Main window: demo tabs with tab groups, captured via macOS screencapture
 * - Popup: opened in a separate 'popup'-type window (off-screen), captured via
 *   page.screenshot() with transparent background, rounded corners, and shadow
 * - Post-processing: ffmpeg composites the popup overlay onto the main window
 *
 * Result: the popup appears as a floating panel with rounded corners and shadow,
 * overlaid on the browser window — exactly like a real Chrome extension popup.
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
const MAIN_FRAMES_DIR = path.resolve(TEMP_DIR, 'main_frames');
const POPUP_FRAMES_DIR = path.resolve(TEMP_DIR, 'popup_frames');
const USER_DATA_DIR = path.join(os.tmpdir(), 'tabvault-demo-profile');
const OUTPUT = path.resolve(ROOT, 'demo-popup.mp4');

// Main browser window
const WIN_W = 1280;
const WIN_H = 800;
const WIN_X = 100;
const WIN_Y = 100;

// NOTE: We capture by window ID (screencapture -l), not by region.
// This ensures we always get the correct Chrome window regardless of z-order.

// Popup styling
const POPUP_CONTENT_W = 380;  // Matches the App component's w-[380px]
const POPUP_CONTENT_H = 500;  // Matches max-h-[500px]
const POPUP_PAD = { top: 10, right: 12, bottom: 18, left: 12 };
const POPUP_VIEWPORT_W = POPUP_CONTENT_W + POPUP_PAD.left + POPUP_PAD.right; // 404
const POPUP_VIEWPORT_H = POPUP_CONTENT_H + POPUP_PAD.top + POPUP_PAD.bottom; // 528

// Where the popup appears in the final composite (CSS points relative to capture region)
const POPUP_OVERLAY_X_PT = 864; // Right-aligned: 1280 - 404 - 12
const POPUP_OVERLAY_Y_PT = 82;  // Just below Chrome toolbar+tab bar

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const humanSleep = (ms) => sleep(ms * (0.82 + Math.random() * 0.38));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ====== Tab data for realistic demo ======
const DEMO_TABS = [
  { title: 'vercel/next.js — GitHub', url: 'https://github.com/vercel/next.js', group: 'Dev Tools', groupColor: 'blue' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/', group: 'Dev Tools', groupColor: 'blue' },
  { title: 'Stack Overflow — Questions', url: 'https://stackoverflow.com/questions', group: 'Dev Tools', groupColor: 'blue' },
  { title: 'React — Quick Start', url: 'https://react.dev/learn', group: 'Frontend', groupColor: 'green' },
  { title: 'Tailwind CSS — Docs', url: 'https://tailwindcss.com/docs/installation', group: 'Frontend', groupColor: 'green' },
  { title: 'Vite — Getting Started', url: 'https://vite.dev/guide/', group: 'Frontend', groupColor: 'green' },
  { title: 'TypeScript — Documentation', url: 'https://www.typescriptlang.org/docs/', group: null, groupColor: null },
];

// =====================================================
// CHROME + EXTENSION HELPERS
// =====================================================

const CHROME_ARGS = [
  `--window-size=${WIN_W},${WIN_H}`,
  `--window-position=${WIN_X},${WIN_Y}`,
  `--load-extension=${EXTENSION_PATH}`,
  `--disable-extensions-except=${EXTENSION_PATH}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-infobars',
];

async function launchChrome() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir: USER_DATA_DIR,
    args: CHROME_ARGS,
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
  });

  await sleep(3000);
  return browser;
}

/** Pin extension icon in Chrome toolbar by editing Preferences file. */
function pinExtension(extensionId) {
  const prefsPath = path.join(USER_DATA_DIR, 'Default', 'Preferences');
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    if (!prefs.extensions) prefs.extensions = {};
    prefs.extensions.pinned_extensions = [extensionId];
    fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    console.log(`  ✓ Pinned extension ${extensionId} in toolbar`);
  } catch (e) {
    console.log(`  ⚠ Could not pin extension: ${e.message}`);
  }
}

/** Wait for our extension's service worker target. */
async function waitForServiceWorker(browser) {
  const swTarget = await browser.waitForTarget(
    t => t.type() === 'service_worker' && t.url().endsWith('background.js'),
    { timeout: 15000 }
  );
  return swTarget;
}

/** Get extension ID from service worker URL */
function getExtensionId(swTarget) {
  const url = swTarget.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  return match ? match[1] : null;
}

/**
 * Create tabs and group them. Uses service worker to create tabs one-by-one
 * and captures the returned tab ID directly.
 */
async function setupTabs(browser, sw, tabsData) {
  const worker = await sw.worker();
  const groups = new Map();

  for (const tab of tabsData) {
    const tabIdStr = await worker.evaluate(async (url) => {
      const t = await chrome.tabs.create({ url, active: false });
      return String(t.id);
    }, tab.url);
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

  for (const [groupName, { color, tabIds }] of groups) {
    try {
      const groupIdStr = await worker.evaluate(async (ids) => {
        const gid = await chrome.tabs.group({ tabIds: ids });
        return String(gid);
      }, tabIds);
      const groupId = parseInt(groupIdStr, 10);

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

  // Close all about:blank / newtab tabs and activate first real tab
  try {
    const tabCountStr = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      // Activate the first non-blank tab so we can safely remove blanks
      const firstReal = tabs.find(t => t.url && !t.url.startsWith('about:') && !t.url.startsWith('chrome://'));
      if (firstReal) await chrome.tabs.update(firstReal.id, { active: true });
      // Remove blank tabs
      for (const t of tabs) {
        if (!t.url || t.url.startsWith('about:') || t.url === 'chrome://newtab/') {
          try { await chrome.tabs.remove(t.id); } catch {}
        }
      }
      const remaining = await chrome.tabs.query({ currentWindow: true });
      return String(remaining.length);
    });
    console.log(`    Total tabs: ${tabCountStr}`);
  } catch {}

  // Wait for pages to load so tab titles appear correctly
  console.log('    Waiting for pages to load...');
  await sleep(5000);

  console.log(`  ✓ Created ${tabsData.length} tabs in ${groups.size} groups`);
}

// =====================================================
// NEW: SERVICE WORKER PATCHING + DPR DETECTION
// =====================================================

/** Get the main (first) window's ID from the service worker. */
async function getMainWindowId(swTarget) {
  const worker = await swTarget.worker();
  const idStr = await worker.evaluate(async () => {
    const win = await chrome.windows.getCurrent();
    return String(win.id);
  });
  return parseInt(idStr, 10);
}

/**
 * Monkey-patch Chrome APIs in the service worker so that all
 * tab/window operations target the main window, even when the
 * popup is in a separate window.
 */
async function patchServiceWorker(swTarget, mainWindowId) {
  const swSession = await swTarget.createCDPSession();
  await swSession.send('Runtime.evaluate', {
    expression: `
      (() => {
        const MAIN_WIN = ${mainWindowId};

        // chrome.tabs.query: redirect currentWindow → mainWindowId
        const _origQuery = chrome.tabs.query;
        chrome.tabs.query = function(info) {
          if (info && info.currentWindow) {
            const patched = { ...info, windowId: MAIN_WIN };
            delete patched.currentWindow;
            return _origQuery.call(chrome.tabs, patched);
          }
          return _origQuery.call(chrome.tabs, info);
        };

        // chrome.windows.getCurrent: always return main window
        chrome.windows.getCurrent = function(opts) {
          return chrome.windows.get(MAIN_WIN, opts || {});
        };

        // chrome.tabs.create: default to main window
        const _origCreate = chrome.tabs.create;
        chrome.tabs.create = function(props) {
          if (props && !props.windowId) {
            return _origCreate.call(chrome.tabs, { ...props, windowId: MAIN_WIN });
          }
          return _origCreate.call(chrome.tabs, props);
        };

        // chrome.tabs.group: default createProperties.windowId to main window
        const _origGroup = chrome.tabs.group;
        chrome.tabs.group = function(options) {
          if (!options) return _origGroup.call(chrome.tabs, options);
          const cp = options.createProperties || {};
          if (!cp.windowId) {
            return _origGroup.call(chrome.tabs, {
              ...options,
              createProperties: { ...cp, windowId: MAIN_WIN },
            });
          }
          return _origGroup.call(chrome.tabs, options);
        };

        console.log('[DEMO] SW patched: all ops → windowId=' + MAIN_WIN);
      })();
    `,
    awaitPromise: false,
  });
  await swSession.detach();
}

/**
 * Detect the display's device pixel ratio by taking a test screencapture
 * and comparing the captured pixel width to the requested point width.
 */
function detectDPR() {
  const testW = 200;
  const testPath = path.join(TEMP_DIR, '_dpr_test.png');
  try {
    execSync(`screencapture -x -o -R 0,0,${testW},${testW} "${testPath}"`, { stdio: 'pipe', timeout: 5000 });
    const buf = fs.readFileSync(testPath);
    // PNG IHDR: bytes 16-19 = width (big-endian uint32)
    const pixelWidth = buf.readUInt32BE(16);
    fs.unlinkSync(testPath);
    return Math.round(pixelWidth / testW);
  } catch {
    return 2; // Default to Retina
  }
}

/**
 * Find the CGWindowID for the Chrome for Testing main window using
 * CoreGraphics via a Swift subprocess. Looks for the largest Chrome
 * window on screen (to distinguish main window from popup window).
 * Returns the CGWindowID number, or null if not found.
 */
function getChromeWindowId() {
  const swiftCode = `
import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    exit(1)
}
var bestWid = 0
var bestArea = 0
for win in windowList {
    let owner = win[kCGWindowOwnerName as String] as? String ?? ""
    let layer = win[kCGWindowLayer as String] as? Int ?? -1
    guard layer == 0 else { continue }
    // Match Chrome for Testing, Chromium, Google Chrome
    let isChrome = owner.lowercased().contains("chrome") || owner.lowercased().contains("chromium")
    guard isChrome else { continue }
    let bounds = win[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let w = bounds["Width"] as? Int ?? 0
    let h = bounds["Height"] as? Int ?? 0
    let wid = win[kCGWindowNumber as String] as? Int ?? 0
    let area = w * h
    if area > bestArea {
        bestArea = area
        bestWid = wid
    }
}
if bestWid > 0 {
    print(bestWid)
} else {
    exit(1)
}
`;
  const swiftPath = path.join(TEMP_DIR, '_find_window.swift');
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    fs.writeFileSync(swiftPath, swiftCode);
    const result = execSync(`swift "${swiftPath}"`, {
      stdio: 'pipe',
      timeout: 15000,
    });
    try { fs.unlinkSync(swiftPath); } catch {}
    return parseInt(result.toString().trim(), 10);
  } catch (e) {
    console.error('  ⚠ Failed to get Chrome window ID via Swift:', e.message);
    try { fs.unlinkSync(swiftPath); } catch {}
    return null;
  }
}

// =====================================================
// POPUP WINDOW MANAGEMENT
// =====================================================

/**
 * Open popup.html in a separate 'popup'-type window (off-screen).
 * Returns a Puppeteer Page handle for the popup content.
 */
async function openPopupWindow(browser, swTarget) {
  const worker = await swTarget.worker();
  const extId = getExtensionId(swTarget);

  // Create popup window far right (Chrome requires 50% on-screen).
  // With screencapture -l, only the main window is captured — popup won't appear in video.
  await worker.evaluate(async (id) => {
    await chrome.windows.create({
      type: 'popup',
      url: `chrome-extension://${id}/popup.html`,
      width: 440,
      height: 620,
      left: 2000,
      top: 100,
    });
  }, extId);

  await sleep(1500);

  const popupTarget = await browser.waitForTarget(
    t => t.url().includes('popup.html') && t.type() === 'page',
    { timeout: 10000 }
  );
  const popupPage = await popupTarget.asPage();
  return popupPage;
}

/**
 * Inject CSS into the popup page to create the floating popup appearance:
 * - Transparent html/body background
 * - Rounded corners on the content
 * - Drop shadow
 * - transform: translateZ(0) so fixed dialogs are contained within
 */
async function injectPopupStyles(page) {
  await page.evaluate((pad) => {
    const style = document.createElement('style');
    style.id = '__popup-demo-styles';
    style.textContent = `
      html {
        background: transparent !important;
      }
      body {
        background: transparent !important;
        margin: 0 !important;
        padding: ${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px !important;
        box-sizing: border-box !important;
        height: 100vh !important;
        overflow: hidden !important;
      }
      #root > div:first-child {
        border-radius: 10px !important;
        overflow: hidden !important;
        transform: translateZ(0) !important;
        box-shadow:
          0 12px 40px rgba(0,0,0,0.15),
          0 4px 12px rgba(0,0,0,0.08),
          0 0 0 0.5px rgba(0,0,0,0.1) !important;
      }
    `;
    document.head.appendChild(style);
  }, POPUP_PAD);
}

// =====================================================
// POPUP INTERACTION HELPERS
// =====================================================

async function injectCursor(page) {
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = '__cursor';
    cursor.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:28px;height:28px;will-change:left,top;left:-50px;top:-50px;transform:translate(-6px,-4px);';
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

    // Hide system cursor within popup
    document.head.appendChild(Object.assign(document.createElement('style'), {
      textContent: '* { cursor: none !important; }'
    }));
  });
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
  await sleep(randInt(180, 320));
}

async function clickEl(page, selector, { text, exact } = {}) {
  const c = await getCenter(page, selector, text, exact);
  if (!c) { console.log(`    ⚠ Not found: ${selector} ${text || ''}`); return false; }
  await moveTo(page, c.x, c.y);
  await sleep(randInt(60, 140));
  await page.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
  await page.mouse.click(c.x, c.y);
  await sleep(randInt(150, 300));
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

  console.log('=== TabVault Demo Recorder v4 (Dual Capture + Composite) ===\n');

  // Clean previous profile to start fresh
  try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}

  // Step 1: First launch — detect extension ID and pin icon in toolbar
  console.log('Step 1: Launching Chrome to detect extension ID...');
  let browser = await launchChrome();
  const tempSwTarget = await waitForServiceWorker(browser);
  const extensionId = getExtensionId(tempSwTarget);
  console.log(`  ✓ Extension ID: ${extensionId}`);

  console.log('  Pinning extension and relaunching...');
  await browser.close();
  pinExtension(extensionId);
  browser = await launchChrome();

  try {
    // Step 2: Wait for extension service worker
    console.log('Step 2: Finding extension service worker...');
    const swTarget = await waitForServiceWorker(browser);
    console.log(`  ✓ Extension ready (pinned in toolbar)`);

    // Step 3: Create demo tabs with groups
    console.log('Step 3: Setting up demo tabs...');
    await setupTabs(browser, swTarget, DEMO_TABS);
    await sleep(1000);

    // Step 4: Patch service worker to redirect window ops to main window
    console.log('Step 4: Patching service worker...');
    const mainWindowId = await getMainWindowId(swTarget);
    await patchServiceWorker(swTarget, mainWindowId);
    console.log(`  ✓ Patched: all ops → windowId=${mainWindowId}`);

    // Focus the main window (nice for user experience during recording)
    const focusWorker = await swTarget.worker();
    await focusWorker.evaluate(async (id) => {
      await chrome.windows.update(id, { focused: true });
    }, mainWindowId);
    await sleep(500);

    // Step 5: Detect display DPR
    console.log('Step 5: Detecting display DPR...');
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const dpr = detectDPR();
    console.log(`  ✓ DPR: ${dpr}x`);

    // Step 6: Open popup in separate window
    console.log('Step 6: Opening popup in separate window...');
    const popupPage = await openPopupWindow(browser, swTarget);

    // Set viewport with matching DPR for consistent resolution
    await popupPage.setViewport({
      width: POPUP_VIEWPORT_W,
      height: POPUP_VIEWPORT_H,
      deviceScaleFactor: dpr,
    });
    await sleep(500);

    // Re-focus main window after popup creation (so title bar isn't dimmed)
    const refocusWorker = await swTarget.worker();
    await refocusWorker.evaluate(async (id) => {
      await chrome.windows.update(id, { focused: true });
    }, mainWindowId);
    await sleep(300);

    // Wait for React to render, then inject styles and helpers
    await sleep(2000);
    await injectPopupStyles(popupPage);
    await injectCursor(popupPage);
    await injectLemonSqueezyMock(popupPage);
    await sleep(1500);

    // Step 7: Prepare frame directories
    console.log('Step 7: Preparing capture...');
    fs.mkdirSync(MAIN_FRAMES_DIR, { recursive: true });
    fs.mkdirSync(POPUP_FRAMES_DIR, { recursive: true });
    // Clean old frames
    for (const dir of [MAIN_FRAMES_DIR, POPUP_FRAMES_DIR]) {
      for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    }

    // Step 8: Get Chrome window ID and start screencapture by window
    console.log('Step 8: Starting main window capture...');
    const cgWindowId = getChromeWindowId();
    if (!cgWindowId) {
      console.error('  ✗ Could not find Chrome window. Make sure Chrome is visible.');
      process.exit(1);
    }
    console.log(`  ✓ Chrome CGWindowID: ${cgWindowId}`);

    const sentinelFile = path.join(TEMP_DIR, 'capture_running');
    fs.writeFileSync(sentinelFile, '1');

    // Compile Swift capture helper (CGWindowListCreateImage — much faster than spawning screencapture)
    const swiftCaptureSrc = path.join(TEMP_DIR, 'capture_helper.swift');
    const swiftCaptureBin = path.join(TEMP_DIR, 'capture_helper');
    fs.writeFileSync(swiftCaptureSrc, [
      'import CoreGraphics',
      'import Foundation',
      'import ImageIO',
      '',
      'guard CommandLine.arguments.count >= 4 else { exit(1) }',
      'let wid = CGWindowID(UInt32(CommandLine.arguments[1])!)',
      'let dir = CommandLine.arguments[2]',
      'let sentinel = CommandLine.arguments[3]',
      'let fm = FileManager.default',
      'var ts: [Int64] = []',
      'var i = 0',
      'while fm.fileExists(atPath: sentinel) {',
      '    guard let img = CGWindowListCreateImage(.null, .optionIncludingWindow, wid, [.shouldBeOpaque]) else {',
      '        usleep(10000)',
      '        continue',
      '    }',
      '    let padded = String(format: "%05d", i)',
      '    let url = URL(fileURLWithPath: dir + "/frame_" + padded + ".png")',
      '    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { continue }',
      '    CGImageDestinationAddImage(dest, img, nil)',
      '    CGImageDestinationFinalize(dest)',
      '    ts.append(Int64(Date().timeIntervalSince1970 * 1000))',
      '    i += 1',
      '}',
      'let json = "[" + ts.map { String($0) }.joined(separator: ",") + "]"',
      'try! json.write(toFile: dir + "/timestamps.json", atomically: true, encoding: .utf8)',
    ].join('\n'));

    console.log('  Compiling Swift capture helper...');
    execSync(`swiftc -O -Xfrontend -disable-availability-checking -o "${swiftCaptureBin}" "${swiftCaptureSrc}"`, { stdio: 'pipe', timeout: 30000 });
    console.log('  ✓ Compiled');

    const captureProc = spawn(swiftCaptureBin, [String(cgWindowId), MAIN_FRAMES_DIR, sentinelFile], { stdio: 'ignore' });

    // Step 9: Start popup screenshot loop (runs concurrently via async)
    let popupCapturing = true;
    let popupFrameIdx = 0;
    const popupTimestamps = [];

    async function capturePopupFrame() {
      if (!popupCapturing) return;
      try {
        const padded = String(popupFrameIdx).padStart(5, '0');
        popupTimestamps.push(Date.now());
        await popupPage.screenshot({
          path: path.join(POPUP_FRAMES_DIR, `frame_${padded}.png`),
          omitBackground: true,
        });
        popupFrameIdx++;
      } catch {
        // Popup temporarily unavailable — skip frame
      }
      if (popupCapturing) {
        setTimeout(capturePopupFrame, 0);
      }
    }

    await sleep(500);
    capturePopupFrame(); // Start async popup capture
    console.log('🔴 Recording (dual capture)...\n');

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
    await humanSleep(2000);

    // ── Scene 2: Save "Frontend Research" ──
    markScene('save_frontend');
    console.log('Scene 2: Save — "Frontend Research"');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(400);
    await typeIn(popupPage, 'input[type="text"]', 'Frontend Research', { clear: true });
    await humanSleep(300);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1200);

    // ── Scene 3: Expand to show tabs ──
    markScene('expand_collapse');
    console.log('Scene 3: Expand workspace');
    await clickEl(popupPage, 'button', { text: 'Frontend Research' });
    await humanSleep(1800);
    await clickEl(popupPage, 'button', { text: 'Frontend Research' });
    await humanSleep(800);

    // ── Scene 4: Restore (close tabs → restore — core feature!) ──
    markScene('restore');
    console.log('Scene 4: Restore (close tabs → restore)');

    // Close demo tabs in the main window (explicit windowId to bypass patch issues)
    const restoreWorker = await swTarget.worker();
    const blankTabIdStr = await restoreWorker.evaluate(async (winId) => {
      const blankTab = await chrome.tabs.create({ url: 'about:blank', windowId: winId, active: true });
      const tabs = await chrome.tabs.query({ windowId: winId });
      for (const tab of tabs) {
        if (tab.id !== blankTab.id) {
          try { await chrome.tabs.remove(tab.id); } catch {}
        }
      }
      return String(blankTab.id);
    }, mainWindowId);
    const blankTabId = parseInt(blankTabIdStr, 10);

    await humanSleep(1500); // Let viewer see empty tab bar behind popup

    // Click Restore in popup (for the visual button click + toast)
    await clickEl(popupPage, 'button', { text: 'Restore', exact: true });
    await sleep(800); // Let the popup's restore finish

    // The popup's restore likely created tabs in the wrong window (popup window).
    // Directly recreate demo tabs in the main window for correct video output.
    const restoreWorker2 = await swTarget.worker();
    const groups = new Map();
    for (const tab of DEMO_TABS) {
      const tabIdStr = await restoreWorker2.evaluate(async (url, winId) => {
        const t = await chrome.tabs.create({ url, windowId: winId, active: false });
        return String(t.id);
      }, tab.url, mainWindowId);
      const tabId = parseInt(tabIdStr, 10);
      if (tab.group && tabId) {
        if (!groups.has(tab.group)) groups.set(tab.group, { color: tab.groupColor, tabIds: [] });
        groups.get(tab.group).tabIds.push(tabId);
      }
      await sleep(100);
    }

    // Group the tabs
    for (const [groupName, { color, tabIds }] of groups) {
      try {
        const gidStr = await restoreWorker2.evaluate(async (ids, winId) => {
          const gid = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: winId } });
          return String(gid);
        }, tabIds, mainWindowId);
        const gid = parseInt(gidStr, 10);
        const s = await swTarget.createCDPSession();
        await s.send('Runtime.evaluate', {
          expression: `chrome.tabGroups.update(${gid}, { title: ${JSON.stringify(groupName)}, color: ${JSON.stringify(color)}, collapsed: false })`,
          awaitPromise: true,
        });
        await s.detach();
      } catch (e) {
        console.log(`    ⚠ Group "${groupName}" failed: ${e.message}`);
      }
    }

    // Remove the about:blank tab
    try { await restoreWorker2.evaluate(async (id) => { await chrome.tabs.remove(id); }, blankTabId); } catch {}

    // Activate first tab
    if (DEMO_TABS.length > 0) {
      const firstTabStr = await restoreWorker2.evaluate(async (winId) => {
        const tabs = await chrome.tabs.query({ windowId: winId });
        return tabs.length > 0 ? String(tabs[0].id) : '0';
      }, mainWindowId);
      const firstTab = parseInt(firstTabStr, 10);
      if (firstTab) await restoreWorker2.evaluate(async (id) => { await chrome.tabs.update(id, { active: true }); }, firstTab);
    }

    // Wait for pages to load so tab titles appear correctly
    await sleep(3000);

    // ── Scene 5: Save "Backend API Docs" ──
    markScene('save_backend');
    console.log('Scene 5: Save — "Backend API Docs"');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(400);
    await typeIn(popupPage, 'input[placeholder="Workspace name"]', 'Backend API Docs', { clear: true });
    await humanSleep(300);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1200);

    // ── Scene 6: Save "Design Sprint" (free limit) ──
    markScene('save_design');
    console.log('Scene 6: Save — "Design Sprint" (free limit)');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(400);
    await typeIn(popupPage, 'input[placeholder="Workspace name"]', 'Design Sprint', { clear: true });
    await humanSleep(300);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1200);

    // ── Scene 7: Expand to show tab groups preserved ──
    markScene('expand_multiple');
    console.log('Scene 7: Expand workspaces to show tab groups');
    await clickEl(popupPage, 'button', { text: 'Backend API Docs' });
    await humanSleep(1200);
    await clickEl(popupPage, 'button', { text: 'Backend API Docs' });
    await humanSleep(600);
    await clickEl(popupPage, 'button', { text: 'Design Sprint' });
    await humanSleep(1200);
    await clickEl(popupPage, 'button', { text: 'Design Sprint' });
    await humanSleep(800);

    // ── Scene 8: Search ──
    markScene('search');
    console.log('Scene 8: Search');
    await typeIn(popupPage, 'input[placeholder*="earch"]', 'Design');
    await humanSleep(1200);
    const searchEl = await popupPage.$('input[placeholder*="earch"]');
    if (searchEl) {
      await searchEl.click({ clickCount: 3 });
      await sleep(randInt(80, 150));
      await searchEl.press('Backspace');
    }
    await humanSleep(800);

    // ── Scene 9: Rename ──
    markScene('rename');
    console.log('Scene 9: Rename');
    const pencilClicked = await clickEl(popupPage, 'button[title="Rename"]');
    if (pencilClicked) {
      await humanSleep(300);
      const renameInput = await popupPage.$('input[class*="border-blue"]');
      if (renameInput) {
        const box = await renameInput.boundingBox();
        if (box) {
          await moveTo(popupPage, box.x + box.width / 2, box.y + box.height / 2);
          await sleep(randInt(60, 140));
          await popupPage.evaluate(({ x, y }) => window.__clickEffect(x, y), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        }
        await renameInput.click({ clickCount: 3 });
        await sleep(randInt(100, 180));
        await humanType(popupPage, renameInput, 'API Reference');
        await humanSleep(300);
        await renameInput.press('Enter');
      }
    }
    await humanSleep(1200);

    // ── Scene 10: Settings ──
    markScene('settings');
    console.log('Scene 10: Settings');
    await clickEl(popupPage, 'button[title="Settings"]');
    await humanSleep(600);
    await clickToggle(popupPage, 0);
    await humanSleep(400);
    await clickToggle(popupPage, 1);
    await humanSleep(400);

    await popupPage.evaluate(() => {
      const s = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (s) s.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await humanSleep(800);

    const autoBackupToggle = await popupPage.$$('button[role="switch"][disabled]');
    if (autoBackupToggle.length > 0) {
      const box = await autoBackupToggle[0].boundingBox();
      if (box) { await moveTo(popupPage, box.x + box.width / 2, box.y + box.height / 2); await humanSleep(600); }
    }

    const disabledBtns = await popupPage.$$('button[disabled]');
    for (const btn of disabledBtns) {
      const text = await popupPage.evaluate(el => el.textContent, btn);
      if (text?.includes('Export')) {
        const box = await btn.boundingBox();
        if (box) { await moveTo(popupPage, box.x + box.width / 2, box.y + box.height / 2); await humanSleep(600); }
        break;
      }
    }

    const backClicked = await clickEl(popupPage, 'button svg.lucide-arrow-left');
    if (!backClicked) await popupPage.evaluate(() => { const btn = document.querySelector('button'); if (btn) btn.click(); });
    await humanSleep(800);

    // ── Scene 11: 4th save — limit ──
    markScene('limit_warning');
    console.log('Scene 11: Save 4th — limit');
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(1200);
    await popupPage.keyboard.press('Escape');
    await humanSleep(800);

    // ── Scene 12: Pro Activation ──
    markScene('pro_activation');
    console.log('Scene 12: Pro activation');
    await clickEl(popupPage, 'button', { text: 'Unlock Pro' });
    await humanSleep(800);

    const buyBox = await getCenter(popupPage, 'a', 'Buy Pro');
    if (buyBox) { await moveTo(popupPage, buyBox.x, buyBox.y); await humanSleep(800); }

    await popupPage.evaluate(() => {
      const input = document.querySelector('input[placeholder*="license"]');
      if (input) input.style.webkitTextSecurity = 'disc';
    });
    await typeIn(popupPage, 'input[placeholder*="license"]', 'TV-PRO-A1B2C3D4-E5F6');
    await humanSleep(400);
    await clickEl(popupPage, 'button', { text: 'Activate', exact: true });
    await humanSleep(1200);

    // ── Scene 13: Post-Pro save ──
    markScene('post_pro_save');
    console.log('Scene 13: Save 4th (Pro)');
    await humanSleep(300);
    await clickEl(popupPage, 'button', { text: 'Save Current' });
    await humanSleep(400);
    await typeIn(popupPage, 'input[placeholder="Workspace name"]', 'Personal Reading', { clear: true });
    await humanSleep(300);
    await clickEl(popupPage, 'button', { text: 'Save', exact: true });
    await humanSleep(1000);

    // ── Scene 14: Pro settings ──
    markScene('pro_settings');
    console.log('Scene 14: Pro settings');
    await clickEl(popupPage, 'button[title="Settings"]');
    await humanSleep(500);
    await popupPage.evaluate(() => {
      const s = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (s) s.scrollBy({ top: 300, behavior: 'smooth' });
    });
    await humanSleep(800);

    const proToggles = await popupPage.$$('button[role="switch"]:not([disabled])');
    if (proToggles.length >= 4) {
      const box = await proToggles[3].boundingBox();
      if (box) {
        const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await moveTo(popupPage, c.x, c.y);
        await sleep(randInt(80, 180));
        await popupPage.evaluate(({ x, y }) => window.__clickEffect(x, y), c);
        await proToggles[3].click();
        await humanSleep(500);
      }
    }

    const exportBtn = await popupPage.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => b.textContent?.includes('Export') && !b.disabled);
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (exportBtn) { await moveTo(popupPage, exportBtn.x, exportBtn.y); await humanSleep(800); }

    await popupPage.evaluate(() => {
      const el = document.querySelector('.overflow-y-auto') || document.querySelector('.flex-1.flex.flex-col');
      if (el) el.scrollTop = 0;
    });
    await sleep(200);
    const backClicked2 = await clickEl(popupPage, 'button svg.lucide-arrow-left');
    if (!backClicked2) await popupPage.evaluate(() => { const btn = document.querySelector('button'); if (btn) btn.click(); });
    await humanSleep(800);

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
      await humanSleep(800);

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
      await humanSleep(1000);
    }

    // ── Scene 16: End ──
    markScene('end');
    console.log('Scene 16: End');
    await popupPage.evaluate(() => window.__setCursor(-50, -50));
    await humanSleep(1500);

    // ── Stop captures ──
    const totalDuration = (Date.now() - recordStartTime) / 1000;

    // Stop popup screenshot loop
    popupCapturing = false;
    await sleep(300); // Let last screenshot finish

    // Stop main window screencapture
    try { fs.unlinkSync(sentinelFile); } catch {}
    await new Promise(resolve => captureProc.on('close', resolve));

    // ── Gather frame data ──
    const mainFrames = fs.readdirSync(MAIN_FRAMES_DIR).filter(f => f.endsWith('.png')).sort();
    const mainTimestampsPath = path.join(MAIN_FRAMES_DIR, 'timestamps.json');
    const mainTimestamps = fs.existsSync(mainTimestampsPath)
      ? JSON.parse(fs.readFileSync(mainTimestampsPath, 'utf8'))
      : [];
    const mainFps = mainFrames.length / totalDuration;

    const popupFrames = fs.readdirSync(POPUP_FRAMES_DIR).filter(f => f.endsWith('.png')).sort();
    const popupFps = popupFrames.length / totalDuration;

    console.log(`\n⏹️  Main: ${mainFrames.length} frames (${mainFps.toFixed(1)} fps)`);
    console.log(`   Popup: ${popupFrames.length} frames (${popupFps.toFixed(1)} fps)`);

    // ── Step 10: Post-processing — create composite video ──
    console.log('\nStep 10: Post-processing...');

    // 10a: Build main concat file
    const mainConcatLines = [];
    for (let i = 0; i < mainFrames.length; i++) {
      const framePath = path.join(MAIN_FRAMES_DIR, mainFrames[i]);
      let duration;
      if (i < mainTimestamps.length - 1) {
        duration = (mainTimestamps[i + 1] - mainTimestamps[i]) / 1000;
        duration = Math.max(0.01, Math.min(0.5, duration));
      } else {
        duration = 1 / Math.max(1, mainFps);
      }
      mainConcatLines.push(`file '${framePath}'`);
      mainConcatLines.push(`duration ${duration.toFixed(6)}`);
    }
    if (mainFrames.length > 0) {
      mainConcatLines.push(`file '${path.join(MAIN_FRAMES_DIR, mainFrames[mainFrames.length - 1])}'`);
    }
    const mainConcatPath = path.join(TEMP_DIR, 'main_concat.txt');
    fs.writeFileSync(mainConcatPath, mainConcatLines.join('\n'));

    // 10b: Build popup concat file
    const popupConcatLines = [];
    for (let i = 0; i < popupFrames.length; i++) {
      const framePath = path.join(POPUP_FRAMES_DIR, popupFrames[i]);
      let duration;
      if (i < popupTimestamps.length - 1) {
        duration = (popupTimestamps[i + 1] - popupTimestamps[i]) / 1000;
        duration = Math.max(0.01, Math.min(0.5, duration));
      } else {
        duration = 1 / Math.max(1, popupFps);
      }
      popupConcatLines.push(`file '${framePath}'`);
      popupConcatLines.push(`duration ${duration.toFixed(6)}`);
    }
    if (popupFrames.length > 0) {
      popupConcatLines.push(`file '${path.join(POPUP_FRAMES_DIR, popupFrames[popupFrames.length - 1])}'`);
    }
    const popupConcatPath = path.join(TEMP_DIR, 'popup_concat.txt');
    fs.writeFileSync(popupConcatPath, popupConcatLines.join('\n'));

    // 10c: Composite — overlay popup onto main window
    const overlayX = POPUP_OVERLAY_X_PT * dpr;
    const overlayY = POPUP_OVERLAY_Y_PT * dpr;

    console.log(`  Overlay position: (${overlayX}, ${overlayY}) px`);
    console.log('  Compositing with ffmpeg...');

    const compositeCmd = [
      'ffmpeg -y',
      `-f concat -safe 0 -i "${mainConcatPath}"`,
      `-f concat -safe 0 -i "${popupConcatPath}"`,
      `-filter_complex "[0:v][1:v]overlay=x=${overlayX}:y=${overlayY}:format=auto:shortest=1[out]"`,
      '-map "[out]"',
      '-c:v libx264 -pix_fmt yuv420p -preset medium -crf 20',
      `"${OUTPUT}"`,
    ].join(' ');

    try {
      execSync(compositeCmd, { stdio: 'pipe', timeout: 600000 });
    } catch (e) {
      console.error(`  ✗ ffmpeg composite failed: ${e.stderr?.toString().split('\n').slice(-5).join('\n') || e.message}`);

      // Fallback: output main video only
      console.log('  Falling back to main video only...');
      const fallbackCmd = `ffmpeg -y -f concat -safe 0 -i "${mainConcatPath}" -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "${OUTPUT}"`;
      try {
        execSync(fallbackCmd, { stdio: 'pipe', timeout: 300000 });
      } catch (e2) {
        console.error(`  ✗ Fallback also failed: ${e2.message}`);
        process.exit(1);
      }
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

    // Clean up frames
    for (const dir of [MAIN_FRAMES_DIR, POPUP_FRAMES_DIR]) {
      try {
        const frames = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
        for (const f of frames) fs.unlinkSync(path.join(dir, f));
        console.log(`  Cleaned up ${frames.length} frames in ${path.basename(dir)}`);
      } catch {}
    }

    // Clean up user data dir
    try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
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
