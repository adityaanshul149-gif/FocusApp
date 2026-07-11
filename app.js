const COUNTDOWN_START = new Date("2026-07-09T00:00:00");
const STARTING_DAYS = 136;
const STORAGE_KEY = "focus.study.os.v5";
const ACTIVE_SESSION_KEY = "focus.study.active.session.v1";

const appThemes = {
  focus: {
    name: "Focus",
    bg: "#050506",
    panel: "#111318",
    panelSoft: "#171a21",
    text: "#fffdf7",
    muted: "#b9beca",
    line: "rgba(255,255,255,.12)",
    accent: "#a7d8ff",
    button: "#ffe28a",
    buttonText: "#121212",
    timerText: "#ffffff",
    pill: "rgba(0,0,0,.34)",
    dialog: "#12141a"
  },
  monk: {
    name: "Monk Mode",
    bg: "#070806",
    panel: "#121610",
    panelSoft: "#1b2118",
    text: "#fbfff4",
    muted: "#bac8b1",
    line: "rgba(235,255,218,.13)",
    accent: "#d7ef9f",
    button: "#d7ef9f",
    buttonText: "#14180f",
    timerText: "#ffffff",
    pill: "rgba(8,16,8,.38)",
    dialog: "#10150e"
  },
  intensive: {
    name: "Intensive",
    bg: "#080607",
    panel: "#171112",
    panelSoft: "#241718",
    text: "#fff8f4",
    muted: "#d1b7b0",
    line: "rgba(255,220,210,.14)",
    accent: "#ffc2b3",
    button: "#ffb4a8",
    buttonText: "#21110e",
    timerText: "#ffffff",
    pill: "rgba(0,0,0,.36)",
    dialog: "#171112"
  },
  flow: {
    name: "Flow",
    bg: "#04090a",
    panel: "#0f1819",
    panelSoft: "#172324",
    text: "#f2fffd",
    muted: "#a9c9c7",
    line: "rgba(205,255,250,.14)",
    accent: "#b8efd4",
    button: "#b8efd4",
    buttonText: "#0e1a16",
    timerText: "#ffffff",
    pill: "rgba(0,0,0,.34)",
    dialog: "#0e1718"
  }
};

const defaults = {
  stats: { streak: 0, studyDays: 0, averageHours: 0, totalHours: 0, completedSubjects: 0, lastStudyDate: "", heat: Array(42).fill(0) },
  history: [],
  modes: [
    { id: "focused", name: "Focused", hours: 6, note: "Sustainable deep work" },
    { id: "intensive", name: "Intensive", hours: 8, note: "Serious but steady" },
    { id: "monk", name: "Monk Mode", hours: 10, note: "A long quiet day" }
  ],
  subjects: [
    { id: "varc", name: "VARC", hours: 2, color: "#a7d8ff", emoji: "\uD83D\uDCD6" },
    { id: "dilr", name: "DILR", hours: 3, color: "#b8efd4", emoji: "\uD83E\uDDE9" },
    { id: "quant", name: "QUANT", hours: 3, color: "#d6c4ff", emoji: "\u2211" }
  ],
  recovery: {
    micro: ["Water", "Stretch", "Balcony Walk"],
    medium: ["Meditation", "Breathing Exercise", "Balcony Walk", "Mindful Scribbling"],
    enabled: ["Water", "Stretch", "Balcony Walk", "Meditation", "Breathing Exercise", "Mindful Scribbling"]
  },
  breaks: {
    short: { minutes: 5, everyMinutes: 50, activities: ["Drink water", "Stand up", "Balcony walk"], emojis: { "Drink water": "\uD83D\uDCA7", "Stand up": "\uD83E\uDD38", "Balcony walk": "\uD83C\uDF3F" } },
    long: { minutes: 15, activities: ["Meditation", "Breathing exercise", "Balcony walk", "Mindful scribbling"], emojis: { "Meditation": "\uD83E\uDDD8", "Breathing exercise": "\u25CC", "Balcony walk": "\uD83C\uDF3F", "Mindful scribbling": "\u270E" } }
  },
  theme: "focus",
  sound: "steady"
};

let state = normalizeState(loadState());
let view = "dashboard";
let flow = null;
let live = loadActiveSession();
let ticker = null;
let timelineTimer = null;
let modal = null;
let audioContext = null;

const app = document.querySelector("#app");

function normalizeState(saved) {
  const subjectDefaults = new Map(defaults.subjects.map((subject) => [subject.id, subject]));
  saved.subjects = (saved.subjects || defaults.subjects).map((subject) => {
    const preset = subjectDefaults.get(subject.id) || {};
    return { ...subject, color: preset.color || subject.color, emoji: cleanEmoji(subject.emoji, preset.emoji) };
  });
  saved.modes = saved.modes || defaults.modes;
  saved.recovery = { ...defaults.recovery, ...(saved.recovery || {}) };
  saved.breaks = normalizeBreaks(saved.breaks);
  saved.stats = { ...defaults.stats, ...(saved.stats || {}) };
  saved.history = Array.isArray(saved.history) ? saved.history : [];
  saved.theme = appThemes[saved.theme] ? saved.theme : "focus";
  saved.sound = saved.sound || defaults.sound;
  return saved;
}

function normalizeBreaks(breaks) {
  const source = breaks || defaults.breaks;
  const shortActivities = source.short?.activities?.length ? source.short.activities : defaults.breaks.short.activities;
  const longActivities = source.long?.activities?.length ? source.long.activities : defaults.breaks.long.activities;
  return {
    short: {
      minutes: clamp(Number(source.short?.minutes || defaults.breaks.short.minutes), 1, 20),
      everyMinutes: normalizeStudyChunkMinutes(source.short?.everyMinutes),
      activities: shortActivities,
      emojis: cleanEmojiMap({ ...defaults.breaks.short.emojis, ...(source.short?.emojis || {}) }, defaults.breaks.short.emojis)
    },
    long: {
      minutes: clamp(Number(source.long?.minutes || defaults.breaks.long.minutes), 5, 45),
      activities: longActivities,
      emojis: cleanEmojiMap({ ...defaults.breaks.long.emojis, ...(source.long?.emojis || {}) }, defaults.breaks.long.emojis)
    }
  };
}
function cleanEmoji(value, fallback = "•") {
  return !value || value === "?" || value === "??" || value === "�" ? fallback : value;
}
function cleanEmojiMap(map, fallbackMap) {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, cleanEmoji(value, fallbackMap[key] || recoveryEmoji(key))]));
}
function loadState() {
  try { return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
  catch { return structuredClone(defaults); }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function saveActiveSession() {
  if (!live) return localStorage.removeItem(ACTIVE_SESSION_KEY);
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ ...live, savedAt: Date.now(), endStep: null, endReason: "", skipStep: null }));
}
function loadActiveSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY));
    return saved?.timeline?.length ? reconcileActiveSession(saved) : null;
  } catch { return null; }
}
function reconcileActiveSession(saved) {
  const elapsedAway = saved.paused ? 0 : Math.max(0, (Date.now() - Number(saved.savedAt || Date.now())) / 1000);
  saved.lastTickAt = performance.now();
  saved.endStep = null;
  saved.skipStep = null;
  return advanceSavedSession(saved, elapsedAway);
}
function advanceSavedSession(session, seconds) {
  let remainingSeconds = seconds;
  while (remainingSeconds > 0 && session.index < session.timeline.length) {
    const item = session.timeline[session.index];
    const step = Math.min(session.remaining, remainingSeconds);
    session.remaining -= step;
    remainingSeconds -= step;
    if (item.type === "study") session.focusedMs = (session.focusedMs || 0) + step * 1000;
    session.elapsedMs = (session.elapsedMs || 0) + step * 1000;
    if (session.remaining <= 0) {
      if (item.type === "study") session.completedPomodoros = (session.completedPomodoros || 0) + 1;
      session.index += 1;
      if (session.index >= session.timeline.length) break;
      session.remaining = session.timeline[session.index].minutes * 60;
    }
  }
  return session.index >= session.timeline.length ? null : session;
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function daysBetween(from, to) { return Math.round((new Date(to) - new Date(from)) / 86400000); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function normalizeStudyChunkMinutes(value) {
  const minutes = Number(value || defaults.breaks.short.everyMinutes);
  return clamp(minutes === 45 ? 50 : minutes, 25, 60);
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function daysRemaining() {
  const elapsedDays = Math.floor((new Date() - COUNTDOWN_START) / 86400000);
  return Math.max(0, STARTING_DAYS - elapsedDays);
}
function fmtHours(hours) { return `${Number(hours).toFixed(hours % 1 ? 1 : 0)}h`; }

function fmtPlanDuration(hours) {

  const minutes = Math.round(Number(hours) * 60);

  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;

  return `${minutes}m`;

}
function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function applyTheme() {
  const theme = appThemes[state.theme] || appThemes.focus;
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--panel-soft", theme.panelSoft);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--sun", theme.button);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--button-text", theme.buttonText);
  root.style.setProperty("--timer-text", theme.timerText);
  root.style.setProperty("--pill", theme.pill);
  root.style.setProperty("--dialog", theme.dialog);
}

function render() {
  clearInterval(ticker);
  applyTheme();
  app.className = live ? "app-shell live-shell" : "app-shell";
  if (live) return renderLive();
  app.innerHTML = `
    <main class="screen">
      <header class="topbar">
        <div class="brand-mark"><div class="logo"></div><div><p class="eyebrow">${view === "dashboard" ? `${daysRemaining()} days to CAT` : "Study OS"}</p><h1>${view === "dashboard" ? "History" : "Focus"}</h1></div></div>
        <button class="icon-btn" data-action="open-start" aria-label="Start">+</button>
      </header>
      ${view === "dashboard" ? dashboard() : customization()}
      <nav class="bottom-nav">
        <button class="nav-item ${view === "dashboard" ? "active" : ""}" data-view="dashboard">History</button>
        <button class="nav-item ${view === "custom" ? "active" : ""}" data-view="custom">Tune</button>
      </nav>
    </main>
    ${flow ? startFlow() : ""}
    ${modal ? modalView() : ""}
  `;
  bindEvents();
}

function dashboard() {
  const rows = [...state.history].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  return `
    <section class="start-hero">
      <p class="eyebrow">${daysRemaining()} days to CAT</p>
      <h2>Ready for one quiet block?</h2>
      <button class="primary-btn main-start" data-action="open-start">Start</button>
    </section>
    <section class="history-intro">
      <div><p class="eyebrow">Local study history</p><h2>Every session you finish or end appears here.</h2></div>
    </section>
    <section class="history-table-wrap">
      ${rows.length ? historyTable(rows) : emptyHistory()}
    </section>
  `;
}

function emptyHistory() {
  return `<div class="empty-history"><p class="eyebrow">No records yet</p><h2>Start today from zero.</h2><p class="copy">Completed or ended sessions will be saved locally on this device.</p></div>`;
}

function historyTable(rows) {
  return `
    <div class="history-actions"><button class="history-delete" data-action="clear-history">Clear</button></div>
    <table class="history-table">
      <thead><tr><th>Date</th><th>Total</th><th>Focus</th><th>Pomodoros</th><th>Status</th><th>Reason</th><th></th></tr></thead>
      <tbody>${rows.map((record) => `
        <tr>
          <td>${escapeHtml(record.date)}</td>
          <td>${fmtDuration(record.totalSeconds || 0)}</td>
          <td>${fmtDuration(record.focusedSeconds || 0)}</td>
          <td>${record.completedPomodoros || 0}</td>
          <td><span class="status-pill ${record.status === "Completed" ? "done" : "early"}">${record.status}</span></td>
          <td class="reason-cell">${escapeHtml(record.reason || "-")}</td>
          <td><button class="tiny-btn table-edit" data-edit-record="${record.id}">Edit</button></td>
        </tr>`).join("")}</tbody>
    </table>`;
}

function metric(value, label) { return `<article class="metric-card"><div class="metric-value">${value}</div><div class="metric-label">${label}</div></article>`; }

function customization() {
  return `
    <section class="panel"><div class="panel-head"><h2>Study modes</h2><button class="tiny-btn" data-action="add-mode">Add</button></div>${state.modes.map((mode) => `
      <div class="setting-row mode-setting"><input class="field mode-name-field" value="${escapeHtml(mode.name)}" data-mode-name="${mode.id}" /><input class="field mode-note-field" value="${escapeHtml(mode.note)}" data-mode-note="${mode.id}" /><input class="field" type="number" min="1" max="14" value="${mode.hours}" data-mode-hours="${mode.id}" />${isDefaultMode(mode.id) ? "" : `<button class="tiny-btn danger-lite" data-remove-mode="${mode.id}">Delete</button>`}</div>
    `).join("")}</section>
    <section class="panel"><div class="panel-head"><div><h2>Breaks</h2><p class="eyebrow">Breaks are outside study hours. Stopwatch counts them; focus time does not.</p></div></div>
      ${breakEditor("short", "Short breaks", `Every ${state.breaks.short.everyMinutes}m of study`, state.breaks.short)}
      ${breakEditor("long", "Long breaks", "After each subject", state.breaks.long)}
    </section>
    <section class="panel"><div class="panel-head"><div><h2>Select chime</h2><p class="eyebrow">Long high-pitch alerts for iPhone PWA</p></div><button class="tiny-btn" data-action="test-chime">Test</button></div><div class="sound-grid">${soundOptions().map((sound) => `<button class="chip ${state.sound === sound.id ? "active" : ""}" data-sound="${sound.id}">${sound.name}</button>`).join("")}</div></section>
    <section class="panel"><div class="panel-head"><h2>Themes</h2></div><div class="theme-grid">${Object.entries(appThemes).map(([id, theme]) => `<button class="theme-card ${state.theme === id ? "active" : ""}" data-theme="${id}" style="--theme-accent:${theme.accent}; --theme-bg:${theme.bg}; --theme-panel:${theme.panel}"><span></span><strong>${theme.name}</strong><small>${themeMood(id)}</small></button>`).join("")}</div></section>
    <p class="app-version">Focus app version 8.0</p>
  `;
}

function breakEditor(type, title, note, config) {
  return `<div class="break-editor"><div class="break-head"><div><strong>${title}</strong><p class="eyebrow">${note}</p></div><label class="mini-field"><span>Minutes</span><input class="field" type="number" min="1" max="45" value="${config.minutes}" data-break-field="${type}:minutes"></label>${type === "short" ? `<label class="mini-field"><span>Every</span><input class="field" type="number" min="25" max="60" value="${config.everyMinutes}" data-break-field="${type}:everyMinutes"></label>` : ""}</div><div class="break-list">${config.activities.map((activity, index) => `<div class="break-row emoji-break-row"><input class="field break-emoji" value="${escapeHtml(config.emojis?.[activity] || recoveryEmoji(activity))}" maxlength="3" data-break-emoji="${type}:${index}"><input class="field break-name" value="${escapeHtml(activity)}" data-break-activity="${type}:${index}"><button class="tiny-btn" data-remove-break="${type}:${index}">Remove</button></div>`).join("")}</div><button class="soft-btn add-break" data-add-break="${type}">Add ${type === "short" ? "short" : "long"} break</button></div>`;
}
function soundOptions() {
  return [
    { id: "steady", name: "Steady Beep", freq: 1850, gain: .34 },
    { id: "bright", name: "Bright Beep", freq: 2300, gain: .28 },
    { id: "urgent", name: "Urgent Beep", freq: 2650, gain: .36 },
    { id: "piercing", name: "Max Beep", freq: 3100, gain: .32 }
  ];
}
function themeMood(id) {
  return { focus: "Clean and bright", monk: "Quiet and grounded", intensive: "Warm and decisive", flow: "Soft and fluid" }[id];
}
function totalSubjectHours() { return state.subjects.reduce((sum, s) => sum + Number(s.hours), 0); }
function allActivities() { return [...new Set([...state.recovery.micro, ...state.recovery.medium])]; }
function themeColor(theme) { return (appThemes[theme] || appThemes.focus).accent; }
function isDefaultMode(id) { return ["focused", "intensive", "monk"].includes(id); }

function openStart() {
  flow = { step: "mode", selectedMode: state.modes[1].id, editing: false, plan: scalePlan(state.subjects, state.modes[1].hours) };
  render();
}

function scalePlan(subjects, targetHours) {
  const total = subjects.reduce((sum, s) => sum + Number(s.hours), 0) || 1;
  let plan = subjects.map((s) => ({ ...s, hours: Math.round((s.hours / total) * targetHours * 2) / 2 }));
  let delta = Math.round((targetHours - plan.reduce((sum, s) => sum + s.hours, 0)) * 2) / 2;
  plan[plan.length - 1].hours = Math.max(0.5, plan[plan.length - 1].hours + delta);
  return plan;
}

function startFlow() {
  const mode = state.modes.find((m) => m.id === flow.selectedMode);
  if (flow.step === "mode") return `
    <div class="overlay"><section class="sheet"><div class="panel-head"><div><p class="eyebrow">Begin gently</p><h2>Choose today</h2></div><button class="icon-btn" data-action="close-flow">x</button></div>
    <div class="mode-grid">${state.modes.map((m) => `<button class="mode-card ${m.id === flow.selectedMode ? "active" : ""}" data-select-mode="${m.id}"><strong>${m.name}</strong><span>${fmtHours(m.hours)} · ${m.note}</span></button>`).join("")}</div>
    <div class="sheet-actions"><button class="primary-btn" data-action="load-plan">Load today's plan</button></div></section></div>`;
  const total = flow.plan.reduce((sum, s) => sum + Number(s.hours), 0);
  const valid = Math.abs(total - mode.hours) < 0.01;
  if (flow.step === "breaks") return breakReviewFlow(mode);
  return `
    <div class="overlay"><section class="sheet"><div class="panel-head"><div><p class="eyebrow">${mode.name} · ${fmtHours(mode.hours)}</p><h2>Today's plan</h2></div><span class="total-pill ${valid ? "good" : "bad"}">${fmtHours(total)}</span></div>
    <div class="plan-list">${flow.plan.map((s, i) => `<article class="subject-card" data-index="${i}"><div class="drag subject-icon">${s.emoji || "•"}</div><div><strong>${s.name}</strong><p class="eyebrow">${fmtPlanDuration(s.hours)}</p></div>${flow.editing ? `<div class="subject-controls"><div class="subject-stepper"><button data-nudge="${i}:-30">-</button><button data-nudge="${i}:30">+</button></div><div class="subject-reorder"><button data-move-subject="${i}:-1" ${i === 0 ? "disabled" : ""}>↑</button><button data-move-subject="${i}:1" ${i === flow.plan.length - 1 ? "disabled" : ""}>↓</button></div></div>` : ""}</article>`).join("")}</div>
    <div class="sheet-actions"><button class="primary-btn" data-action="confirm-plan" ${valid ? "" : "disabled"}>Confirm and lock</button><button class="soft-btn" data-action="toggle-edit">${flow.editing ? "Done editing" : "Edit"}</button><button class="tiny-btn" data-action="close-flow">Cancel</button></div></section></div>`;
}

function breakReviewFlow(mode) {
  return `
    <div class="overlay"><section class="sheet"><div class="panel-head"><div><p class="eyebrow">${mode.name} · break structure</p><h2>Review breaks</h2></div><button class="icon-btn" data-action="close-flow">x</button></div>
    <div class="break-plan-list">${breakPlanRows()}</div>
    <div class="sheet-actions"><button class="primary-btn" data-action="start-reviewed-session">Start session</button><button class="soft-btn" data-action="back-to-plan">Back to plan</button></div></section></div>`;
}

function breakPlanRows() {
  return flow.timeline.map((item, index) => item.type === "study" ? `
      <article class="break-plan-row is-study"><span>${item.emoji || "•"}</span><div><strong>${item.subject}</strong><p class="eyebrow">${item.minutes}m study</p></div></article>` : `
      <article class="break-plan-row"><span>${item.emoji || "•"}</span><div><strong>${item.subject}</strong><p class="eyebrow">${item.minutes}m break</p></div><select class="field break-select" data-break-kind="${index}"><option value="micro" ${item.type === "micro" ? "selected" : ""}>Short</option><option value="medium" ${item.type === "medium" ? "selected" : ""}>Medium</option><option value="none">Remove</option>${canMergeAround(index) ? `<option value="merge">Remove + merge</option>` : ""}</select><select class="field break-activity-select" data-break-choice="${index}">${breakChoices(item.type).map((choice) => `<option ${choice === item.subject ? "selected" : ""}>${escapeHtml(choice)}</option>`).join("")}</select></article>`).join("");
}

function breakChoices(type) {
  return (type === "medium" ? state.breaks.long.activities : state.breaks.short.activities).filter(Boolean);
}
function refreshBreakReviewRows() {
  const list = document.querySelector(".break-plan-list");
  const sheet = document.querySelector(".sheet");
  const pageY = window.scrollY;
  const scrollTop = sheet?.scrollTop || 0;
  if (!list) return render();
  list.innerHTML = breakPlanRows();
  bindBreakReviewEvents();
  requestAnimationFrame(() => {
    if (sheet) sheet.scrollTop = scrollTop;
    window.scrollTo(0, pageY);
  });
}
function breakEmoji(type, activity) {
  return (type === "medium" ? state.breaks.long.emojis : state.breaks.short.emojis)?.[activity] || recoveryEmoji(activity);
}
function canMergeAround(index) {
  const before = flow.timeline[index - 1];
  const after = flow.timeline[index + 1];
  return before?.type === "study" && after?.type === "study" && before.subject === after.subject && before.minutes + after.minutes <= 60;
}
function mergeAroundBreak(index) {
  if (!canMergeAround(index)) return flow.timeline.splice(index, 1);
  flow.timeline[index - 1].minutes += flow.timeline[index + 1].minutes;
  flow.timeline.splice(index, 2);
}

function buildTimeline(plan) {
  const timeline = [];
  let lastRecovery = "";
  const shortBreak = state.breaks.short;
  const longBreak = state.breaks.long;
  const maxStudyChunk = normalizeStudyChunkMinutes(shortBreak.everyMinutes);
  plan.forEach((subject, subjectIndex) => {
    let remainingStudyMinutes = Math.round(subject.hours * 60);
    while (remainingStudyMinutes > 0) {
      const minutes = Math.min(maxStudyChunk, remainingStudyMinutes);
      timeline.push({ type: "study", subject: subject.name, minutes, color: subject.color, emoji: subject.emoji || "•" });
      remainingStudyMinutes -= minutes;
      if (remainingStudyMinutes > 0 && shortBreak.activities.length) {
        const activity = pickActivity(shortBreak.activities, lastRecovery);
        lastRecovery = activity;
        timeline.push({ type: "micro", subject: activity, minutes: shortBreak.minutes, color: subject.color, emoji: breakEmoji("micro", activity) });
      }
    }
    if (subjectIndex < plan.length - 1 && longBreak.activities.length) {
      const activity = pickActivity(longBreak.activities, lastRecovery);
      lastRecovery = activity;
      timeline.push({ type: "medium", subject: activity, minutes: longBreak.minutes, color: subject.color, emoji: breakEmoji("medium", activity) });
    }
  });
  return timeline;
}
function pickActivity(list, previous) {
  const pool = list.filter(Boolean);
  return pool.find((item) => item !== previous) || pool[0];
}

async function startLive() {
  flow.plan = flow.plan.map((s) => ({ ...s, id: s.id || uid() }));
  const timeline = flow.timeline || buildTimeline(flow.plan);
  flow = null;
  await runStartupSequence(timeline);
}

async function runStartupSequence(timeline) {
  await playMainNotification();
  app.className = "app-shell live-shell";
  app.innerHTML = `<main class="countdown-start launch-intro"><p>Locking in</p><h1>Starting study session now</h1></main>`;
  setTimeout(() => {
    app.innerHTML = `<main class="countdown-start"><p>Starting in...</p><div class="countdown-number" data-start-count>3</div></main>`;
  }, 2000);
  [3, 2, 1].forEach((num, i) => {
    setTimeout(() => {
      const el = document.querySelector("[data-start-count]");
      if (el) {
        el.textContent = num;
        el.classList.remove("pulse");
        void el.offsetWidth;
        el.classList.add("pulse");
      }
      playCountdownBeep();
    }, 2000 + i * 1000);
  });
  setTimeout(() => beginLive(timeline), 5100);
}

function beginLive(timeline) {
  live = {
    id: uid(), timeline, index: 0, remaining: timeline[0].minutes * 60, paused: false,
    startedAt: Date.now(), elapsedMs: 0, completedPomodoros: 0,
    focusedMs: 0, lastTickAt: performance.now(), endStep: null, endReason: "", skipStep: null
  };
  saveActiveSession();
  render();
}

function renderLive() {
  clearInterval(ticker);
  const item = live.timeline[live.index];
  const duration = item.minutes * 60;
  const itemLeft = clamp((live.remaining / duration) * 100, 0, 100);
  const isRecovery = item.type !== "study";
  const upcoming = live.timeline.slice(live.index + 1);
  const totalCommitmentSeconds = Math.floor((live.elapsedMs || 0) / 1000);
  app.innerHTML = `
    <main class="study-mode" style="--card-color:${item.color}; --card-left:${itemLeft}%; --black-width:${100 - itemLeft}%">
      <section class="standby-card ${isRecovery ? "recovery-card" : ""}">
        <div class="empty-layer"></div>
        <div class="card-grain"></div>
        <div class="commitment-clock"><span>Total</span><strong data-commitment-time>${fmtDuration(totalCommitmentSeconds)}</strong></div>
        <button class="end-session-btn" data-action="request-end-session">End</button>
        <div class="standby-content">
          <div class="session-kicker"><p class="eyebrow">${isRecovery ? recoveryLabel(item.type) : "Now studying"}</p><div class="session-emoji">${item.emoji || "•"}</div></div>
          <div class="subject">${item.subject}</div>
          <div class="countdown" data-countdown>${fmtClock(live.remaining)}</div>
          <div class="live-actions">
            <button class="pause-btn ${live.paused ? "is-paused" : ""}" data-action="pause-live">${live.paused ? "Resume" : "Pause"}</button>
            ${isRecovery ? `<button class="skip-break-btn" data-action="request-skip-break">Skip</button>` : ""}
          </div>
        </div>
      </section>
      <aside class="floating-stack">${upcoming.map((x) => `<div class="stack-card next-${x.type}" style="--mini-color:${x.color}"><span>${x.emoji || "•"}</span><strong>${x.subject}</strong><small><b>${x.minutes}m</b> ${x.type === "study" ? "study" : "break"}</small></div>`).join("")}</aside>
      ${live.endStep ? endSessionDialog() : ""}
      ${live.skipStep ? skipBreakDialog() : ""}
    </main>
  `;
  bindEvents();
  setupUpcomingRail();
  ticker = setInterval(tick, 1000);
}

function skipBreakDialog() {
  return `
    <div class="overlay end-overlay"><section class="sheet confirm-sheet"><p class="eyebrow">Tiny check-in</p><h2>Skip this break? \uD83C\uDF3F</h2><p class="copy">Your brain might need these few minutes. If you still feel clear and ready, you can return to study now.</p><div class="sheet-actions"><button class="soft-btn" data-action="keep-break">Take the break</button><button class="tiny-btn skip-confirm" data-action="confirm-skip-break">Yes, skip break</button></div></section></div>`;
}

function endSessionDialog() {
  if (live.endStep === "confirm") return `
    <div class="overlay end-overlay"><section class="sheet confirm-sheet"><p class="eyebrow">A pause to choose</p><h2>Do you really want to end today's study session?</h2><p class="copy">Remember why you started. If your energy is gone, ending honestly still counts.</p><div class="sheet-actions"><button class="soft-btn" data-action="resume-session">Continue studying</button><button class="tiny-btn danger-lite" data-action="show-end-reason">End session</button></div></section></div>`;
  return `
    <div class="overlay end-overlay"><section class="sheet confirm-sheet"><p class="eyebrow">Before you close</p><h2>What made you end early?</h2><textarea class="reason-input" data-end-reason placeholder="Write one honest sentence...">${escapeHtml(live.endReason || "")}</textarea><div class="sheet-actions"><button class="primary-btn" data-action="confirm-end-session" ${live.endReason.trim() ? "" : "disabled"}>Save and end</button><button class="tiny-btn" data-action="resume-session">Return to session</button></div></section></div>`;
}

function recoveryLabel(type) { return type === "micro" ? "Micro recovery" : "Medium recovery"; }
function recoveryEmoji(activity) {
  const key = activity.toLowerCase();
  if (key.includes("water")) return "\uD83D\uDCA7";
  if (key.includes("stand") || key.includes("stretch")) return "\uD83E\uDD38";
  if (key.includes("balcony") || key.includes("walk")) return "\uD83C\uDF3F";
  if (key.includes("breath")) return "\u25CC";
  if (key.includes("meditat")) return "\uD83E\uDDD8";
  if (key.includes("scribbl") || key.includes("write")) return "\u270E";
  if (key.includes("coffee")) return "\u2615";
  return "?";
}function tick() {
  if (!live) return;
  const now = performance.now();
  const deltaMs = Math.max(0, now - live.lastTickAt);
  const delta = deltaMs / 1000;
  live.lastTickAt = now;
  live.elapsedMs = (live.elapsedMs || 0) + deltaMs;
  updateLiveDisplay();
  if (!live.paused && delta) {
    const item = live.timeline[live.index];
    if (item.type === "study") live.focusedMs = (live.focusedMs || 0) + deltaMs;
    live.remaining -= delta;
  }
  saveActiveSession();
  if (!live.paused && live.remaining <= 0) {
    completeCurrentBlock();
    if (!live) return;
    renderLive();
    return;
  }
  updateLiveDisplay();
}

function updateLiveDisplay() {
  if (!live) return;
  const totalCommitmentSeconds = Math.floor((live.elapsedMs || 0) / 1000);
  const commitment = document.querySelector("[data-commitment-time]");
  if (commitment) commitment.textContent = fmtDuration(totalCommitmentSeconds);
  const countdown = document.querySelector("[data-countdown]");
  if (countdown) countdown.textContent = fmtClock(live.remaining);
  const item = live.timeline[live.index];
  const duration = item.minutes * 60;
  const itemLeft = clamp((live.remaining / duration) * 100, 0, 100);
  const mode = document.querySelector(".study-mode");
  if (mode) {
    mode.style.setProperty("--card-left", `${itemLeft}%`);
    mode.style.setProperty("--black-width", `${100 - itemLeft}%`);
  }
}

function completeCurrentBlock() {
  const item = live.timeline[live.index];
  if (item.type === "study") live.completedPomodoros += 1;
  playMainNotification();
  live.index += 1;
  if (live.index >= live.timeline.length) return finishSession("Completed");
  live.remaining = live.timeline[live.index].minutes * 60;
  saveActiveSession();
}

function finishSession(status = "Completed", reason = "") {
  clearInterval(ticker);
  const totalSeconds = Math.max(0, Math.floor((live.elapsedMs || 0) / 1000));
  const focusedSeconds = Math.max(0, Math.floor((live.focusedMs || 0) / 1000));
  const completedPomodoros = live.completedPomodoros;
  const completedSubjects = countCompletedSubjects();
  const record = {
    id: live.id,
    date: todayKey(),
    createdAt: new Date().toISOString(),
    totalSeconds,
    focusedSeconds,
    completedPomodoros,
    status,
    reason: reason.trim()
  };
  state.history = [record, ...state.history];
  if (status === "Completed") applySessionStats(focusedSeconds / 3600, completedSubjects);
  saveState();
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  live = null;
  app.innerHTML = `<main class="screen"><section class="summary-card"><p class="eyebrow">${status === "Completed" ? "Session complete" : "Session ended"}</p><h1>${status === "Completed" ? "Quiet work done." : "Logged honestly."}</h1><div class="metric-grid">${metric(fmtDuration(totalSeconds), "Total time")}${metric(fmtDuration(focusedSeconds), "Focused time")}${metric(completedPomodoros, "Pomodoros")}${metric(status, "Status")}</div><button class="primary-btn" data-action="home">Done</button></section></main>`;
  bindEvents();
}

function countCompletedSubjects() {
  const studied = live.timeline.slice(0, live.index).filter((x) => x.type === "study").map((x) => x.subject);
  return new Set(studied).size;
}

function applySessionStats(hours, subjects) {
  const today = todayKey();
  const sameDay = state.stats.lastStudyDate === today;
  const yesterday = state.stats.lastStudyDate && daysBetween(state.stats.lastStudyDate, today) === 1;
  state.stats.totalHours = Math.round((Number(state.stats.totalHours || 0) + hours) * 10) / 10;
  state.stats.completedSubjects = Number(state.stats.completedSubjects || 0) + subjects;
  if (!sameDay) {
    state.stats.studyDays = Number(state.stats.studyDays || 0) + 1;
    state.stats.streak = yesterday ? Number(state.stats.streak || 0) + 1 : 1;
    state.stats.lastStudyDate = today;
    state.stats.heat = [...(state.stats.heat || Array(42).fill(0)).slice(-41), heatLevel(hours)];
  } else {
    const heat = [...(state.stats.heat || Array(42).fill(0))];
    heat[heat.length - 1] = Math.max(heat[heat.length - 1] || 0, heatLevel(hours));
    state.stats.heat = heat;
  }
  state.stats.averageHours = state.stats.studyDays ? Math.round((state.stats.totalHours / state.stats.studyDays) * 10) / 10 : 0;
}
function heatLevel(hours) { return hours >= 8 ? 3 : hours >= 4 ? 2 : hours > 0 ? 1 : 0; }

async function playCompletionChime() { return playMainNotification(); }
async function playMainNotification() {
  try {
    await unlockAudio();
    const now = audioContext.currentTime;
    const selected = soundOptions().find((sound) => sound.id === state.sound) || soundOptions()[0];
    const master = audioContext.createGain();
    master.gain.setValueAtTime(1, now);
    master.connect(audioContext.destination);
    [selected.freq, selected.freq * 1.015].forEach((freq, index) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = index ? "sine" : "square";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(index ? selected.gain * .34 : selected.gain, now + 0.035);
      gain.gain.setValueAtTime(index ? selected.gain * .34 : selected.gain, now + 1.86);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2);
      osc.connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + 2.05);
    });
  } catch (error) {
    console.warn("Chime could not play", error);
  }
}
async function playCountdownBeep() {
  try {
    await unlockAudio();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1150, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch {}
}
async function playToggleSound() {
  try {
    await unlockAudio();
    const now = audioContext.currentTime;
    [live?.paused ? 740 : 520, live?.paused ? 520 : 740].forEach((freq, index) => {
      const start = now + index * 0.055;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  } catch {}
}
async function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") await audioContext.resume();
  } catch {}
}
function modalView() {
  if (modal.type === "edit-confirm") return `<div class="overlay"><section class="sheet"><p class="eyebrow">Edit history</p><h2>Are you sure you want to edit this study record?</h2><p class="copy">A little friction keeps your record trustworthy.</p><div class="sheet-actions"><button class="primary-btn" data-action="open-edit-record">Yes, edit</button><button class="tiny-btn" data-action="close-modal">Cancel</button></div></section></div>`;
  if (modal.type === "edit-record") {
    const record = modal.draft;
    if (!record) return "";
    return `<div class="overlay"><section class="sheet"><p class="eyebrow">Study record</p><h2>Edit carefully</h2><label class="edit-label">Date<input class="field wide-field" data-record-field="date" value="${escapeHtml(record.date)}"></label><label class="edit-label">Total minutes<input class="field wide-field" type="number" min="0" data-record-field="totalMinutes" value="${Math.round((record.totalSeconds || 0) / 60)}"></label><label class="edit-label">Focused minutes<input class="field wide-field" type="number" min="0" data-record-field="focusedMinutes" value="${Math.round((record.focusedSeconds || 0) / 60)}"></label><label class="edit-label">Pomodoros<input class="field wide-field" type="number" min="0" data-record-field="completedPomodoros" value="${record.completedPomodoros || 0}"></label><label class="edit-label">Status<select class="field wide-field" data-record-field="status"><option ${record.status === "Completed" ? "selected" : ""}>Completed</option><option ${record.status === "Ended Early" ? "selected" : ""}>Ended Early</option></select></label><label class="edit-label">Reason<textarea class="reason-input compact" data-record-field="reason">${escapeHtml(record.reason || "")}</textarea></label><div class="sheet-actions"><button class="primary-btn" data-action="save-record-edit">Save changes</button><button class="tiny-btn" data-action="close-modal">Cancel</button></div></section></div>`;
  }
  return "";
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => { view = btn.dataset.view; render(); }));
  document.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", handleAction));
  document.querySelectorAll("[data-select-mode]").forEach((btn) => btn.addEventListener("click", () => {
    const mode = state.modes.find((m) => m.id === btn.dataset.selectMode);
    flow.selectedMode = mode.id;
    flow.plan = scalePlan(state.subjects, mode.hours);
    render();
  }));
  document.querySelectorAll("[data-nudge]").forEach((btn) => btn.addEventListener("click", () => {
    const [index, delta] = btn.dataset.nudge.split(":").map(Number);
    flow.plan[index].hours = clamp(Math.round((flow.plan[index].hours + delta / 60) * 2) / 2, 0.5, 10);
    render();
  }));
  document.querySelectorAll("[data-move-subject]").forEach((btn) => btn.addEventListener("click", () => {
    const [index, delta] = btn.dataset.moveSubject.split(":").map(Number);
    const to = index + delta;
    if (to < 0 || to >= flow.plan.length) return;
    const [moved] = flow.plan.splice(index, 1);
    flow.plan.splice(to, 0, moved);
    render();
  }));
  document.querySelectorAll("[data-mode-hours]").forEach((input) => input.addEventListener("change", () => {
    const mode = state.modes.find((m) => m.id === input.dataset.modeHours);
    mode.hours = clamp(Number(input.value), 1, 14); saveState(); render();
  }));
  document.querySelectorAll("[data-mode-name]").forEach((input) => input.addEventListener("change", () => {
    const mode = state.modes.find((m) => m.id === input.dataset.modeName);
    mode.name = input.value.trim() || "Custom"; saveState(); render();
  }));
  document.querySelectorAll("[data-mode-note]").forEach((input) => input.addEventListener("change", () => {
    const mode = state.modes.find((m) => m.id === input.dataset.modeNote);
    mode.note = input.value.trim() || "Your quiet plan"; saveState(); render();
  }));
  document.querySelectorAll("[data-remove-mode]").forEach((btn) => btn.addEventListener("click", () => {
    state.modes = state.modes.filter((mode) => mode.id !== btn.dataset.removeMode);
    saveState(); render();
  }));
  document.querySelectorAll("[data-subject-hours]").forEach((input) => input.addEventListener("change", () => {
    const subject = state.subjects.find((s) => s.id === input.dataset.subjectHours);
    subject.hours = clamp(Number(input.value), 0.5, 8); saveState(); render();
  }));
  document.querySelectorAll("[data-activity]").forEach((btn) => btn.addEventListener("click", () => {
    const activity = btn.dataset.activity;
    state.recovery.enabled = state.recovery.enabled.includes(activity) ? state.recovery.enabled.filter((x) => x !== activity) : [...state.recovery.enabled, activity];
    saveState(); render();
  }));
  document.querySelectorAll("[data-break-field]").forEach((input) => input.addEventListener("change", () => {
    const [type, field] = input.dataset.breakField.split(":");
    state.breaks[type][field] = Number(input.value);
    state.breaks = normalizeBreaks(state.breaks);
    saveState();
    render();
  }));
  document.querySelectorAll("[data-break-activity]").forEach((input) => input.addEventListener("change", () => {
    const [type, index] = input.dataset.breakActivity.split(":");
    const oldName = state.breaks[type].activities[Number(index)];
    state.breaks[type].activities[Number(index)] = input.value.trim();
    state.breaks[type].emojis[state.breaks[type].activities[Number(index)]] = state.breaks[type].emojis[oldName] || recoveryEmoji(state.breaks[type].activities[Number(index)]);
    saveState();
    render();
  }));
  document.querySelectorAll("[data-break-emoji]").forEach((input) => input.addEventListener("change", () => {
    const [type, index] = input.dataset.breakEmoji.split(":");
    state.breaks[type].emojis[state.breaks[type].activities[Number(index)]] = input.value.trim() || "•";
    saveState();
    render();
  }));
  document.querySelectorAll("[data-add-break]").forEach((btn) => btn.addEventListener("click", () => {
    const type = btn.dataset.addBreak;
    state.breaks[type].activities.push("");
    state.breaks[type].emojis[""] = "";
    saveState();
    render();
  }));
  document.querySelectorAll("[data-remove-break]").forEach((btn) => btn.addEventListener("click", () => {
    const [type, index] = btn.dataset.removeBreak.split(":");
    if (state.breaks[type].activities.length <= 1) return;
    const [removed] = state.breaks[type].activities.splice(Number(index), 1);
    delete state.breaks[type].emojis[removed];
    saveState();
    render();
  }));
  document.querySelectorAll("[data-sound]").forEach((btn) => btn.addEventListener("click", () => { state.sound = btn.dataset.sound; saveState(); render(); playMainNotification(); }));
  document.querySelectorAll("[data-theme]").forEach((btn) => btn.addEventListener("click", () => { state.theme = btn.dataset.theme; applyTheme(); saveState(); render(); }));
  document.querySelectorAll("[data-edit-record]").forEach((btn) => btn.addEventListener("click", () => { modal = { type: "edit-confirm", id: btn.dataset.editRecord }; render(); }));
  document.querySelectorAll("[data-end-reason]").forEach((input) => input.addEventListener("input", () => { live.endReason = input.value; const btn = document.querySelector("[data-action=\"confirm-end-session\"]"); if (btn) btn.disabled = !live.endReason.trim(); }));
  document.querySelectorAll("[data-record-field]").forEach((input) => input.addEventListener("input", () => updateModalDraft(input)));
  bindBreakReviewEvents();
  setupDrag();
}

function bindBreakReviewEvents() {
  document.querySelectorAll("[data-break-kind]").forEach((input) => input.addEventListener("change", () => {
    const index = Number(input.dataset.breakKind);
    if (input.value === "merge") {
      mergeAroundBreak(index);
      refreshBreakReviewRows();
      return;
    }
    if (input.value === "none") {
      flow.timeline.splice(index, 1);
      refreshBreakReviewRows();
      return;
    }
    const row = input.closest(".break-plan-row");
    const choices = breakChoices(input.value);
    const subject = choices[0] || "";
    flow.timeline[index] = { ...flow.timeline[index], type: input.value, minutes: input.value === "micro" ? state.breaks.short.minutes : state.breaks.long.minutes, subject, emoji: breakEmoji(input.value, subject) };
    if (row) {
      row.querySelector("span").textContent = flow.timeline[index].emoji;
      row.querySelector("strong").textContent = subject;
      row.querySelector(".eyebrow").textContent = `${flow.timeline[index].minutes}m break`;
      const choice = row.querySelector("[data-break-choice]");
      if (choice) {
        choice.dataset.breakChoice = String(index);
        choice.innerHTML = choices.map((item) => `<option ${item === subject ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
      }
    }
  }));
  document.querySelectorAll("[data-break-choice]").forEach((input) => input.addEventListener("change", () => {
    const index = Number(input.dataset.breakChoice);
    flow.timeline[index].subject = input.value;
    flow.timeline[index].emoji = breakEmoji(flow.timeline[index].type, input.value);
    const row = input.closest(".break-plan-row");
    if (row) {
      row.querySelector("span").textContent = flow.timeline[index].emoji;
      row.querySelector("strong").textContent = input.value;
    }
  }));
}

function updateModalDraft(input) {
  const record = modal.draft;
  if (!record) return;
  const field = input.dataset.recordField;
  if (field === "totalMinutes") record.totalSeconds = Math.max(0, Number(input.value || 0)) * 60;
  else if (field === "focusedMinutes") record.focusedSeconds = Math.max(0, Number(input.value || 0)) * 60;
  else if (field === "completedPomodoros") record.completedPomodoros = Math.max(0, Number(input.value || 0));
  else record[field] = input.value;
}

function handleAction(event) {
  unlockAudio();
  const action = event.currentTarget.dataset.action;
  if (action === "open-start") openStart();
  if (action === "close-flow") { flow = null; render(); }
  if (action === "load-plan") { flow.step = "plan"; render(); }
  if (action === "toggle-edit") { flow.editing = !flow.editing; render(); }
  if (action === "confirm-plan") { flow.timeline = buildTimeline(flow.plan); flow.step = "breaks"; render(); }
  if (action === "back-to-plan") { flow.step = "plan"; render(); }
  if (action === "start-reviewed-session") startLive();
  if (action === "test-chime") playMainNotification();
  if (action === "pause-live") togglePause();
  if (action === "request-skip-break") { live.skipStep = "confirm"; renderLive(); }
  if (action === "keep-break") { live.skipStep = null; live.lastTickAt = performance.now(); renderLive(); }
  if (action === "confirm-skip-break") skipCurrentBreak();
  if (action === "request-end-session") { live.endStep = "confirm"; renderLive(); }
  if (action === "resume-session") { live.endStep = null; live.endReason = ""; live.lastTickAt = performance.now(); renderLive(); }
  if (action === "show-end-reason") { live.endStep = "reason"; renderLive(); }
  if (action === "confirm-end-session" && live.endReason.trim()) finishSession("Ended Early", live.endReason);
  if (action === "home") { view = "dashboard"; render(); }
  if (action === "clear-history") { if (confirm("Permanently delete all study history from this device?")) { state.history = []; saveState(); render(); } }
  if (action === "add-mode") { state.modes.push({ id: uid(), name: "Custom", hours: 7, note: "Your quiet plan" }); saveState(); render(); }
  if (action === "close-modal") { modal = null; render(); }
  if (action === "open-edit-record") { const record = state.history.find((item) => item.id === modal.id); modal = { type: "edit-record", id: modal.id, draft: { ...record } }; render(); }
  if (action === "save-record-edit") { state.history = state.history.map((item) => item.id === modal.id ? { ...modal.draft } : item); saveState(); modal = null; render(); }
}

function skipCurrentBreak() {
  if (!live) return;
  const item = live.timeline[live.index];
  if (item.type === "study") return;
  live.skipStep = null;
  live.index += 1;
  if (live.index >= live.timeline.length) return finishSession("Completed");
  live.remaining = live.timeline[live.index].minutes * 60;
  live.lastTickAt = performance.now();
  saveActiveSession();
  renderLive();
}

function togglePause() {
  if (!live) return;
  playToggleSound();
  if (live.paused) {
    live.paused = false;
    live.lastTickAt = performance.now();
  } else {
    live.paused = true;
  }
  saveActiveSession();
  renderLive();
}

function setupDrag() {
  let from = null;
  document.querySelectorAll(".subject-card[draggable='true']").forEach((card) => {
    card.addEventListener("dragstart", () => { from = Number(card.dataset.index); });
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", () => {
      const to = Number(card.dataset.index);
      const [moved] = flow.plan.splice(from, 1);
      flow.plan.splice(to, 0, moved);
      render();
    });
  });
}

let upcomingRailTimer = null;
function setupUpcomingRail() {
  const rail = document.querySelector(".floating-stack");
  if (!rail) return;
  const wakeRail = () => {
    rail.classList.add("is-active");
    clearTimeout(upcomingRailTimer);
    upcomingRailTimer = setTimeout(() => rail.classList.remove("is-active"), 3000);
  };
  rail.addEventListener("pointerdown", wakeRail);
  rail.addEventListener("pointermove", wakeRail);
  rail.addEventListener("scroll", wakeRail, { passive: true });
}

let lastTouchEnd = 0;
document.addEventListener("touchend", (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveActiveSession();
});
window.addEventListener("pagehide", saveActiveSession);
window.addEventListener("beforeunload", saveActiveSession);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
applyTheme();
render();





























