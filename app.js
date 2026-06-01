const STORAGE_KEY = "progressive-fitness.entries.v1";
const EXERCISES_KEY = "progressive-fitness.exercises.v1";

const DEFAULT_EXERCISES = ["卧推", "深蹲", "硬拉", "肩推", "划船", "引体向上"];

const state = {
  exercises: readJson(EXERCISES_KEY, DEFAULT_EXERCISES),
  entries: readJson(STORAGE_KEY, []),
  selectedExercise: "",
};

const exerciseGrid = document.querySelector("#exerciseGrid");
const exerciseForm = document.querySelector("#exerciseForm");
const exerciseInput = document.querySelector("#exerciseInput");
const entryForm = document.querySelector("#entryForm");
const historyList = document.querySelector("#historyList");
const lastWeight = document.querySelector("#lastWeight");
const nextWeight = document.querySelector("#nextWeight");
const bestWeight = document.querySelector("#bestWeight");
const clearButton = document.querySelector("#clearButton");
const exportButton = document.querySelector("#exportButton");

state.selectedExercise = state.exercises[0] || DEFAULT_EXERCISES[0];

render();
registerServiceWorker();

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

  state.entries.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
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
  if (!state.entries.length) return;
  if (confirm("确定清空所有训练记录吗？")) {
    state.entries = [];
    writeJson(STORAGE_KEY, state.entries);
    render();
  }
});

exportButton.addEventListener("click", async () => {
  const payload = JSON.stringify(state.entries, null, 2);
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
  renderExercises();
  renderStats();
  renderHistory();
}

function renderExercises() {
  exerciseGrid.replaceChildren();
  state.exercises.forEach((exercise) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = exercise;
    button.className = exercise === state.selectedExercise ? "active" : "";
    button.addEventListener("click", () => {
      state.selectedExercise = exercise;
      render();
    });
    exerciseGrid.append(button);
  });
}

function renderStats() {
  const list = entriesForSelected();
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
    empty.textContent = "还没有记录。保存一次训练后，这里会显示历史和建议重量。";
    historyList.append(empty);
    return;
  }

  const template = document.querySelector("#entryTemplate");
  state.entries.forEach((entry) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = entry.exercise;
    node.querySelector(".entry-meta").textContent = [
      formatDate(entry.date),
      `${entry.sets} 组 x ${entry.reps} 次`,
      entry.rpe ? `RPE ${entry.rpe}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    node.querySelector(".entry-note").textContent = entry.note || "";
    node.querySelector(".entry-side strong").textContent = formatKg(entry.weight);
    node.querySelector("button").addEventListener("click", () => deleteEntry(entry.id));
    historyList.append(node);
  });
}

function deleteEntry(id) {
  state.entries = state.entries.filter((entry) => entry.id !== id);
  writeJson(STORAGE_KEY, state.entries);
  render();
}

function entriesForSelected() {
  return state.entries.filter((entry) => entry.exercise === state.selectedExercise);
}

function nextProgression(weight) {
  const bump = weight < 40 ? 1.25 : 2.5;
  return Number((weight + bump).toFixed(2));
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
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

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js");
  }
}
