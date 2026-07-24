import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  earlyPayloadFor,
  loadPayload,
  rendererRemoveExpression,
  rendererVerifyExpression,
  rendererVerifyRemovedExpression,
} from "./injector.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const INSPECTOR_PORT = 9229;
const MAIN_RUNTIME_KEY = "__CODEX_DREAM_SKIN_MAIN_RUNTIME__";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const INSPECTOR_CLOSE_EXPRESSION = `setTimeout(() => {
  try { require("inspector").close(); } catch {}
  try { if (typeof process._debugEnd === "function") process._debugEnd(); } catch {}
}, 25)`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const options = {
    mode: "apply",
    port: INSPECTOR_PORT,
    timeoutMs: 30000,
    themeDir: null,
    pid: null,
    initialPid: null,
    codexExe: null,
    screenshot: null,
    reload: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.mode = "apply";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++index]);
    else if (arg === "--pid") options.pid = Number(argv[++index]);
    else if (arg === "--initial-pid") options.initialPid = Number(argv[++index]);
    else if (arg === "--codex-exe") options.codexExe = path.resolve(argv[++index]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++index]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.port !== INSPECTOR_PORT) {
    throw new Error(`Node Inspector pulse requires loopback port ${INSPECTOR_PORT}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 500 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  for (const [name, value] of [["pid", options.pid], ["initial PID", options.initialPid]]) {
    if (value !== null && (!Number.isInteger(value) || value < 2 || value > 2 ** 31 - 1)) {
      throw new Error(`Invalid ${name}: ${value}`);
    }
  }
  if (options.mode === "watch" && !options.codexExe) {
    throw new Error("Watch mode requires --codex-exe");
  }
  return options;
}

export function validatedInspectorUrl(target, port = INSPECTOR_PORT) {
  if (!target || target.type !== "node" || typeof target.webSocketDebuggerUrl !== "string") {
    throw new Error("Node Inspector did not publish a WebSocket URL");
  }
  const url = new URL(target.webSocketDebuggerUrl);
  if (
    url.protocol !== "ws:"
    || !LOOPBACK_HOSTS.has(url.hostname)
    || Number(url.port) !== port
    || url.username
    || url.password
    || url.search
    || url.hash
    || !/^\/[A-Za-z0-9._-]{8,200}$/.test(url.pathname)
  ) {
    throw new Error("Rejected a Node Inspector WebSocket URL outside the allowed loopback endpoint shape");
  }
  return url.href;
}

export function assertInspectorPortOwnership(listenerPids, expectedPid) {
  const listeners = [...new Set(listenerPids.map(Number).filter(Number.isInteger))];
  if (listeners.some((pid) => pid !== Number(expectedPid))) {
    throw new Error(`Node Inspector port ${INSPECTOR_PORT} belongs to another process; refusing to attach`);
  }
}

export function assertInspectorProcessIdentity(actualPid, expectedPid) {
  if (Number(actualPid) !== Number(expectedPid)) {
    throw new Error(`Node Inspector PID ${actualPid} does not match verified Codex PID ${expectedPid}`);
  }
}

async function listenerPids(port) {
  try {
    const { stdout } = await execFileAsync(
      "/usr/sbin/lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", timeout: 2000 },
    );
    return stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
  } catch (error) {
    if (error.code === 1) return [];
    throw new Error(`Could not inspect Node Inspector port ownership: ${error.message}`);
  }
}

async function processExecutablePath(pid) {
  try {
    const { stdout } = await execFileAsync(
      "/usr/sbin/lsof",
      ["-a", "-p", String(pid), "-d", "txt", "-Fn"],
      { encoding: "utf8", timeout: 2000 },
    );
    return stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) || "";
  } catch {
    return "";
  }
}

async function canonicalPath(candidate) {
  try { return await fs.realpath(candidate); } catch { return ""; }
}

export async function findCodexMainPid(codexExe) {
  const expected = await canonicalPath(codexExe);
  if (!expected) return null;
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "/bin/ps",
      ["-axo", "pid=,command="],
      { encoding: "utf8", timeout: 3000 },
    ));
  } catch {
    return null;
  }
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!match || match[2].includes("--type=")) continue;
    if (match[2] !== codexExe && !match[2].startsWith(`${codexExe} `)) continue;
    const pid = Number(match[1]);
    const actual = await canonicalPath(await processExecutablePath(pid));
    if (actual && actual === expected) return pid;
  }
  return null;
}

function triggerInspector(pid) {
  try {
    if (typeof process._debugProcess === "function") {
      process._debugProcess(Number(pid));
      return;
    }
  } catch {}
  process.kill(Number(pid), "SIGUSR1");
}

async function fetchInspectorTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    redirect: "error",
    signal: AbortSignal.timeout(1200),
  });
  if (!response.ok) throw new Error(`Node Inspector HTTP endpoint returned ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets) || targets.length !== 1) {
    throw new Error("Node Inspector returned an unexpected target list");
  }
  return targets[0];
}

class InspectorSession {
  constructor(url, timeoutMs) {
    this.ws = new WebSocket(url);
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
  }

  async open(openTimeoutMs = Math.min(this.timeoutMs, 8000)) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Node Inspector WebSocket open timed out")), openTimeoutMs);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Node Inspector WebSocket connection failed"));
      }, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      const pending = message.id ? this.pending.get(message.id) : null;
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message || "Node Inspector command failed"));
      else pending.resolve(message.result);
    });
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Node Inspector closed before command completion"));
      }
      this.pending.clear();
    }, { once: true });
    await this.send("Runtime.enable");
    return this;
  }

  send(method, params = {}, { expectReply = true } = {}) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Node Inspector WebSocket is not open"));
    }
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });
    if (!expectReply) {
      this.ws.send(message);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`Node Inspector command timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { reject, resolve, timeout });
      try { this.ws.send(message); } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      includeCommandLineAPI: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description
        || response.exceptionDetails.text
        || "Node Inspector evaluation failed",
      );
    }
    return response.result?.value;
  }

  async closeInspector() {
    try {
      await this.send("Runtime.evaluate", { expression: INSPECTOR_CLOSE_EXPRESSION }, { expectReply: false });
      await sleep(180);
    } catch {}
    try { this.ws.close(); } catch {}
    this.closed = true;
  }

  disconnect() {
    try { this.ws.close(); } catch {}
    this.closed = true;
  }
}

async function openInspector(pid, port, timeoutMs) {
  const existingListeners = await listenerPids(port);
  assertInspectorPortOwnership(existingListeners, pid);
  if (existingListeners.length === 0) triggerInspector(pid);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    let candidateSession = null;
    try {
      assertInspectorPortOwnership(await listenerPids(port), pid);
      const target = await fetchInspectorTarget(port);
      candidateSession = new InspectorSession(
        validatedInspectorUrl(target, port),
        timeoutMs + 2500,
      );
      await candidateSession.open(Math.max(500, Math.min(8000, deadline - Date.now())));
      const attachedPid = await candidateSession.evaluate("process.pid");
      assertInspectorProcessIdentity(attachedPid, pid);
      return candidateSession;
    } catch (error) {
      candidateSession?.disconnect();
      lastError = error;
      if (/another process|does not match verified Codex PID/.test(error.message)) throw error;
      await sleep(120);
    }
  }
  throw new Error(`Node Inspector did not become ready: ${lastError?.message || "timed out"}`);
}

export async function pulse(expression, {
  pid,
  codexExe,
  port = INSPECTOR_PORT,
  timeoutMs = 10000,
  awaitPromise = true,
} = {}) {
  if (!Number.isInteger(pid) || pid < 2) throw new Error("A verified Codex PID is required");
  if (!codexExe) throw new Error("The verified Codex executable path is required");
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let session = null;
    try {
      const currentPid = await findCodexMainPid(codexExe);
      if (currentPid !== pid) {
        throw new Error(`Codex PID ${pid} no longer matches executable ${codexExe}`);
      }
      session = await openInspector(pid, port, timeoutMs);
      return await session.evaluate(expression, awaitPromise);
    } catch (error) {
      lastError = error;
      if (/another process|does not match verified Codex PID/.test(error.message)) throw error;
    } finally {
      if (session) {
        await session.closeInspector();
        const closeDeadline = Date.now() + 1500;
        let remaining = await listenerPids(port);
        while (remaining.includes(pid) && Date.now() < closeDeadline) {
          await sleep(50);
          remaining = await listenerPids(port);
        }
        if (remaining.includes(pid)) {
          throw new Error(`Node Inspector port ${port} remained open after the pulse`);
        }
      }
    }
    await sleep(350);
  }
  throw lastError;
}

export function buildApplyMainExpression(rendererPayload, { reload = false } = {}) {
  return `(() => {
    const { app, BrowserWindow } = require("electron");
    const key = ${JSON.stringify(MAIN_RUNTIME_KEY)};
    let runtime = globalThis[key];
    if (!runtime || !(runtime.hooks instanceof Map)) {
      runtime = { payload: "", hooks: new Map(), onNewWindow: null };
      globalThis[key] = runtime;
    }
    const isApp = (webContents) => {
      try {
        return webContents && !webContents.isDestroyed() &&
          String(webContents.getURL() || "").startsWith("app://");
      } catch { return false; }
    };
    const inject = (webContents) => {
      if (!runtime.payload || !isApp(webContents)) return Promise.resolve({ skipped: true });
      return Promise.resolve(webContents.executeJavaScript(runtime.payload))
        .then((result) => ({ ok: true, url: webContents.getURL(), result }))
        .catch((error) => ({ ok: false, url: webContents.getURL(), error: String(error?.message || error) }));
    };
    const hook = (webContents) => {
      if (!webContents || runtime.hooks.has(webContents)) return;
      const handler = () => { void inject(webContents); };
      runtime.hooks.set(webContents, handler);
      webContents.on("dom-ready", handler);
    };
    runtime.payload = ${JSON.stringify(rendererPayload)};
    runtime.inject = inject;
    runtime.hook = hook;
    if (!runtime.onNewWindow) {
      runtime.onNewWindow = (_event, window) => {
        hook(window?.webContents);
        void inject(window?.webContents);
      };
      app.on("browser-window-created", runtime.onNewWindow);
    }
    const targets = BrowserWindow.getAllWindows()
      .map((window) => window.webContents)
      .filter(isApp);
    for (const webContents of targets) hook(webContents);
    ${reload ? `for (const webContents of targets) {
      try {
        if (!webContents.getURL().includes("avatar-overlay")) webContents.reloadIgnoringCache();
      } catch {}
    }` : ""}
    return Promise.all(targets.map(inject)).then((results) => ({
      installed: true,
      hookedTargets: targets.length,
      results,
    }));
  })()`;
}

export function buildVerifyMainExpression(rendererExpression, { timeoutMs = 10000, screenshot = false } = {}) {
  return `(() => {
    const { BrowserWindow } = require("electron");
    const isApp = (webContents) => {
      try {
        return webContents && !webContents.isDestroyed() &&
          String(webContents.getURL() || "").startsWith("app://");
      } catch { return false; }
    };
    const inspect = async () => {
      const targets = BrowserWindow.getAllWindows().map((window) => window.webContents).filter(isApp);
      return Promise.all(targets.map(async (webContents) => {
        try {
          const result = await webContents.executeJavaScript(${JSON.stringify(rendererExpression)});
          return { ok: true, url: webContents.getURL(), result, webContents };
        } catch (error) {
          return { ok: false, url: webContents.getURL(), error: String(error?.message || error), webContents };
        }
      }));
    };
    const run = async () => {
      const deadline = Date.now() + ${Math.max(500, Math.min(120000, timeoutMs))};
      let targets = [];
      do {
        targets = await inspect();
        const passed = targets.find((target) =>
          target.ok && target.result?.pass === true && target.result?.shell?.visible === true)
          || targets.find((target) =>
            target.ok && target.result?.pass === true && target.result?.scope?.level === "L1")
          || targets.find((target) =>
            target.ok && target.result?.pass === true && !target.url.includes("avatar-overlay"));
        if (passed) {
          let screenshotBase64 = null;
          if (${Boolean(screenshot)}) {
            const image = await passed.webContents.capturePage();
            screenshotBase64 = image.toPNG().toString("base64");
          }
          return {
            pass: true,
            targets: targets.map(({ webContents: _webContents, ...target }) => target),
            screenshotBase64,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      } while (Date.now() < deadline);
      return {
        pass: false,
        targets: targets.map(({ webContents: _webContents, ...target }) => target),
        screenshotBase64: null,
      };
    };
    return run();
  })()`;
}

export function buildRestoreMainExpression(rendererExpression, verifyExpression = null) {
  return `(() => {
    const { app, BrowserWindow } = require("electron");
    const key = ${JSON.stringify(MAIN_RUNTIME_KEY)};
    const runtime = globalThis[key];
    if (runtime) {
      runtime.payload = "";
      if (runtime.onNewWindow) app.removeListener("browser-window-created", runtime.onNewWindow);
      if (runtime.hooks instanceof Map) {
        for (const [webContents, handler] of runtime.hooks) {
          try { webContents.removeListener("dom-ready", handler); } catch {}
        }
        runtime.hooks.clear();
      }
      delete globalThis[key];
    }
    const isApp = (webContents) => {
      try {
        return webContents && !webContents.isDestroyed() &&
          String(webContents.getURL() || "").startsWith("app://");
      } catch { return false; }
    };
    const targets = BrowserWindow.getAllWindows().map((window) => window.webContents).filter(isApp);
    return Promise.all(targets.map(async (webContents) => {
      try {
        const removed = await webContents.executeJavaScript(${JSON.stringify(rendererExpression)});
        const verified = ${verifyExpression === null
          ? "removed === true"
          : `await webContents.executeJavaScript(${JSON.stringify(verifyExpression)})`};
        return { ok: removed === true && verified === true, url: webContents.getURL() };
      } catch (error) {
        return { ok: false, url: webContents.getURL(), error: String(error?.message || error) };
      }
    })).then((targets) => ({
      restored: targets.length === 0 || targets.every((target) => target.ok),
      targets,
    }));
  })()`;
}

async function resolvePid(options) {
  if (!options.codexExe) throw new Error("Pass --codex-exe");
  const pid = await findCodexMainPid(options.codexExe);
  if (!pid) throw new Error("Codex is not running");
  if (options.pid !== null && options.pid !== pid) {
    throw new Error(`Requested PID ${options.pid} is not the verified Codex main process ${pid}`);
  }
  return pid;
}

async function verifyTheme(options, pid, loaded) {
  const expression = buildVerifyMainExpression(
    rendererVerifyExpression(loaded.theme.id, loaded.revision),
    { timeoutMs: options.timeoutMs, screenshot: Boolean(options.screenshot) },
  );
  const result = await pulse(expression, {
    codexExe: options.codexExe,
    pid,
    port: options.port,
    timeoutMs: options.timeoutMs,
  });
  if (options.screenshot && result?.screenshotBase64) {
    await fs.mkdir(path.dirname(options.screenshot), { recursive: true });
    await fs.writeFile(options.screenshot, Buffer.from(result.screenshotBase64, "base64"), { mode: 0o600 });
    delete result.screenshotBase64;
    result.screenshot = options.screenshot;
  }
  return result;
}

async function runApply(options, pid) {
  const loaded = await loadPayload(options.themeDir);
  const applied = await pulse(
    buildApplyMainExpression(earlyPayloadFor(loaded.payload, loaded.revision), { reload: options.reload }),
    { codexExe: options.codexExe, pid, port: options.port, timeoutMs: options.timeoutMs },
  );
  const verification = await verifyTheme(options, pid, loaded);
  const output = {
    mode: "apply",
    pid,
    port: options.port,
    themeId: loaded.theme.id,
    themeName: loaded.theme.name,
    revision: loaded.revision,
    applied,
    verification,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!verification?.pass) process.exitCode = 2;
  return verification?.pass === true;
}

async function runVerify(options, pid) {
  const loaded = await loadPayload(options.themeDir);
  let reloaded = null;
  if (options.reload) {
    reloaded = await pulse(
      buildApplyMainExpression(earlyPayloadFor(loaded.payload, loaded.revision), { reload: true }),
      { codexExe: options.codexExe, pid, port: options.port, timeoutMs: options.timeoutMs },
    );
  }
  const verification = await verifyTheme(options, pid, loaded);
  console.log(JSON.stringify({
    mode: "verify",
    pid,
    port: options.port,
    themeId: loaded.theme.id,
    themeName: loaded.theme.name,
    revision: loaded.revision,
    reloaded,
    ...verification,
  }, null, 2));
  if (!verification?.pass) process.exitCode = 2;
}

async function runRemove(options, pid) {
  const result = await pulse(
    buildRestoreMainExpression(rendererRemoveExpression(), rendererVerifyRemovedExpression()),
    { codexExe: options.codexExe, pid, port: options.port, timeoutMs: options.timeoutMs },
  );
  console.log(JSON.stringify({ mode: "remove", pid, port: options.port, ...result }, null, 2));
  if (!result?.restored) process.exitCode = 2;
}

async function runWatch(options) {
  let appliedPid = options.initialPid;
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  while (!stopping) {
    try {
      const pid = await findCodexMainPid(options.codexExe);
      if (pid && pid !== appliedPid) {
        const applied = await runApply({ ...options, screenshot: null, timeoutMs: 20000 }, pid);
        if (applied) appliedPid = pid;
      } else if (!pid) {
        appliedPid = null;
      }
    } catch (error) {
      console.error(`[dream-skin-pulse] ${error.message}`);
    }
    await sleep(3500);
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "watch") await runWatch(options);
    else {
      const pid = await resolvePid(options);
      if (options.mode === "apply") await runApply(options, pid);
      else if (options.mode === "verify") await runVerify(options, pid);
      else await runRemove(options, pid);
    }
  } catch (error) {
    console.error(`[dream-skin-pulse] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}
