import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  INSPECTOR_CLOSE_EXPRESSION,
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

const startSource = await fs.readFile(path.join(scriptsDir, "start-dream-skin-macos.sh"), "utf8");
const commonSource = await fs.readFile(path.join(scriptsDir, "common-macos.sh"), "utf8");
assert.doesNotMatch(startSource, /--remote-debugging-(?:address|port)/);
assert.doesNotMatch(commonSource, /--remote-debugging-(?:address|port)/);

console.log("PASS: Node Inspector pulse transport is scoped, identity-checked, and short-lived.");
