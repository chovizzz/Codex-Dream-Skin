import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  INSPECTOR_CLOSE_EXPRESSION,
  assertInspectorRuntimeSupport,
  assertInspectorPortOwnership,
  assertInspectorProcessIdentity,
  buildApplyMainExpression,
  buildRestoreMainExpression,
  validatedInspectorUrl,
} from "../scripts/inspector-pulse.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(here, "../scripts");

function createElectronFixture() {
  const appListeners = new Map();
  const makeWebContents = (url) => {
    const listeners = new Map();
    return {
      calls: [],
      destroyed: false,
      getURL: () => url,
      isDestroyed() { return this.destroyed; },
      executeJavaScript(source) {
        this.calls.push(source);
        return Promise.resolve(source.includes("__dreamSkinRemoved")
          ? true
          : { installed: true, pass: true });
      },
      on(name, listener) { listeners.set(name, listener); },
      removeListener(name, listener) {
        if (listeners.get(name) === listener) listeners.delete(name);
      },
      listeners,
    };
  };
  const appWebContents = makeWebContents("app://codex/index.html");
  const externalWebContents = makeWebContents("https://example.com/");
  const BrowserWindow = {
    getAllWindows: () => [
      { webContents: appWebContents },
      { webContents: externalWebContents },
    ],
  };
  const app = {
    on(name, listener) { appListeners.set(name, listener); },
    removeListener(name, listener) {
      if (appListeners.get(name) === listener) appListeners.delete(name);
    },
  };
  const context = {
    globalThis: {},
    require(name) {
      assert.equal(name, "electron");
      return { app, BrowserWindow };
    },
    Promise,
    setTimeout,
  };
  return { appListeners, appWebContents, context, externalWebContents };
}

const payload = "window.__dreamSkinPayloadRan = true";
const applyFixture = createElectronFixture();
const applyResult = await vm.runInNewContext(
  buildApplyMainExpression(payload),
  applyFixture.context,
);
assert.equal(applyResult.installed, true);
assert.deepEqual(applyFixture.appWebContents.calls, [payload]);
assert.deepEqual(applyFixture.externalWebContents.calls, []);
assert.ok(applyFixture.appWebContents.listeners.has("dom-ready"));
assert.ok(applyFixture.appListeners.has("browser-window-created"));

const restoreExpression = "window.__dreamSkinRemoved = true";
const restoreResult = await vm.runInNewContext(
  buildRestoreMainExpression(restoreExpression),
  applyFixture.context,
);
assert.equal(restoreResult.restored, true);
assert.deepEqual(applyFixture.appWebContents.calls, [payload, restoreExpression]);
assert.deepEqual(applyFixture.externalWebContents.calls, []);
assert.equal(applyFixture.appWebContents.listeners.has("dom-ready"), false);
assert.equal(applyFixture.appListeners.has("browser-window-created"), false);

assert.equal(
  validatedInspectorUrl(
    { type: "node", webSocketDebuggerUrl: "ws://127.0.0.1:9229/12345678-abcd" },
    9229,
  ),
  "ws://127.0.0.1:9229/12345678-abcd",
);
assert.throws(
  () => validatedInspectorUrl(
    { type: "node", webSocketDebuggerUrl: "ws://192.168.1.5:9229/12345678-abcd" },
    9229,
  ),
  /loopback/,
);
assert.throws(() => assertInspectorPortOwnership([991], 992), /another process/);
assert.doesNotThrow(() => assertInspectorPortOwnership([992], 992));
assert.throws(() => assertInspectorProcessIdentity(991, 992), /PID/);
assert.doesNotThrow(() => assertInspectorProcessIdentity(992, 992));
assert.match(INSPECTOR_CLOSE_EXPRESSION, /require\(["']inspector["']\)\.close/);
assert.match(INSPECTOR_CLOSE_EXPRESSION, /process\._debugEnd/);
assert.doesNotThrow(() => assertInspectorRuntimeSupport({
  WebSocket: class {},
  fetch() {},
  AbortSignal: { timeout() {} },
}, "v24.14.0"));
assert.throws(
  () => assertInspectorRuntimeSupport({
    fetch() {},
    AbortSignal: { timeout() {} },
  }, "v20.11.1"),
  /bundled Node\.js v20\.11\.1.*WebSocket.*22 or newer/,
);

const startSource = await fs.readFile(path.join(scriptsDir, "start-dream-skin-macos.sh"), "utf8");
const commonSource = await fs.readFile(path.join(scriptsDir, "common-macos.sh"), "utf8");
const installSource = await fs.readFile(path.join(scriptsDir, "install-dream-skin-macos.sh"), "utf8");
const switchSource = await fs.readFile(path.join(scriptsDir, "switch-theme-macos.sh"), "utf8");
assert.doesNotMatch(startSource, /--remote-debugging-(?:address|port)/);
assert.doesNotMatch(commonSource, /--remote-debugging-(?:address|port)/);
assert.match(commonSource, /HOT_REAPPLY_ERROR/);
assert.match(switchSource, /HOT_REAPPLY_ERROR/);
assert.doesNotMatch(commonSource, /"\$PULSE" --apply[^\n]*[\s\S]{0,220}>\/dev\/null 2>&1/);
assert.match(commonSource, /HOT_REAPPLY_ERROR=.*head -n 1/);
assert.doesNotMatch(commonSource, /HOT_REAPPLY_ERROR=.*tail -n 1/);
assert.match(commonSource, /com\.codex-dream-skin\.apex53-once/);
assert.match(startSource, /release_codex_launchd_job/);
const installCleanupIndex = installSource.indexOf("release_codex_launchd_job");
const installRunningGuardIndex = installSource.indexOf(
  'codex_is_running && fail "Close Codex before installation',
);
assert.ok(
  installCleanupIndex >= 0
    && installRunningGuardIndex >= 0
    && installCleanupIndex < installRunningGuardIndex,
  "Installer must remove legacy Codex keepalive jobs before checking whether Codex is running",
);

console.log("PASS: Node Inspector pulse transport is scoped, identity-checked, and short-lived.");
