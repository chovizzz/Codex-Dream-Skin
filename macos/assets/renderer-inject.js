((cssText, artDataUrls, themeConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const SHELL_ATTR = "data-dream-shell";
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const THEME_VARIABLES = [
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--dream-skin-name", "--dream-skin-tagline", "--dream-skin-project-prefix",
    "--dream-skin-project-label",
  ];
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }
  if (previous?.restoreContrast) previous.restoreContrast();
  for (const artUrl of Object.values(previous?.artUrls || {})) URL.revokeObjectURL(artUrl);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);

  const createArtUrl = (artDataUrl) => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };
  const artUrls = {
    home: createArtUrl(artDataUrls.home),
    task: createArtUrl(artDataUrls.task || artDataUrls.home),
    sidebar: createArtUrl(artDataUrls.sidebar || artDataUrls.home),
  };

  const cssString = (value) => JSON.stringify(String(value ?? ""));
  const contrastOriginals = new Map();

  const forceContrast = (node, property, value) => {
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
    let original = contrastOriginals.get(node);
    if (!original) {
      original = new Map();
      contrastOriginals.set(node, original);
    }
    if (!original.has(property)) {
      original.set(property, {
        value: node.style.getPropertyValue(property),
        priority: node.style.getPropertyPriority(property),
      });
    }
    node.style.setProperty(property, value, "important");
  };

  const restoreContrast = () => {
    for (const [node, properties] of contrastOriginals) {
      for (const [property, original] of properties) {
        if (original.value) node.style.setProperty(property, original.value, original.priority);
        else node.style.removeProperty(property);
      }
    }
    contrastOriginals.clear();
  };

  const applyContrastFixes = () => {
    const lightShell = document.documentElement.getAttribute(SHELL_ATTR) === "light";
    if (lightShell) {
      document.querySelectorAll("main.main-surface > header.app-header-tint button").forEach((node) => {
        const isAccent = node.classList.contains("bg-token-foreground");
        forceContrast(node, "color", isAccent ? "#071116" : (node.getAttribute("aria-pressed") === "true" ? "#1f2f37" : "#4f6f80"));
        forceContrast(node, "opacity", "1");
        node.querySelectorAll("svg").forEach((svg) => forceContrast(svg, "color", isAccent ? "#071116" : "#4f6f80"));
      });
    }

    const lightComposer = lightShell && document.querySelector(".composer-surface-chrome");
    if (lightComposer) {
      forceContrast(lightComposer, "color", "#1f1a1b");
      forceContrast(lightComposer, "background", "rgba(255, 255, 255, .96)");
      lightComposer.querySelectorAll(".ProseMirror, [contenteditable=\"true\"], .placeholder").forEach((node) => {
        forceContrast(node, "color", "#3f3439");
        forceContrast(node, "font-weight", "500");
        forceContrast(node, "opacity", "1");
      });
      lightComposer.querySelectorAll("button").forEach((node) => {
        const permission = node.getAttribute("data-composer-navigation-target") === "permissions";
        const accent = node.classList.contains("bg-token-foreground");
        forceContrast(node, "color", accent ? "#071116" : permission ? "#a43f00" : "#425662");
        forceContrast(node, "opacity", "1");
        node.querySelectorAll("span, svg").forEach((child) => {
          forceContrast(child, "color", accent ? "#071116" : permission ? "#a43f00" : "#425662");
          forceContrast(child, "opacity", "1");
        });
      });
    }

    const darkComposer = !lightShell && document.querySelector(".composer-surface-chrome");
    if (darkComposer) {
      forceContrast(darkComposer, "color", "#f7fafc");
      forceContrast(darkComposer, "background", "linear-gradient(145deg, rgba(8, 27, 42, .96), rgba(7, 21, 34, .94))");
      forceContrast(darkComposer, "border", "1px solid rgba(169, 221, 244, .34)");
      darkComposer.querySelectorAll(".ProseMirror, [contenteditable=\"true\"]").forEach((node) => {
        forceContrast(node, "color", "#f7fafc");
        forceContrast(node, "caret-color", "#ff4351");
        forceContrast(node, "opacity", "1");
      });
      darkComposer.querySelectorAll(".placeholder").forEach((node) => {
        forceContrast(node, "color", "#b8cedb");
        forceContrast(node, "font-weight", "500");
        forceContrast(node, "opacity", "1");
      });
      darkComposer.querySelectorAll("button").forEach((node) => {
        const permission = node.getAttribute("data-composer-navigation-target") === "permissions";
        const accent = node.classList.contains("bg-token-foreground");
        forceContrast(node, "color", accent ? "#071116" : permission ? "#ffb074" : "#d6e9f3");
        forceContrast(node, "opacity", "1");
        node.querySelectorAll("span, svg").forEach((child) => {
          forceContrast(child, "color", accent ? "#071116" : permission ? "#ffb074" : "#d6e9f3");
          forceContrast(child, "opacity", "1");
        });
      });
    }

    const pluginSearch = document.querySelector('input[placeholder="Search plugins"]');
    if (pluginSearch) {
      const pluginShell = pluginSearch.parentElement;
      const pluginRow = pluginShell?.parentElement;
      const pluginSticky = pluginRow?.parentElement;
      forceContrast(pluginSearch, "color", "#f7fafc");
      forceContrast(pluginSearch, "caret-color", "#ff4351");
      if (pluginShell) {
        forceContrast(pluginShell, "background", "rgba(8, 27, 42, .88)");
        forceContrast(pluginShell, "border", "1px solid rgba(169, 221, 244, .34)");
        forceContrast(pluginShell, "color", "#b8cedb");
      }
      if (pluginSticky) {
        forceContrast(pluginSticky, "background", "linear-gradient(180deg, rgba(7, 21, 34, .98), rgba(7, 21, 34, .86))");
        forceContrast(pluginSticky, "border-bottom", "1px solid rgba(169, 221, 244, .18)");
      }
      document.querySelectorAll('main.main-surface section:has(.group\\/plugin-row) .line-clamp-1').forEach((node) => {
        forceContrast(node, "color", "#b8cedb");
        forceContrast(node, "opacity", "1");
      });
      document.querySelectorAll('main.main-surface:has(input[placeholder="Search plugins"]) .text-token-foreground').forEach((node) => {
        forceContrast(node, "color", "#f7fafc");
        forceContrast(node, "opacity", "1");
      });
    }

    document.querySelectorAll('aside.app-shell-left-panel button[class*="!opacity-75"]').forEach((node) => {
      forceContrast(node, "color", "#f7fafc");
      forceContrast(node, "opacity", "1");
    });

    document.querySelectorAll('[class*="group/activity-header"]').forEach((header) => {
      forceContrast(header, "color", "#b8cedb");
      header.querySelectorAll("*").forEach((node) => {
        forceContrast(node, "color", "#b8cedb");
        forceContrast(node, "opacity", "1");
      });
    });

    document.querySelectorAll('[class*="group/turn-diff-header"]').forEach((header) => {
      const card = header.parentElement;
      if (card) {
        forceContrast(card, "background", "rgba(8, 27, 42, .94)");
        forceContrast(card, "border", "1px solid rgba(169, 221, 244, .28)");
        forceContrast(card, "color", "#f7fafc");
      }
      header.querySelectorAll("*").forEach((node) => {
        const fogButton = node.closest?.("button.bg-token-bg-fog");
        forceContrast(node, "color", fogButton ? "#1a1c1f" : "#f7fafc");
      });
      card?.querySelectorAll(".text-token-git-decoration-added-resource-foreground")
        .forEach((node) => forceContrast(node, "color", "#49dc80"));
      card?.querySelectorAll(".text-token-git-decoration-deleted-resource-foreground")
        .forEach((node) => forceContrast(node, "color", "#ff7373"));
    });

    document.querySelectorAll(".text-token-text-tertiary").forEach((node) => {
      if (!node.closest(".composer-surface-chrome")) {
        forceContrast(node, "color", "#9fb9c8");
        forceContrast(node, "opacity", "1");
      }
    });
    document.querySelectorAll(".loading-shimmer-pure-text").forEach((node) => {
      forceContrast(node, "color", "#9fb9c8");
    });

    const scheduledHeading = [...document.querySelectorAll("h1")]
      .find((node) => node.textContent.trim() === "Scheduled tasks");
    if (scheduledHeading) {
      forceContrast(scheduledHeading, "color", "#f7fafc");
      document.querySelectorAll("h2, h3").forEach((node) => {
        forceContrast(node, "color", "#f7fafc");
        forceContrast(node, "text-shadow", "0 2px 8px rgba(0, 0, 0, .72)");
      });
      scheduledHeading.parentElement?.querySelectorAll(":scope > *:not(h1)").forEach((node) => {
        forceContrast(node, "color", "#b8cedb");
      });
      document.querySelectorAll(".automation-row").forEach((row) => {
        forceContrast(row, "background", "rgba(8, 27, 42, .82)");
        forceContrast(row, "border", "1px solid rgba(169, 221, 244, .2)");
        forceContrast(row, "margin-bottom", "8px");
        forceContrast(row, "opacity", "1");
        row.querySelectorAll(".text-token-foreground").forEach((node) => {
          forceContrast(node, "color", "#f7fafc");
        });
        row.querySelectorAll(".text-token-description-foreground").forEach((node) => {
          forceContrast(node, "color", "#b8cedb");
          forceContrast(node, "opacity", "1");
        });
      });
      document.querySelectorAll('button[aria-pressed="true"]').forEach((node) => {
        // A slightly deeper racing red keeps white All text above 4.5:1.
        forceContrast(node, "background", "#d8142e");
        forceContrast(node, "color", "#ffffff");
        forceContrast(node, "border", "1px solid rgba(255, 255, 255, .28)");
      });
      document.querySelectorAll('button[aria-pressed="false"]').forEach((node) => {
        forceContrast(node, "background", "rgba(8, 27, 42, .68)");
        forceContrast(node, "color", "#d6e9f3");
        forceContrast(node, "border", "1px solid rgba(169, 221, 244, .18)");
      });

      // Scheduled's native light input token and sticky fade sit above the
      // image as their own cascade layer. Keep the live controls in the same
      // dark pit-wall surface as the filter pills.
      const scheduledSearch = document.querySelector("#scheduled-page-search");
      if (scheduledSearch) {
        const searchShell = scheduledSearch.parentElement;
        const searchRow = searchShell?.parentElement;
        const searchSticky = searchRow?.parentElement;
        forceContrast(scheduledSearch, "color", "#f7fafc");
        forceContrast(scheduledSearch, "caret-color", "#ff4351");
        if (searchShell) {
          forceContrast(searchShell, "background", "rgba(8, 27, 42, .88)");
          forceContrast(searchShell, "border", "1px solid rgba(169, 221, 244, .34)");
          forceContrast(searchShell, "color", "#b8cedb");
        }
        if (searchSticky) {
          forceContrast(searchSticky, "background", "linear-gradient(180deg, rgba(7, 21, 34, .98) 0%, rgba(7, 21, 34, .94) 66%, rgba(7, 21, 34, .82) 100%)");
          forceContrast(searchSticky, "border-bottom", "1px solid rgba(169, 221, 244, .18)");
        }
        const selectedFilter = document.querySelector('button[aria-pressed="true"]');
        const filterRow = selectedFilter?.parentElement?.parentElement;
        if (filterRow) {
          forceContrast(filterRow, "background", "linear-gradient(135deg, rgba(8, 27, 42, .94), rgba(7, 21, 34, .80))");
          forceContrast(filterRow, "border", "1px solid rgba(169, 221, 244, .22)");
          forceContrast(filterRow, "color", "#f7fafc");
        }
      }
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    try {
      const cs = getComputedStyle(root).colorScheme || "";
      if (cs.includes("dark") && !cs.includes("light")) return "dark";
      if (cs.includes("light") && !cs.includes("dark")) return "light";
    } catch {}

    // Background luminance of main surfaces
    const samples = [
      body,
      document.querySelector("main.main-surface"),
      document.querySelector("aside.app-shell-left-panel"),
    ].filter(Boolean);
    let votesLight = 0;
    let votesDark = 0;
    for (const el of samples) {
      try {
        const rgb = parseRgb(getComputedStyle(el).backgroundColor);
        if (!rgb) continue;
        const L = luminance(rgb);
        if (L >= 0.55) votesLight += 1;
        else if (L <= 0.25) votesDark += 1;
      } catch {}
    }
    if (votesLight > votesDark) return "light";
    if (votesDark > votesLight) return "dark";

    try {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch {}
    return "light";
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    const accent = colors.accent || (shell === "light" ? "#e25563" : "#7cff46");
    const accentAlt = colors.accentAlt || accent;
    const secondary = colors.secondary || (shell === "light" ? "#f3a8af" : "#36d7e8");
    const highlight = colors.highlight || (shell === "light" ? "#c93d4c" : "#642a8c");

    let variables;
    if (shell === "light") {
      // Structural tokens stay light so banners stay readable; accents follow theme.
      variables = {
        "--ds-bg": "#f6f2f3",
        "--ds-panel": "#ffffff",
        "--ds-panel-2": "#fff7f8",
        "--ds-green": accent,
        "--ds-lime": accentAlt,
        "--ds-cyan": secondary,
        "--ds-purple": highlight,
        "--ds-text": "#1f1a1b",
        "--ds-muted": "#6b5f62",
        "--ds-line": colors.line || "rgba(196, 120, 128, .22)",
      };
    } else {
      variables = {
        "--ds-bg": colors.background || "#071116",
        "--ds-panel": colors.panel || "#0b1a20",
        "--ds-panel-2": colors.panelAlt || "#10272c",
        "--ds-green": accent,
        "--ds-lime": accentAlt,
        "--ds-cyan": secondary,
        "--ds-purple": highlight,
        "--ds-text": colors.text || "#e9fff1",
        "--ds-muted": colors.muted || "#9ebdb3",
        "--ds-line": colors.line || "rgba(124, 255, 70, .28)",
      };
    }

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) root.style.setProperty(name, value);
    }
    root.style.setProperty("--dream-skin-name", cssString(THEME.name || "Codex Dream Skin"));
    root.style.setProperty("--dream-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    root.style.setProperty("--dream-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    root.style.setProperty("--dream-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamSkinVersion = VERSION;
  }

  const ensure = () => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    const forcedShell = THEME.shellMode === "dark" || THEME.shellMode === "light"
      ? THEME.shellMode : null;
    const shell = forcedShell || detectShellMode();
    root.classList.add("codex-dream-skin");
    root.setAttribute(SHELL_ATTR, shell);
    root.style.setProperty("--dream-skin-art", `url("${artUrls.home}")`);
    root.style.setProperty("--dream-skin-home-art", `url("${artUrls.home}")`);
    root.style.setProperty("--dream-skin-task-art", `url("${artUrls.task}")`);
    root.style.setProperty("--dream-skin-sidebar-art", `url("${artUrls.sidebar}")`);
    applyTheme(root, shell);
    applyContrastFixes();

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamSkinVersion !== VERSION) {
      style.textContent = cssText;
      style.dataset.dreamSkinVersion = VERSION;
    }

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home')) {
      if (candidate !== home) candidate.classList.remove("dream-skin-home");
    }
    if (home) home.classList.add("dream-skin-home");

    if (!shellMain || !document.body) return;
    const scheduledHeading = [...document.querySelectorAll("h1")]
      .find((node) => node.textContent.trim() === "Scheduled tasks");
    shellMain.classList.toggle("dream-skin-home-shell", Boolean(home));
    shellMain.classList.toggle("dream-skin-scheduled-shell", Boolean(scheduledHeading));
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-skin-brand">
          <span class="dream-skin-portal-mark">◉</span>
          <span><b></b><small></small></span>
        </div>
        <div class="dream-skin-status"><i></i><span></span></div>
        <div class="dream-skin-quote"></div>
        <div class="dream-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dream-skin-orbit"></div>`;
      document.body.appendChild(chrome);
    }
    chrome.querySelector(".dream-skin-brand b").textContent = THEME.name || "Codex Dream Skin";
    chrome.querySelector(".dream-skin-brand small").textContent = THEME.brandSubtitle || "CODEX DREAM SKIN";
    chrome.querySelector(".dream-skin-status span").textContent = THEME.statusText || "DREAM SKIN ONLINE";
    chrome.querySelector(".dream-skin-quote").textContent = THEME.quote || "MAKE SOMETHING WONDERFUL";
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle("dream-skin-home-shell", Boolean(home));
    chrome.dataset.dreamShell = shell;
  };

  const cleanup = () => {
    window[DISABLED_KEY] = true;
    document.documentElement?.classList.remove("codex-dream-skin");
    document.documentElement?.removeAttribute(SHELL_ATTR);
    document.documentElement?.style.removeProperty("--dream-skin-art");
    document.documentElement?.style.removeProperty("--dream-skin-home-art");
    document.documentElement?.style.removeProperty("--dream-skin-task-art");
    document.documentElement?.style.removeProperty("--dream-skin-sidebar-art");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-scheduled-shell").forEach((node) => node.classList.remove("dream-skin-scheduled-shell"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    restoreContrast();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    for (const artUrl of Object.values(state?.artUrls || {})) URL.revokeObjectURL(artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
  });
  const timer = setInterval(ensure, 4000);
  const resizeHandler = scheduleEnsure;
  window.addEventListener("resize", resizeHandler, { passive: true });

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure();
    mediaQuery.addEventListener("change", mediaHandler);
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    resizeHandler,
    mediaQuery,
    mediaHandler,
    artUrls,
    restoreContrast,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
  };
  ensure();
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    shell: THEME.shellMode === "dark" || THEME.shellMode === "light" ? THEME.shellMode : detectShellMode(),
  };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__)
