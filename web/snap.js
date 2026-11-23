// Code Snap panel: highlights a snippet with highlight.js, draws it on a canvas
// and exports it as PNG (clipboard or save dialog).
"use strict";

// ---------------------------------------------------------------- palettes

const THEMES = {
  "crimson-cobalt": {
    name: "Crimson Cobalt", bg: "#09090c", fg: "#d6d6de", title: "#8e8e9c", gutter: "#3e3e4a", border: "#ffffff14",
    tok: { keyword: "#ff5468", string: "#f2a7b0", number: "#ffa36b", comment: "#787e92", fn: "#5b9bff", type: "#8ab4ff",
      builtin: "#7fc3ff", literal: "#c4a2ff", attr: "#7d8bb0", meta: "#ff7a8a", variable: "#e8d9dc", property: "#b0c4f0",
      tag: "#ff5468", regexp: "#ffcc80", punct: "#9a9aa8", addition: "#6fcf8f", deletion: "#ff5468" },
  },
  "neon-siren": {
    name: "Neon Siren", bg: "#000000", fg: "#e4e0ee", title: "#958fa8", gutter: "#3e384e", border: "#ff2d5526",
    tok: { keyword: "#ff2d6f", string: "#ff8fb4", number: "#ffd23f", comment: "#7a7598", fn: "#22d3ff", type: "#4f8cff",
      builtin: "#5ee8ff", literal: "#b28cff", attr: "#8a7dff", meta: "#ff5fa2", variable: "#f3e9ff", property: "#7aa8ff",
      tag: "#ff2d6f", regexp: "#ffe680", punct: "#a29db5", addition: "#3dffa8", deletion: "#ff2d55" },
  },
  graphite: {
    name: "Graphite", bg: "#17171b", fg: "#d4d4d8", title: "#8b8b94", gutter: "#45454d", border: "#ffffff12",
    tok: { keyword: "#f472b6", string: "#a3e635", number: "#fb923c", comment: "#74747e", fn: "#60a5fa", type: "#fbbf24",
      builtin: "#38bdf8", literal: "#c084fc", attr: "#94a3b8", meta: "#f472b6", variable: "#e4e4e7", property: "#93c5fd",
      tag: "#f472b6", regexp: "#fcd34d", punct: "#a1a1aa", addition: "#4ade80", deletion: "#f87171" },
  },
  paper: {
    name: "Paper (light)", bg: "#fbfaf8", fg: "#27272a", title: "#71717a", gutter: "#b8b8c0", border: "#00000014",
    tok: { keyword: "#c0263b", string: "#1f7a4d", number: "#b45309", comment: "#8a8a94", fn: "#1d5fd6", type: "#8a4fd6",
      builtin: "#0e7490", literal: "#8a4fd6", attr: "#52525b", meta: "#c0263b", variable: "#27272a", property: "#1e40af",
      tag: "#c0263b", regexp: "#a16207", punct: "#52525b", addition: "#15803d", deletion: "#b91c1c" },
  },
};

const BACKGROUNDS = {
  doppler: { name: "Doppler", stops: ["#ff4d61", "#7b6cff", "#22d3ff"] },
  siren: { name: "Siren", stops: ["#ff2d55", "#22d3ff"] },
  dusk: { name: "Dusk", stops: ["#f97316", "#db2777", "#6d28d9"] },
  ocean: { name: "Ocean", stops: ["#0ea5e9", "#1e3a8a"] },
  mint: { name: "Mint", stops: ["#34d399", "#0ea5e9"] },
  graphite: { name: "Graphite", solid: "#1c1c22" },
  none: { name: "None (transparent)" },
};

const DEFAULTS = { theme: "crimson-cobalt", bg: "doppler", pad: 56, chrome: true, numbers: false };

// highlight.js scope (class names joined with ".") → palette token.
const SCOPES = {
  keyword: "keyword", "variable.language_": "keyword", doctag: "keyword", bullet: "keyword", "template-tag": "keyword",
  built_in: "builtin", type: "type", "title.class_": "type", "title.class_.inherited__": "type",
  literal: "literal", symbol: "literal", "variable.constant_": "literal",
  number: "number", string: "string", link: "string", code: "string", "char.escape_": "regexp", regexp: "regexp",
  comment: "comment", quote: "comment",
  title: "fn", "title.function_": "fn", "title.function_.invoke__": "fn", section: "fn",
  "selector-class": "fn", "selector-id": "fn",
  attr: "attr", attribute: "attr", "selector-attr": "attr", "selector-pseudo": "attr",
  meta: "meta", "meta.keyword": "keyword", "meta.string": "string",
  variable: "variable", "template-variable": "variable", params: "variable", subst: "variable",
  property: "property", operator: "punct", punctuation: "punct",
  tag: "punct", name: "tag", "selector-tag": "tag",
  addition: "addition", deletion: "deletion",
};

// OpenIDEA language ids and file extensions → highlight.js languages.
const LANGS = {
  typescriptreact: "typescript", tsx: "typescript", ts: "typescript", mts: "typescript", cts: "typescript",
  javascriptreact: "javascript", jsx: "javascript", js: "javascript", mjs: "javascript", cjs: "javascript",
  rs: "rust", py: "python", rb: "ruby", kt: "kotlin", kts: "kotlin", cs: "csharp", "c#": "csharp",
  h: "c", hpp: "cpp", cc: "cpp", cxx: "cpp", "c++": "cpp", m: "objectivec", "objective-c": "objectivec",
  shellscript: "bash", sh: "bash", zsh: "bash", fish: "bash", dockerfile: "bash",
  toml: "ini", properties: "ini", env: "ini", dotenv: "ini",
  html: "xml", htm: "xml", svg: "xml", vue: "xml", svelte: "xml",
  yml: "yaml", md: "markdown", gql: "graphql", text: "plaintext", txt: "plaintext",
};

// ---------------------------------------------------------------- state

const $ = (id) => document.getElementById(id);
const bridge = window.openidea || null;
const SAMPLE = {
  code: 'fn main() {\n    let snap = Snap::from(selection());\n    snap.theme("crimson-cobalt").copy();\n}\n',
  language: "rust",
  fileName: "main.rs",
};

let prefs = { ...DEFAULTS };
let snippet = null; // { code, language, fileName }
let title = "";
let isSample = true;

// ---------------------------------------------------------------- text prep

function prepare(code) {
  let lines = code.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join("\n");
}

function hljsLanguage(language, fileName) {
  const candidates = [language, LANGS[language]];
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (ext) candidates.push(LANGS[ext], ext);
  return candidates.find((c) => c && window.hljs && hljs.getLanguage(c)) || null;
}

function scopeOf(el) {
  const classes = el.className.split(/\s+/).filter(Boolean);
  const name = (classes.find((c) => c.startsWith("hljs-")) || "").slice(5);
  if (!name) return null;
  const mods = classes.filter((c) => !c.startsWith("hljs-"));
  const full = [name, ...mods].join(".");
  return SCOPES[full] || SCOPES[`${name}.${mods[0] || ""}`] || SCOPES[name] || null;
}

/** Lines of { text, kind } runs. */
function tokenize(code, language, fileName) {
  let html;
  const lang = hljsLanguage(language, fileName);
  try {
    html = lang ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : hljs.highlightAuto(code).value;
  } catch {
    html = code.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }
  const root = new DOMParser().parseFromString(`<pre>${html}</pre>`, "text/html").querySelector("pre");
  const runs = [];
  (function walk(node, kind) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) runs.push({ text: child.nodeValue, kind });
      else if (child.nodeType === Node.ELEMENT_NODE) walk(child, scopeOf(child) || kind);
    }
  })(root, null);
  const lines = [[]];
  for (const run of runs) {
    run.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: run.kind });
    });
  }
  return { lines, lang };
}

// ---------------------------------------------------------------- drawing

const FONT_SIZE = 15;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.65);
const MAX_LINES = 300;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Draws the snap at `scale` on `canvas`; returns its CSS size. */
function draw(canvas, scale) {
  const theme = THEMES[prefs.theme] || THEMES[DEFAULTS.theme];
  const bg = BACKGROUNDS[prefs.bg] || BACKGROUNDS[DEFAULTS.bg];
  const pad = bg.stops || bg.solid ? Number(prefs.pad) : Math.min(Number(prefs.pad), 24);
  const source = snippet || SAMPLE;
  const { lines: allLines } = tokenize(prepare(source.code), source.language, source.fileName);
  const lines = allLines.slice(0, MAX_LINES);

  const ctx = canvas.getContext("2d");
  const font = (style = "normal", weight = 400) => `${style} ${weight} ${FONT_SIZE}px "Snap Mono", ui-monospace, Menlo, monospace`;
  ctx.font = font();
  const widthOf = (line) => line.reduce((w, r) => w + ctx.measureText(r.text).width, 0);
  const codeWidth = Math.max(360, ...lines.map(widthOf));
  const charW = ctx.measureText("0").width;
  const gutter = prefs.numbers ? Math.ceil(String(lines.length).length * charW + 2.5 * charW) : 0;
  const hasBar = prefs.chrome || title.trim();
  const barH = hasBar ? 44 : 0;
  const padX = 26;
  const padTop = hasBar ? 8 : 22;
  const padBottom = 24;
  const winW = Math.ceil(gutter + codeWidth + padX * 2);
  const winH = Math.ceil(barH + padTop + lines.length * LINE_HEIGHT + padBottom);
  const W = winW + pad * 2;
  const H = winH + pad * 2;

  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Background
  if (bg.stops) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.solid) {
    ctx.fillStyle = bg.solid;
    ctx.fillRect(0, 0, W, H);
  }

  // Window with a soft shadow
  const x0 = pad;
  const y0 = pad;
  ctx.save();
  if (pad > 0) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 20;
  }
  ctx.fillStyle = theme.bg;
  roundRect(ctx, x0, y0, winW, winH, 12);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1;
  roundRect(ctx, x0 + 0.5, y0 + 0.5, winW - 1, winH - 1, 12);
  ctx.stroke();

  // Title bar
  ctx.textBaseline = "middle";
  if (prefs.chrome) {
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x0 + 22 + i * 20, y0 + barH / 2 + 2, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (title.trim()) {
    ctx.font = `400 13px "Snap Mono", ui-monospace, monospace`;
    ctx.fillStyle = theme.title;
    ctx.textAlign = "center";
    ctx.fillText(title.trim(), x0 + winW / 2, y0 + barH / 2 + 2, winW - 160);
    ctx.textAlign = "left";
  }

  // Code
  const codeX = x0 + padX + gutter;
  const codeY = y0 + barH + padTop;
  lines.forEach((line, i) => {
    const y = codeY + i * LINE_HEIGHT + LINE_HEIGHT / 2;
    if (prefs.numbers) {
      ctx.font = font();
      ctx.fillStyle = theme.gutter;
      ctx.textAlign = "right";
      ctx.fillText(String(i + 1), codeX - 1.5 * charW, y);
      ctx.textAlign = "left";
    }
    let x = codeX;
    for (const run of line) {
      ctx.font = run.kind === "comment" ? font("italic") : font();
      ctx.fillStyle = (run.kind && theme.tok[run.kind]) || theme.fg;
      ctx.fillText(run.text, x, y);
      x += ctx.measureText(run.text).width;
    }
  });

  return { W, H, truncated: allLines.length > MAX_LINES, total: allLines.length };
}

// ---------------------------------------------------------------- UI

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

function idleStatus(info) {
  if (isSample) {
    setStatus("Sample. Select code in the editor, then run Code Snap: Snap Selection (right-click menu).");
  } else if (info.truncated) {
    setStatus(`Showing the first ${MAX_LINES} of ${info.total} lines.`);
  } else {
    setStatus(`${info.total} ${info.total === 1 ? "line" : "lines"} · ${snippet.fileName || snippet.language || "snippet"}`);
  }
}

function render() {
  const canvas = $("preview");
  const scale = Math.max(1, window.devicePixelRatio || 1);
  const info = draw(canvas, scale);
  canvas.style.width = `${info.W}px`;
  idleStatus(info);
}

let saveTimer = null;
function savePrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (bridge) bridge.postMessage(JSON.stringify({ type: "prefs", prefs }));
  }, 400);
}

function syncControls() {
  $("theme").value = prefs.theme;
  $("bg").value = prefs.bg;
  $("pad").value = String(prefs.pad);
  $("chrome").checked = !!prefs.chrome;
  $("numbers").checked = !!prefs.numbers;
  $("title").value = title;
}

function loadSnippet(next) {
  if (!next || typeof next.code !== "string") return;
  snippet = next;
  isSample = false;
  title = next.fileName || "";
  syncControls();
  render();
}

function applyPrefs(next) {
  if (!next || typeof next !== "object") return;
  prefs = { ...DEFAULTS, ...next };
  if (!THEMES[prefs.theme]) prefs.theme = DEFAULTS.theme;
  if (!BACKGROUNDS[prefs.bg]) prefs.bg = DEFAULTS.bg;
  syncControls();
}

function exportBlob() {
  const canvas = document.createElement("canvas");
  draw(canvas, 2);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be created"))), "image/png"),
  );
}

function fileBase() {
  const base = (title.trim() || (snippet && snippet.fileName) || "snippet").replace(/\.[^.]+$/, "");
  return `${base.replace(/[^\w.-]+/g, "-")}-snap.png`;
}

async function copyImage() {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("Clipboard images aren't available here");
    // Pass the promise straight to ClipboardItem so the click still counts as the user's gesture.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": exportBlob() })]);
    setStatus("Copied to the clipboard. Paste it anywhere.", "ok");
  } catch (e) {
    setStatus(`Couldn't copy the image (${e.message || e}). Use Save PNG… instead.`, "error");
  }
}

async function saveImage() {
  try {
    const blob = await exportBlob();
    if (bridge && bridge.saveFile) {
      const path = await bridge.saveFile({ name: fileBase(), data: blob, filters: [{ name: "PNG image", extensions: ["png"] }] });
      if (path) setStatus(`Saved to ${path}`, "ok");
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileBase();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (e) {
    setStatus(`Couldn't save the image (${e.message || e}).`, "error");
  }
}

function fillSelect(id, entries) {
  $(id).innerHTML = Object.entries(entries).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
}

function wire() {
  fillSelect("theme", THEMES);
  fillSelect("bg", BACKGROUNDS);
  syncControls();
  const onPref = (key, read) => (e) => {
    prefs[key] = read(e.target);
    savePrefs();
    render();
  };
  $("theme").addEventListener("change", onPref("theme", (t) => t.value));
  $("bg").addEventListener("change", onPref("bg", (t) => t.value));
  $("pad").addEventListener("change", onPref("pad", (t) => Number(t.value)));
  $("chrome").addEventListener("change", onPref("chrome", (t) => t.checked));
  $("numbers").addEventListener("change", onPref("numbers", (t) => t.checked));
  $("title").addEventListener("input", (e) => {
    title = e.target.value;
    render();
  });
  $("copy").addEventListener("click", copyImage);
  $("save").addEventListener("click", saveImage);

  if (bridge) {
    bridge.onMessage((text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.type === "init") {
        applyPrefs(msg.prefs);
        if (msg.snippet) loadSnippet(msg.snippet);
        else render();
      } else if (msg.type === "snippet") {
        loadSnippet(msg.snippet);
      }
    });
    bridge.postMessage(JSON.stringify({ type: "ready" }));
  }
}

async function start() {
  wire();
  title = SAMPLE.fileName;
  syncControls();
  try {
    await Promise.all([
      document.fonts.load(`400 ${FONT_SIZE}px "Snap Mono"`),
      document.fonts.load(`italic 400 ${FONT_SIZE}px "Snap Mono"`),
    ]);
  } catch {
    /* fall back to the system monospace font */
  }
  // A local preview without the IDE can pass ?theme=…&bg=… to try settings.
  const q = new URLSearchParams(location.search);
  if (!bridge && q.size) applyPrefs({ ...prefs, ...Object.fromEntries(q), numbers: q.get("numbers") === "1" });
  render();
  if (bridge && bridge.onThemeChange) bridge.onThemeChange(() => render());
}

start();
