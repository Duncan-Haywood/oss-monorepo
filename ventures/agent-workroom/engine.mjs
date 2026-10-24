// Agent Workroom: the pure part. Parses typed or spoken commands, keeps the
// task list, turns a repository's pull requests into tasks, and lays the
// desks out in the room. No DOM and no network here, so all of it runs under
// `node --test`.

export const STATUSES = ["todo", "doing", "review", "done"];
export const STATUS_LABELS = { todo: "To do", doing: "In progress", review: "In review", done: "Done" };
// What a status means as a progress bar when nobody set one by hand.
export const DEFAULT_PROGRESS = { todo: 0, doing: 40, review: 80, done: 100 };
export const DEFAULT_AGENTS = ["Scout", "Builder", "Reviewer"];
export const MAX_TITLE = 140;

const STATUS_WORDS = [
  [/^(?:to ?do|todo|backlog|queue[d]?)$/, "todo"],
  [/^(?:doing|in progress|progress|started|start|working|active)$/, "doing"],
  [/^(?:review|in review|reviewing|ready)$/, "review"],
  [/^(?:done|finished|complete|completed|closed|merged)$/, "done"],
];

/** "in review" → "review"; null for words that are not a status. */
export function statusFromWord(word) {
  const w = String(word || "").toLowerCase().trim().replace(/[.!?]+$/, "");
  for (const [re, status] of STATUS_WORDS) if (re.test(w)) return status;
  return null;
}

function tidy(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function capitalise(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function findAgent(name, agents) {
  const n = String(name || "").toLowerCase();
  return agents.find((a) => a.toLowerCase() === n) || null;
}

/**
 * Split a task phrase into its parts. Works on typed shorthand
 * ("fix login @Builder #auth !") and on what speech recognition hands back
 * ("fix the login bug for builder high priority"). Spoken "for <name>" only
 * counts when <name> is a known agent, so "write docs for users" stays a title.
 */
export function parseTask(text, agents = DEFAULT_AGENTS) {
  let rest = tidy(text);
  let agent = null;
  let priority = "normal";
  const tags = [];

  rest = rest.replace(/(^|\s)@([\w-]+)/g, (_, pre, name) => {
    agent = findAgent(name, agents) || capitalise(name);
    return pre;
  });
  rest = rest.replace(/(^|\s)#([\w-]+)/g, (_, pre, tag) => {
    tags.push(tag.toLowerCase());
    return pre;
  });
  rest = rest.replace(/(^|\s)!+(?=\s|$)/g, (_, pre) => {
    priority = "high";
    return pre;
  });
  rest = rest.replace(/[,.]?\s*\b(?:high priority|urgent|asap|important)\b[.!]?/gi, () => {
    priority = "high";
    return " ";
  });
  rest = tidy(rest);
  if (!agent) {
    rest = rest.replace(/\s+(?:for|to|assign(?:ed)? to)\s+([\w-]+)[.!]?$/i, (whole, name) => {
      const known = findAgent(name, agents);
      if (!known) return whole;
      agent = known;
      return "";
    });
  }
  const title = capitalise(tidy(rest).replace(/[.,;:]+$/, "")).slice(0, MAX_TITLE);
  return { title, agent, tags, priority };
}

const ADD_PREFIX = /^(?:(?:please\s+)?(?:add|new|create|make)(?:\s+a)?(?:\s+new)?\s+task\s*(?:to\s+|:\s*|-\s*)?|task\s*:\s*|todo\s*:\s*)/i;
const MOVE = /^(?:move|mark|set|put)\s+(.+?)\s+(?:to|as|in|into)\s+(.+)$/i;
const MARK = /^(?:mark|set)\s+(.+?)\s+(done|finished|complete|completed)[.!]?$/i;
const START = /^(?:start|begin|pick up)\s+(?:task\s+)?(.+?)[.!]?$/i;
const FINISH = /^(?:finish|complete|close)\s+(?:task\s+)?(.+?)[.!]?$/i;
const DELETE = /^(?:delete|remove|drop)\s+(?:task\s+)?(.+?)[.!]?$/i;
const ASSIGN = /^(?:assign|give)\s+(?:task\s+)?(.+?)\s+to\s+([\w-]+)[.!]?$/i;
const AGENT = /^(?:add|new|hire)\s+(?:an?\s+)?agent\s+(?:called\s+|named\s+)?([\w-]+)[.!]?$/i;

/**
 * Read one line of input as a command. Anything that is not a recognised verb
 * is a new task, so "refactor the parser" just works.
 *   { kind: "add", task } | { kind: "move", ref, status } | { kind: "delete", ref }
 *   { kind: "assign", ref, agent } | { kind: "agent", name } | { kind: "empty" }
 */
export function parseCommand(text, agents = DEFAULT_AGENTS) {
  const line = tidy(text);
  if (!line) return { kind: "empty" };
  let m;
  if ((m = line.match(AGENT))) return { kind: "agent", name: capitalise(m[1]) };
  if (ADD_PREFIX.test(line)) return { kind: "add", task: parseTask(line.replace(ADD_PREFIX, ""), agents) };
  if ((m = line.match(MARK))) return { kind: "move", ref: m[1], status: "done" };
  if ((m = line.match(MOVE))) {
    const status = statusFromWord(m[2]);
    if (status) return { kind: "move", ref: m[1], status };
  }
  if ((m = line.match(ASSIGN))) return { kind: "assign", ref: m[1], agent: findAgent(m[2], agents) || capitalise(m[2]) };
  if ((m = line.match(START))) return { kind: "move", ref: m[1], status: "doing" };
  if ((m = line.match(FINISH))) return { kind: "move", ref: m[1], status: "done" };
  if ((m = line.match(DELETE))) return { kind: "delete", ref: m[1] };
  return { kind: "add", task: parseTask(line, agents) };
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * Find the task a command means: "3", "#3", "task three", or the start of a
 * title ("login" finds "Login page broken"). Null when nothing or more than
 * one task matches, so a vague spoken command never moves the wrong card.
 */
export function findTask(tasks, ref) {
  let r = tidy(ref).toLowerCase().replace(/^(?:task|number|the)\s+/, "").replace(/^#/, "").replace(/[.!?]+$/, "");
  if (NUMBER_WORDS[r]) r = String(NUMBER_WORDS[r]);
  if (/^\d+$/.test(r)) return tasks.find((t) => t.num === Number(r)) || null;
  if (!r) return null;
  const exact = tasks.filter((t) => t.title.toLowerCase() === r);
  if (exact.length === 1) return exact[0];
  const prefix = tasks.filter((t) => t.title.toLowerCase().startsWith(r));
  if (prefix.length === 1) return prefix[0];
  const inside = tasks.filter((t) => t.title.toLowerCase().includes(r));
  return inside.length === 1 ? inside[0] : null;
}

export function emptyState() {
  return { version: 1, nextNum: 1, agents: [...DEFAULT_AGENTS], tasks: [], repo: "" };
}

function stamp(now) {
  return new Date(now).toISOString();
}

export function addTask(state, fields, now = Date.now()) {
  const title = tidy(fields.title).slice(0, MAX_TITLE);
  if (!title) return { state, task: null };
  const status = STATUSES.includes(fields.status) ? fields.status : "todo";
  const task = {
    id: fields.id || `t${state.nextNum}`,
    num: state.nextNum,
    title,
    agent: fields.agent || null,
    status,
    progress: clampProgress(fields.progress ?? DEFAULT_PROGRESS[status]),
    priority: fields.priority === "high" ? "high" : "normal",
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    url: fields.url || null,
    source: fields.source || "local",
    created: stamp(now),
    updated: stamp(now),
  };
  const agents = task.agent && !findAgent(task.agent, state.agents) ? [...state.agents, task.agent] : state.agents;
  return { state: { ...state, agents, nextNum: state.nextNum + 1, tasks: [...state.tasks, task] }, task };
}

export function clampProgress(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** Change fields on one task. Moving status resets progress to that status's default unless progress is also given. */
export function updateTask(state, id, changes, now = Date.now()) {
  const tasks = state.tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t, ...changes, updated: stamp(now) };
    if (changes.status && changes.status !== t.status && changes.progress === undefined) {
      next.progress = DEFAULT_PROGRESS[changes.status];
    }
    next.progress = clampProgress(next.progress);
    if (next.progress === 100 && changes.progress !== undefined && !changes.status) next.status = "done";
    return next;
  });
  const agent = changes.agent;
  const agents = agent && !findAgent(agent, state.agents) ? [...state.agents, agent] : state.agents;
  return { ...state, agents, tasks };
}

export function removeTask(state, id) {
  return { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
}

export function addAgent(state, name) {
  const n = capitalise(tidy(name).replace(/[^\w -]/g, "")).slice(0, 24);
  if (!n || findAgent(n, state.agents)) return state;
  return { ...state, agents: [...state.agents, n] };
}

/** Run a parsed command. Returns the new state and a sentence to show (and speak back). */
export function applyCommand(state, command, now = Date.now()) {
  switch (command.kind) {
    case "empty":
      return { state, message: "Type or say a task." };
    case "agent": {
      const next = addAgent(state, command.name);
      return { state: next, message: next === state ? `${command.name} already has a desk.` : `${command.name} has a desk now.` };
    }
    case "add": {
      const { state: next, task } = addTask(state, command.task, now);
      if (!task) return { state, message: "That task has no title." };
      return { state: next, message: `Added task ${task.num}: ${task.title}${task.agent ? ` for ${task.agent}` : ""}.` };
    }
    default: {
      const task = findTask(state.tasks, command.ref);
      if (!task) return { state, message: `No single task matches "${command.ref}". Use its number.` };
      if (command.kind === "delete") return { state: removeTask(state, task.id), message: `Removed task ${task.num}.` };
      if (command.kind === "assign") {
        return { state: updateTask(state, task.id, { agent: command.agent }, now), message: `Task ${task.num} is ${command.agent}'s now.` };
      }
      return {
        state: updateTask(state, task.id, { status: command.status }, now),
        message: `Task ${task.num} moved to ${STATUS_LABELS[command.status].toLowerCase()}.`,
      };
    }
  }
}

/** "https://github.com/a/b/pulls" or "a/b" → "a/b"; null if it is not an owner/repo pair. */
export function normaliseRepo(input) {
  const s = tidy(input).replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/\.git$/i, "");
  const m = s.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function pullsApiUrl(repo, perPage = 40) {
  return `https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}`;
}

/**
 * Who is "doing" a pull request. Agent branches carry their tool in the
 * prefix (claude/…, codex/…, copilot/…), which says more than a shared login;
 * otherwise it is the author.
 */
export function agentForPull(pr) {
  const branch = pr?.head?.ref || "";
  const prefix = branch.includes("/") ? branch.split("/")[0] : "";
  if (/^(?:claude|codex|copilot|cursor|devin|jules|aider|openhands|sweep)$/i.test(prefix)) return capitalise(prefix.toLowerCase());
  const login = pr?.user?.login || "";
  if (/\[bot\]$/.test(login)) return capitalise(login.replace(/\[bot\]$/, "").split("-")[0]);
  return login || "Unassigned";
}

/** A pull request as a task: draft → in progress, open → in review, merged → done. Closed unmerged → null. */
export function pullToTask(pr, repo) {
  if (!pr || typeof pr.number !== "number") return null;
  const merged = Boolean(pr.merged_at);
  if (pr.state === "closed" && !merged) return null;
  const status = merged ? "done" : pr.draft ? "doing" : "review";
  return {
    id: `gh:${repo}#${pr.number}`,
    title: tidy(pr.title || `Pull request ${pr.number}`).slice(0, MAX_TITLE),
    agent: agentForPull(pr),
    status,
    progress: DEFAULT_PROGRESS[status],
    priority: "normal",
    tags: [`pr-${pr.number}`],
    url: pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
    source: "github",
  };
}

/** Upsert pulled-in tasks by id, keeping local numbers and any progress a person set by hand. */
export function mergePulls(state, pulls, repo, now = Date.now()) {
  let next = state;
  let added = 0;
  let changed = 0;
  for (const pr of pulls) {
    const t = pullToTask(pr, repo);
    if (!t) continue;
    const existing = next.tasks.find((x) => x.id === t.id);
    if (!existing) {
      next = addTask(next, t, now).state;
      added++;
    } else if (existing.status !== t.status || existing.title !== t.title) {
      next = updateTask(next, t.id, { status: t.status, title: t.title }, now);
      changed++;
    }
  }
  return { state: { ...next, repo }, added, changed };
}

/** Per-agent counts and how far along their tasks are, for the desk monitors. */
export function agentSummary(state) {
  return state.agents.map((name) => {
    const mine = state.tasks.filter((t) => t.agent && t.agent.toLowerCase() === name.toLowerCase());
    const counts = Object.fromEntries(STATUSES.map((s) => [s, mine.filter((t) => t.status === s).length]));
    const current =
      mine.find((t) => t.status === "doing") || mine.find((t) => t.status === "review") || mine.find((t) => t.status === "todo") || null;
    const progress = mine.length ? Math.round(mine.reduce((sum, t) => sum + t.progress, 0) / mine.length) : 0;
    return { name, total: mine.length, counts, current, progress };
  });
}

export function overallProgress(state) {
  if (!state.tasks.length) return 0;
  return Math.round(state.tasks.reduce((sum, t) => sum + t.progress, 0) / state.tasks.length);
}

/** A prefilled "new issue" link: the person still reviews and submits it on GitHub. */
export function issueUrl(repo, task) {
  const body = [
    task.agent ? `Suggested agent: ${task.agent}` : "",
    task.tags.length ? `Tags: ${task.tags.map((t) => `#${t}`).join(" ")}` : "",
    task.priority === "high" ? "Priority: high" : "",
    "",
    "_Drafted in Agent Workroom._",
  ]
    .filter((line, i, all) => line || (i > 0 && all[i - 1]))
    .join("\n")
    .trim();
  const q = new URLSearchParams({ title: task.title, body });
  return `https://github.com/${repo}/issues/new?${q}`;
}

/** The task as a brief to paste into a coding agent's chat. */
export function taskBrief(task) {
  const lines = [`Task ${task.num}: ${task.title}`];
  if (task.priority === "high") lines.push("Priority: high.");
  if (task.tags.length) lines.push(`Tags: ${task.tags.join(", ")}.`);
  if (task.url) lines.push(`Context: ${task.url}`);
  lines.push("When you are done, say what changed and how you checked it.");
  return lines.join("\n");
}

/** Read saved or imported JSON back, dropping anything malformed rather than trusting it. */
export function loadState(json) {
  let raw;
  try {
    raw = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return emptyState();
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.tasks)) return emptyState();
  const agents = Array.isArray(raw.agents) ? raw.agents.filter((a) => typeof a === "string" && a.trim()).map((a) => a.slice(0, 24)) : [];
  const tasks = [];
  let maxNum = 0;
  for (const t of raw.tasks) {
    if (!t || typeof t.title !== "string" || !t.title.trim()) continue;
    const num = Number.isInteger(t.num) && t.num > 0 && !tasks.some((x) => x.num === t.num) ? t.num : null;
    const status = STATUSES.includes(t.status) ? t.status : "todo";
    tasks.push({
      id: typeof t.id === "string" && t.id ? t.id : null,
      num,
      title: tidy(t.title).slice(0, MAX_TITLE),
      agent: typeof t.agent === "string" && t.agent.trim() ? t.agent.slice(0, 24) : null,
      status,
      progress: clampProgress(t.progress ?? DEFAULT_PROGRESS[status]),
      priority: t.priority === "high" ? "high" : "normal",
      tags: Array.isArray(t.tags) ? t.tags.filter((x) => typeof x === "string").slice(0, 10) : [],
      url: typeof t.url === "string" && /^https:\/\//.test(t.url) ? t.url : null,
      source: t.source === "github" ? "github" : "local",
      created: typeof t.created === "string" ? t.created : stamp(0),
      updated: typeof t.updated === "string" ? t.updated : stamp(0),
    });
    if (num) maxNum = Math.max(maxNum, num);
  }
  for (const t of tasks) {
    if (!t.num) t.num = ++maxNum;
    if (!t.id) t.id = `t${t.num}`;
    if (t.agent && !agents.some((a) => a.toLowerCase() === t.agent.toLowerCase())) agents.push(t.agent);
  }
  const nextNum = Math.max(maxNum + 1, Number.isInteger(raw.nextNum) ? raw.nextNum : 1);
  const repo = normaliseRepo(raw.repo || "") || "";
  return { version: 1, nextNum, agents, tasks, repo };
}

/**
 * Where each agent's desk stands: an arc facing the task wall, wider as the
 * team grows, so a dozen desks still fit inside the room. Units are CSS px in
 * the scene; z grows toward the viewer, the wall is at negative z.
 */
export function deskLayout(count, { radius = 560, centreZ = 420, maxSpread = 140 } = {}) {
  if (count <= 0) return [];
  const spread = Math.min(maxSpread, 30 + count * 18); // total arc in degrees
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const deg = t * spread;
    const rad = (deg * Math.PI) / 180;
    return {
      x: Math.round(Math.sin(rad) * radius),
      z: Math.round(centreZ - Math.cos(rad) * radius),
      rotateY: Math.round(-deg) || 0,
    };
  });
}
