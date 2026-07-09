const COUNTDOWN_START = new Date("2026-07-09T00:00:00");
const STARTING_DAYS = 136;
const STORAGE_KEY = "focus.study.os.v1";

const defaults = {
  stats: { streak: 7, averageHours: 6.4, totalHours: 184, completedSubjects: 41, heat: [0,1,2,0,3,2,1,0,2,3,1,2,0,2,1,3,2,0,1,2,3,3,1,0,2,2,3,1,0,2,3,2,1,2,3,0,2,1,3,2,1,0] },
  modes: [
    { id: "focused", name: "Focused", hours: 6, note: "Sustainable deep work" },
    { id: "intensive", name: "Intensive", hours: 8, note: "Serious but steady" },
    { id: "monk", name: "Monk Mode", hours: 10, note: "A long quiet day" }
  ],
  subjects: [
    { id: "varc", name: "VARC", hours: 2, color: "#a7d8ff", emoji: "📖" },
    { id: "dilr", name: "DILR", hours: 3, color: "#b8efd4", emoji: "🧩" },
    { id: "quant", name: "QUANT", hours: 3, color: "#d6c4ff", emoji: "∑" }
  ],
  recovery: {
    micro: ["Water", "Stretch", "Balcony Walk", "Eye Relaxation", "Breathing Timer"],
    medium: ["Coffee", "Scribble", "Meditation Timer", "Balcony Walk", "Breathing Timer"],
    enabled: ["Water", "Stretch", "Balcony Walk", "Eye Relaxation", "Breathing Timer", "Coffee", "Scribble", "Meditation Timer"]
  },
  theme: "warm"
};

let state = normalizeState(loadState());
let view = "dashboard";
let flow = null;
let live = null;
let ticker = null;
let timelineTimer = null;

const app = document.querySelector("#app");


function normalizeState(saved) {
  const subjectDefaults = new Map(defaults.subjects.map((subject) => [subject.id, subject]));
  saved.subjects = (saved.subjects || defaults.subjects).map((subject) => {
    const preset = subjectDefaults.get(subject.id) || {};
    return { ...subject, color: preset.color || subject.color, emoji: preset.emoji || subject.emoji };
  });
  saved.modes = saved.modes || defaults.modes;
  saved.recovery = { ...defaults.recovery, ...(saved.recovery || {}) };
  saved.stats = { ...defaults.stats, ...(saved.stats || {}) };
  return saved;
}
function loadState() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; }
  catch { return structuredClone(defaults); }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function uid() { return Math.random().toString(36).slice(2, 9); }
function daysRemaining() {
  const elapsedDays = Math.floor((new Date() - COUNTDOWN_START) / 86400000);
  return Math.max(0, STARTING_DAYS - elapsedDays);
}
function fmtHours(hours) { return `${Number(hours).toFixed(hours % 1 ? 1 : 0)}h`; }
function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function render() {
  clearInterval(ticker);
  app.className = live ? "app-shell live-shell" : "app-shell";
  if (live) return renderLive();
  app.innerHTML = `
    <main class="screen">
      <header class="topbar">
        <div class="brand-mark"><div class="logo"></div><div><p class="eyebrow">Study OS</p><h1>Focus</h1></div></div>
        <button class="icon-btn" data-action="open-start" aria-label="Start">+</button>
      </header>
      ${view === "dashboard" ? dashboard() : customization()}
      <nav class="bottom-nav">
        <button class="nav-item ${view === "dashboard" ? "active" : ""}" data-view="dashboard">Today</button>
        <button class="nav-item ${view === "custom" ? "active" : ""}" data-view="custom">Tune</button>
      </nav>
    </main>
    ${flow ? startFlow() : ""}
  `;
  bindEvents();
}

function dashboard() {
  return `
    <section class="hero-card">
      <p class="eyebrow">Days remaining to CAT</p>
      <div class="days">${daysRemaining()} <span>days</span></div>
      <p class="copy">One calm plan. One quiet decision. Then the day carries itself.</p>
      <button class="primary-btn" data-action="open-start">Start</button>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Study rhythm</h2><span class="total-pill">42 days</span></div>
      <div class="heatmap">${state.stats.heat.map((n) => `<span class="heat-dot on-${n}"></span>`).join("")}</div>
    </section>
    <section class="metric-grid">
      ${metric(state.stats.streak, "Current streak")}
      ${metric(`${state.stats.averageHours}h`, "Average daily study")}
      ${metric(`${state.stats.totalHours}h`, "Total study hours")}
      ${metric(state.stats.completedSubjects, "Completed subjects")}
    </section>
  `;
}

function metric(value, label) { return `<article class="metric-card"><div class="metric-value">${value}</div><div class="metric-label">${label}</div></article>`; }

function customization() {
  return `
    <section class="panel"><div class="panel-head"><h2>Study modes</h2><button class="tiny-btn" data-action="add-mode">Add</button></div>${state.modes.map((mode) => `
      <div class="setting-row"><div><strong>${mode.name}</strong><p class="eyebrow">${mode.note}</p></div><input class="field" type="number" min="1" max="14" value="${mode.hours}" data-mode-hours="${mode.id}" /></div>
    `).join("")}</section>
    <section class="panel"><div class="panel-head"><h2>Default plan</h2><span class="total-pill">${fmtHours(totalSubjectHours())}</span></div>${state.subjects.map((subject) => `
      <div class="setting-row"><div><strong>${subject.name}</strong><p class="eyebrow">Default block</p></div><input class="field" type="number" min="0.5" max="8" step="0.5" value="${subject.hours}" data-subject-hours="${subject.id}" /></div>
    `).join("")}</section>
    <section class="panel"><div class="panel-head"><h2>Recovery</h2></div><div class="activity-list">${allActivities().map((activity) => `<button class="chip ${state.recovery.enabled.includes(activity) ? "active" : ""}" data-activity="${activity}">${activity}</button>`).join("")}</div></section>
    <section class="panel"><div class="panel-head"><h2>Theme</h2></div><div class="theme-row">${["warm","mint","sky","rose"].map((theme) => `<button class="swatch ${state.theme === theme ? "active" : ""}" data-theme="${theme}" style="background:${themeColor(theme)}"></button>`).join("")}</div></section>
  `;
}

function totalSubjectHours() { return state.subjects.reduce((sum, s) => sum + Number(s.hours), 0); }
function allActivities() { return [...new Set([...state.recovery.micro, ...state.recovery.medium])]; }
function themeColor(theme) { return { warm: "#ffe28a", mint: "#b8efd4", sky: "#a7d8ff", rose: "#ffc2b3" }[theme]; }

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
  return `
    <div class="overlay"><section class="sheet"><div class="panel-head"><div><p class="eyebrow">${mode.name} · ${fmtHours(mode.hours)}</p><h2>Today's plan</h2></div><span class="total-pill ${valid ? "good" : "bad"}">${fmtHours(total)}</span></div>
    <div class="plan-list">${flow.plan.map((s, i) => `<article class="subject-card" draggable="${flow.editing}" data-index="${i}"><div class="drag">${flow.editing ? "=" : "↓"}</div><div><strong>${s.name}</strong><p class="eyebrow">${fmtHours(s.hours)}</p></div>${flow.editing ? `<div class="subject-stepper"><button data-nudge="${i}:-0.5">-</button><button data-nudge="${i}:0.5">+</button></div>` : ""}</article>`).join("")}</div>
    <div class="sheet-actions"><button class="primary-btn" data-action="confirm-plan" ${valid ? "" : "disabled"}>Confirm and lock</button><button class="soft-btn" data-action="toggle-edit">${flow.editing ? "Done editing" : "Edit"}</button><button class="tiny-btn" data-action="close-flow">Cancel</button></div></section></div>`;
}

function buildTimeline(plan) {
  const timeline = [];
  let lastRecovery = "";
  plan.forEach((subject, subjectIndex) => {
    const parts = Math.max(1, Math.round(subject.hours));
    const segmentMinutes = Math.round((subject.hours * 60) / parts);
    for (let i = 0; i < parts; i++) {
      timeline.push({ type: "study", subject: subject.name, minutes: segmentMinutes, color: subject.color, emoji: subject.emoji || "•" });
      if (i < parts - 1) {
        const activity = pickActivity(state.recovery.micro, lastRecovery);
        lastRecovery = activity;
        timeline.push({ type: "micro", subject: activity, minutes: i % 2 ? 4 : 3, color: subject.color, emoji: recoveryEmoji(activity) });
      }
    }
    if (subjectIndex < plan.length - 1) {
      const activity = pickActivity(state.recovery.medium, lastRecovery);
      lastRecovery = activity;
      timeline.push({ type: "medium", subject: activity, minutes: subjectIndex % 2 ? 15 : 12, color: subject.color, emoji: recoveryEmoji(activity) });
    }
  });
  return timeline;
}
function pickActivity(list, previous) {
  const enabled = list.filter((item) => state.recovery.enabled.includes(item));
  const pool = enabled.length ? enabled : list;
  return pool.find((item) => item !== previous) || pool[0];
}

function startLive() {
  flow.plan = flow.plan.map((s) => ({ ...s, id: s.id || uid() }));
  live = { timeline: buildTimeline(flow.plan), index: 0, remaining: 0, paused: false, expanded: false, started: Date.now() };
  live.remaining = live.timeline[0].minutes * 60;
  flow = null;
  render();
}

function renderLive() {
  clearInterval(ticker);
  const item = live.timeline[live.index];
  const duration = item.minutes * 60;
  const itemLeft = clamp((live.remaining / duration) * 100, 0, 100);
  const totalSeconds = live.timeline.reduce((sum, x) => sum + x.minutes * 60, 0);
  const elapsedBefore = live.timeline.slice(0, live.index).reduce((sum, x) => sum + x.minutes * 60, 0);
  const elapsed = elapsedBefore + (duration - live.remaining);
  const progress = clamp((elapsed / totalSeconds) * 100, 0, 100);
  const isRecovery = item.type !== "study";
  const upcoming = live.timeline.slice(live.index + 1, live.index + 4);
  app.innerHTML = `
    <main class="study-mode" style="--card-color:${item.color}; --card-left:${itemLeft}%; --black-width:${100 - itemLeft}%">
      <section class="standby-card ${isRecovery ? "recovery-card" : ""}">
        <div class="empty-layer"></div>
        <div class="card-grain"></div>
        <div class="standby-content">
          <p class="eyebrow">${isRecovery ? recoveryLabel(item.type) : "Now studying"}</p>
          <div class="session-emoji">${item.emoji || "•"}</div>
          <div class="subject">${item.subject}</div>
          <div class="countdown">${fmtTime(live.remaining)}</div>
          <button class="pause-btn ${live.paused ? "is-paused" : ""}" data-action="pause-live">${live.paused ? "Resume" : "Pause"}</button>
        </div>
      </section>
      <button class="progress-shell" data-action="expand-timeline" aria-label="Show timeline"><div class="progress-fill" style="width:${progress}%"></div></button>
      <aside class="floating-stack">${upcoming.map((x) => `<div class="stack-card" style="--mini-color:${x.color}"><span>${x.emoji || "•"}</span><strong>${x.subject}</strong><small>${x.minutes}m</small></div>`).join("")}</aside>
      ${live.expanded ? `<section class="timeline">${live.timeline.map((x, i) => `<div class="timeline-row"><strong>${i === live.index ? "Now · " : ""}${x.emoji || "•"} ${x.subject}</strong><span>${x.minutes}m</span></div>`).join("")}</section>` : ""}
    </main>
  `;
  bindEvents();
  ticker = setInterval(tick, 1000);
}
function recoveryLabel(type) { return type === "micro" ? "Micro recovery" : "Medium recovery"; }
function recoveryEmoji(activity) {
  return {
    "Water": "💧",
    "Stretch": "🙆",
    "Balcony Walk": "🌿",
    "Eye Relaxation": "👁",
    "Breathing Timer": "◌",
    "Coffee": "☕",
    "Scribble": "✎",
    "Meditation Timer": "🧘"
  }[activity] || "•";
}
function tick() {
  if (!live || live.paused) return;
  live.remaining -= 1;
  if (live.remaining <= 0) {
    live.index += 1;
    if (live.index >= live.timeline.length) return finishSession();
    live.remaining = live.timeline[live.index].minutes * 60;
  }
  renderLive();
}

function finishSession() {
  clearInterval(ticker);
  const hours = live.timeline.filter((x) => x.type === "study").reduce((sum, x) => sum + x.minutes / 60, 0);
  const subjects = live.timeline.filter((x) => x.type === "study").length;
  state.stats.totalHours = Math.round((state.stats.totalHours + hours) * 10) / 10;
  state.stats.averageHours = Math.round(((state.stats.averageHours + hours) / 2) * 10) / 10;
  state.stats.streak += 1;
  state.stats.completedSubjects += subjects;
  state.stats.heat = [...state.stats.heat.slice(1), 3];
  saveState();
  live = null;
  app.innerHTML = `<main class="screen"><section class="summary-card"><p class="eyebrow">Session complete</p><h1>Quiet work done.</h1><div class="metric-grid">${metric(`${hours.toFixed(1)}h`, "Today's study")}${metric(subjects, "Completed blocks")}${metric(state.stats.streak, "Current streak")}${metric("+1", "Day protected")}</div><button class="primary-btn" data-action="home">Done</button></section></main>`;
  bindEvents();
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
    flow.plan[index].hours = clamp(flow.plan[index].hours + delta, 0.5, 10);
    render();
  }));
  document.querySelectorAll("[data-mode-hours]").forEach((input) => input.addEventListener("change", () => {
    const mode = state.modes.find((m) => m.id === input.dataset.modeHours);
    mode.hours = clamp(Number(input.value), 1, 14); saveState(); render();
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
  document.querySelectorAll("[data-theme]").forEach((btn) => btn.addEventListener("click", () => { state.theme = btn.dataset.theme; document.documentElement.style.setProperty("--sun", themeColor(state.theme)); saveState(); render(); }));
  setupDrag();
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (action === "open-start") openStart();
  if (action === "close-flow") { flow = null; render(); }
  if (action === "load-plan") { flow.step = "plan"; render(); }
  if (action === "toggle-edit") { flow.editing = !flow.editing; render(); }
  if (action === "confirm-plan") startLive();
  if (action === "pause-live") { live.paused = !live.paused; renderLive(); }
  if (action === "expand-timeline") { live.expanded = true; clearTimeout(timelineTimer); timelineTimer = setTimeout(() => { if (live) { live.expanded = false; renderLive(); } }, 3500); renderLive(); }
  if (action === "home") { view = "dashboard"; render(); }
  if (action === "add-mode") { state.modes.push({ id: uid(), name: "Custom", hours: 7, note: "Your quiet plan" }); saveState(); render(); }
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
document.documentElement.style.setProperty("--sun", themeColor(state.theme));
render();












