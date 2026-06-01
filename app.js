const STORAGE_KEY = "progressive-fitness.entries.v1";
const EXERCISES_KEY = "progressive-fitness.exercises.v1";
const SESSIONS_KEY = "progressive-fitness.sessions.v1";

const DEFAULT_EXERCISES = ["卧推", "深蹲", "硬拉", "肩推", "划船", "引体向上"];

const state = {
  exercises: readJson(EXERCISES_KEY, DEFAULT_EXERCISES),
  entries: readJson(STORAGE_KEY, []),
  sessions: readJson(SESSIONS_KEY, []),
  selectedExercise: "",
  selectedSessionId: "",
};

const exerciseGrid = document.querySelector("#exerciseGrid");
const exerciseForm = document.querySelector("#exerciseForm");
const exerciseInput = document.querySelector("#exerciseInput");
const sessionForm = document.querySelector("#sessionForm");
const sessionInput = document.querySelector("#sessionInput");
const sessionStrip = document.querySelector("#sessionStrip");
const activeSessionSummary = document.querySelector("#activeSessionSummary");
const selectedSessionLabel = document.querySelector("#selectedSessionLabel");
const startButton = document.querySelector("#startButton");
const finishButton = document.querySelector("#finishButton");
const sessionStatus = document.querySelector("#sessionStatus");
const sessionVolume = document.querySelector("#sessionVolume");
const entryForm = document.querySelector("#entryForm");
const saveEntryButton = document.querySelector("#saveEntryButton");
const historyList = document.querySelector("#historyList");
const lastWeight = document.querySelector("#lastWeight");
const nextWeight = document.querySelector("#nextWeight");
const bestWeight = document.querySelector("#bestWeight");
const clearButton = document.querySelector("#clearButton");
const exportButton = document.querySelector("#exportButton");

state.selectedExercise = state.exercises[0] || DEFAULT_EXERCISES[0];
ensureSession();
migrateLooseEntries();

render();
registerServiceWorker();

sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = sessionInput.value.trim() || defaultSessionName();
  const session = createSession(name);
  state.sessions.unshift(session);
  state.selectedSessionId = session.id;
  writeJson(SESSIONS_KEY, state.sessions);
  sessionInput.value = "";
  render();
});

startButton.addEventListener("click", () => {
  ensureSession();
  const session = activeSession();
  if (session.endedAt) {
    const next = createSession(sessionInput.value.trim() || defaultSessionName());
    next.startedAt = new Date().toISOString();
    next.date = next.startedAt;
    state.sessions.unshift(next);
    state.selectedSessionId = next.id;
  } else {
    session.startedAt = session.startedAt || new Date().toISOString();
    session.date = session.startedAt;
  }
  writeJson(SESSIONS_KEY, state.sessions);
  sessionInput.value = "";
  render();
});

finishButton.addEventListener("click", () => {
  const session = activeSession();
  if (!session.startedAt) {
    alert("请先开始训练。");
    return;
  }
  if (!entriesForSession(session.id).length) {
    alert("当前集合还没有动作记录。");
    return;
  }
  session.endedAt = new Date().toISOString();
  writeJson(SESSIONS_KEY, state.sessions);
  render();
});

exerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = exerciseInput.value.trim();
  if (!value) return;
  if (!state.exercises.includes(value)) {
    state.exercises.push(value);
    writeJson(EXERCISES_KEY, state.exercises);
  }
  state.selectedExercise = value;
  exerciseInput.value = "";
  render();
});

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const weight = parseNumber("#weightInput");
  const sets = parseNumber("#setsInput");
  const reps = parseNumber("#repsInput");
  const rpe = parseOptionalNumber("#rpeInput");
  const note = document.querySelector("#noteInput").value.trim();

  if (!state.selectedExercise || !weight || !sets || !reps) {
    alert("请填写动作、重量、组数和次数。");
    return;
  }

  ensureSession();
  const session = activeSession();
  if (!session.startedAt || session.endedAt) {
    alert("请先开始一个训练集合，再保存动作记录。");
    return;
  }
  state.entries.unshift({
    id: createId(),
    sessionId: state.selectedSessionId,
    exercise: state.selectedExercise,
    weight,
    sets,
    reps,
    rpe,
    note,
    date: new Date().toISOString(),
  });

  writeJson(STORAGE_KEY, state.entries);
  document.querySelector("#weightInput").value = "";
  document.querySelector("#noteInput").value = "";
  render();
});

clearButton.addEventListener("click", () => {
  if (!state.entries.length && state.sessions.length <= 1) return;
  if (confirm("确定清空所有训练集合和记录吗？")) {
    state.entries = [];
    state.sessions = [createSession(defaultSessionName())];
    state.selectedSessionId = state.sessions[0].id;
    writeJson(STORAGE_KEY, state.entries);
    writeJson(SESSIONS_KEY, state.sessions);
    render();
  }
});

exportButton.addEventListener("click", async () => {
  const payload = JSON.stringify(
    { sessions: state.sessions, entries: state.entries, exercises: state.exercises },
    null,
    2
  );
  if (navigator.share) {
    const file = new File([payload], "fitness-records.json", { type: "application/json" });
    try {
      await navigator.share({ files: [file], title: "训练记录" });
      return;
    } catch {
      return;
    }
  }
  await navigator.clipboard.writeText(payload);
  alert("训练记录已复制到剪贴板。");
});

function render() {
  renderSessions();
  renderExercises();
  renderStats();
  renderHistory();
}

function renderSessions() {
  const active = activeSession();
  const activeEntries = entriesForSession(active.id);
  const activeVolume = totalVolume(activeEntries);
  activeSessionSummary.textContent = `${active.name} · ${activeEntries.length} 个动作`;
  selectedSessionLabel.textContent = active.name;
  sessionStatus.textContent = sessionStatusText(active);
  sessionVolume.textContent = `${formatVolume(activeVolume)} kg·次`;
  startButton.disabled = Boolean(active.startedAt && !active.endedAt);
  finishButton.disabled = Boolean(!active.startedAt || active.endedAt);
  saveEntryButton.disabled = Boolean(!active.startedAt || active.endedAt);
  saveEntryButton.textContent = active.endedAt ? "训练已结束" : "保存动作记录";

  sessionStrip.replaceChildren();
  state.sessions.slice(0, 8).forEach((session) => {
    const entries = entriesForSession(session.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = session.id === state.selectedSessionId ? "active" : "";
    button.innerHTML = `<strong>${escapeHtml(session.name)}</strong><span>${sessionStatusText(session)} · ${entries.length} 个动作</span>`;
    button.addEventListener("click", () => {
      state.selectedSessionId = session.id;
      render();
    });
    sessionStrip.append(button);
  });
}

function renderExercises() {
  exerciseGrid.replaceChildren();
  state.exercises.forEach((exercise) => {
    const item = document.createElement("div");
    item.className = "exercise-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "exercise-select";
    button.textContent = exercise;
    if (exercise === state.selectedExercise) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      state.selectedExercise = exercise;
      render();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "exercise-delete";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `删除${exercise}`);
    deleteButton.addEventListener("click", () => deleteExercise(exercise));

    item.append(button, deleteButton);
    exerciseGrid.append(item);
  });
}

function renderStats() {
  const list = entriesForSelectedExercise();
  const last = list[0];
  const best = list.reduce((winner, entry) => {
    if (!winner || entry.weight > winner.weight) return entry;
    return winner;
  }, undefined);

  lastWeight.textContent = last ? `${formatKg(last.weight)}` : "--";
  bestWeight.textContent = best ? `${formatKg(best.weight)}` : "--";
  nextWeight.textContent = last ? `${formatKg(nextProgression(last.weight))}` : "--";
}

function renderHistory() {
  historyList.replaceChildren();

  if (!state.entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "还没有记录。先新建一个训练集合，再把这次训练的动作逐个保存进去。";
    historyList.append(empty);
    return;
  }

  const template = document.querySelector("#sessionTemplate");
  state.sessions
    .filter((session) => entriesForSession(session.id).length)
    .forEach((session) => {
      const entries = entriesForSession(session.id);
      const totalSets = entries.reduce((sum, entry) => sum + entry.sets, 0);
      const volume = totalVolume(entries);
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector("h3").textContent = session.name;
      node.querySelector(".session-card-head p").textContent = [
        formatDate(session.startedAt || session.date),
        session.endedAt ? `结束 ${formatTime(session.endedAt)}` : session.startedAt ? "训练中" : "未开始",
        `${entries.length} 个动作`,
        `${totalSets} 组`,
      ].join(" · ");
      node.querySelector(".session-card-head strong").textContent = `${formatVolume(volume)} kg·次`;

      const wrap = node.querySelector(".session-entries");
      entries.forEach((entry) => wrap.append(renderEntry(entry)));
      historyList.append(node);
    });
}

function renderEntry(entry) {
  const row = document.createElement("div");
  row.className = "entry-row";

  const main = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = entry.exercise;
  const meta = document.createElement("p");
  meta.textContent = [
    `${entry.sets} 组 x ${entry.reps} 次`,
    entry.rpe ? `RPE ${entry.rpe}` : "",
    formatTime(entry.date),
  ]
    .filter(Boolean)
    .join(" · ");
  main.append(title, meta);
  if (entry.note) {
    const note = document.createElement("p");
    note.className = "entry-note";
    note.textContent = entry.note;
    main.append(note);
  }

  const side = document.createElement("div");
  side.className = "entry-side";
  const weight = document.createElement("strong");
  weight.textContent = formatKg(entry.weight);
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "删除";
  del.setAttribute("aria-label", `删除${entry.exercise}记录`);
  del.addEventListener("click", () => deleteEntry(entry.id));
  side.append(weight, del);

  row.append(main, side);
  return row;
}

function deleteEntry(id) {
  state.entries = state.entries.filter((entry) => entry.id !== id);
  writeJson(STORAGE_KEY, state.entries);
  render();
}

function deleteExercise(exercise) {
  if (state.exercises.length <= 1) {
    alert("至少保留一个训练动作。");
    return;
  }
  if (!confirm(`从动作列表删除「${exercise}」吗？历史记录会保留。`)) {
    return;
  }
  state.exercises = state.exercises.filter((item) => item !== exercise);
  if (state.selectedExercise === exercise) {
    state.selectedExercise = state.exercises[0];
  }
  writeJson(EXERCISES_KEY, state.exercises);
  render();
}

function ensureSession() {
  if (state.sessions.length && state.sessions.some((session) => session.id === state.selectedSessionId)) {
    return;
  }
  if (!state.sessions.length) {
    state.sessions = [createSession(defaultSessionName())];
    writeJson(SESSIONS_KEY, state.sessions);
  }
  state.selectedSessionId = state.sessions[0].id;
}

function migrateLooseEntries() {
  const loose = state.entries.filter((entry) => !entry.sessionId);
  if (!loose.length) return;
  const migrationSession = createSession("历史记录");
  const firstLooseDate = loose[loose.length - 1]?.date;
  if (firstLooseDate) migrationSession.date = firstLooseDate;
  state.sessions.push(migrationSession);
  state.entries = state.entries.map((entry) =>
    entry.sessionId ? entry : { ...entry, sessionId: migrationSession.id }
  );
  writeJson(SESSIONS_KEY, state.sessions);
  writeJson(STORAGE_KEY, state.entries);
}

function createSession(name) {
  return {
    id: createId(),
    name,
    date: new Date().toISOString(),
    startedAt: null,
    endedAt: null,
  };
}

function activeSession() {
  return state.sessions.find((session) => session.id === state.selectedSessionId) || state.sessions[0];
}

function entriesForSession(sessionId) {
  return state.entries.filter((entry) => entry.sessionId === sessionId);
}

function entriesForSelectedExercise() {
  return state.entries.filter((entry) => entry.exercise === state.selectedExercise);
}

function nextProgression(weight) {
  const bump = weight < 40 ? 1.25 : 2.5;
  return Number((weight + bump).toFixed(2));
}

function totalVolume(entries) {
  return entries.reduce((sum, entry) => sum + entry.weight * entry.sets * entry.reps, 0);
}

function formatVolume(value) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

function sessionStatusText(session) {
  if (session.endedAt) return "已结束";
  if (session.startedAt) return "训练中";
  return "未开始";
}

function parseNumber(selector) {
  const value = Number(document.querySelector(selector).value);
  return Number.isFinite(value) ? value : 0;
}

function parseOptionalNumber(selector) {
  const raw = document.querySelector(selector).value.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function formatKg(weight) {
  return `${Number(weight).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} kg`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

function formatTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function defaultSessionName() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js");
  }
}
