import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTask,
  pullRef,
  checkRunsApiUrl,
  commentApiUrl,
  checkSummary,
  agentComment,
  parseCommand,
  findTask,
  emptyState,
  addTask,
  updateTask,
  applyCommand,
  normaliseRepo,
  pullToTask,
  agentForPull,
  mergePulls,
  agentSummary,
  overallProgress,
  issueUrl,
  taskBrief,
  loadState,
  deskLayout,
  statusFromWord,
} from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 24, 12);

function run(state, line) {
  return applyCommand(state, parseCommand(line, state.agents), NOW);
}

test("typed shorthand: @agent, #tag and ! are pulled out of the title", () => {
  assert.deepEqual(parseTask("fix login redirect @builder #auth !"), {
    title: "Fix login redirect",
    agent: "Builder",
    tags: ["auth"],
    priority: "high",
  });
});

test("spoken 'for <agent>' assigns only when the agent exists", () => {
  assert.equal(parseTask("fix the login bug for scout").agent, "Scout");
  assert.equal(parseTask("fix the login bug for scout").title, "Fix the login bug");
  const p = parseTask("write docs for users");
  assert.equal(p.agent, null);
  assert.equal(p.title, "Write docs for users");
});

test("spoken priority words set high priority and leave the title clean", () => {
  const p = parseTask("rotate the deploy key, urgent");
  assert.equal(p.priority, "high");
  assert.equal(p.title, "Rotate the deploy key");
});

test("an unknown @name becomes a new agent", () => {
  let state = emptyState();
  ({ state } = run(state, "triage flaky test @nova"));
  assert.ok(state.agents.includes("Nova"));
  assert.equal(state.tasks[0].agent, "Nova");
});

test("voice-style add prefixes are stripped", () => {
  for (const line of ["add task: tidy readme", "Add a new task to tidy readme", "new task tidy readme", "task: tidy readme"]) {
    const c = parseCommand(line);
    assert.equal(c.kind, "add", line);
    assert.equal(c.task.title, "Tidy readme", line);
  }
});

test("move, mark, start, finish, assign and delete commands", () => {
  let state = emptyState();
  ({ state } = run(state, "Login page broken"));
  ({ state } = run(state, "Update changelog"));
  assert.equal(run(state, "start 1").state.tasks[0].status, "doing");
  assert.equal(run(state, "move login to review").state.tasks[0].status, "review");
  assert.equal(run(state, "move task two to in progress").state.tasks[1].status, "doing");
  assert.equal(run(state, "mark changelog done").state.tasks[1].status, "done");
  assert.equal(run(state, "finish #2").state.tasks[1].progress, 100);
  assert.equal(run(state, "assign 1 to reviewer").state.tasks[0].agent, "Reviewer");
  assert.equal(run(state, "delete 2").state.tasks.length, 1);
});

test("a sentence that only looks like a move is a new task", () => {
  const c = parseCommand("move the database to postgres");
  assert.equal(c.kind, "add");
  assert.equal(c.task.title, "Move the database to postgres");
});

test("an ambiguous reference moves nothing", () => {
  let state = emptyState();
  ({ state } = run(state, "Fix login"));
  ({ state } = run(state, "Fix logout"));
  const r = run(state, "start fix");
  assert.equal(r.state, state);
  assert.match(r.message, /No single task/);
  assert.equal(findTask(state.tasks, "logout").num, 2);
});

test("add agent command", () => {
  let state = emptyState();
  const r = run(state, "add agent called Atlas");
  assert.ok(r.state.agents.includes("Atlas"));
  assert.match(run(r.state, "hire agent atlas").message, /already/);
});

test("progress follows status unless set by hand, and 100% means done", () => {
  let { state, task } = addTask(emptyState(), { title: "x" }, NOW);
  assert.equal(task.progress, 0);
  state = updateTask(state, task.id, { status: "doing" }, NOW);
  assert.equal(state.tasks[0].progress, 40);
  state = updateTask(state, task.id, { progress: 65 }, NOW);
  assert.equal(state.tasks[0].progress, 65);
  state = updateTask(state, task.id, { progress: 140 }, NOW);
  assert.equal(state.tasks[0].progress, 100);
  assert.equal(state.tasks[0].status, "done");
});

test("statusFromWord", () => {
  assert.equal(statusFromWord("In Progress"), "doing");
  assert.equal(statusFromWord("merged."), "done");
  assert.equal(statusFromWord("postgres"), null);
});

test("normaliseRepo accepts URLs and owner/repo, rejects the rest", () => {
  assert.equal(normaliseRepo("https://github.com/duncan-haywood/oss-monorepo/pulls"), "duncan-haywood/oss-monorepo");
  assert.equal(normaliseRepo("a/b.git"), "a/b");
  assert.equal(normaliseRepo("not a repo"), null);
  assert.equal(normaliseRepo("https://evil.example/a/b"), null);
});

const pr = (over) => ({
  number: 7,
  title: "Add dark mode",
  state: "open",
  draft: false,
  merged_at: null,
  html_url: "https://github.com/a/b/pull/7",
  head: { ref: "claude/dark-mode-x1" },
  user: { login: "someone" },
  ...over,
});

test("pull requests map to statuses and agents", () => {
  assert.equal(pullToTask(pr({ draft: true }), "a/b").status, "doing");
  assert.equal(pullToTask(pr(), "a/b").status, "review");
  assert.equal(pullToTask(pr({ state: "closed", merged_at: "2026-10-01T00:00:00Z" }), "a/b").status, "done");
  assert.equal(pullToTask(pr({ state: "closed" }), "a/b"), null);
  assert.equal(agentForPull(pr()), "Claude");
  assert.equal(agentForPull(pr({ head: { ref: "feature/x" } })), "someone");
  assert.equal(agentForPull(pr({ head: { ref: "fix" }, user: { login: "dependabot[bot]" } })), "Dependabot");
});

test("mergePulls upserts by id and keeps local numbering", () => {
  let state = run(emptyState(), "local task").state;
  let r = mergePulls(state, [pr({ draft: true }), pr({ number: 8, state: "closed" })], "a/b", NOW);
  assert.equal(r.added, 1);
  assert.equal(r.state.repo, "a/b");
  assert.equal(r.state.tasks[1].num, 2);
  assert.ok(r.state.agents.includes("Claude"));
  r = mergePulls(r.state, [pr()], "a/b", NOW);
  assert.equal(r.added, 0);
  assert.equal(r.changed, 1);
  assert.equal(r.state.tasks[1].status, "review");
  assert.equal(r.state.tasks.length, 2);
});

test("agentSummary picks the in-progress task as current", () => {
  let state = emptyState();
  ({ state } = run(state, "a @Scout"));
  ({ state } = run(state, "b @Scout"));
  ({ state } = run(state, "start b"));
  const scout = agentSummary(state).find((a) => a.name === "Scout");
  assert.equal(scout.total, 2);
  assert.equal(scout.current.title, "B");
  assert.equal(scout.progress, 20);
  assert.equal(overallProgress(state), 20);
  assert.equal(overallProgress(emptyState()), 0);
});

test("issueUrl prefills GitHub's new-issue form", () => {
  const { task } = addTask(emptyState(), { title: "Ship it", agent: "Scout", tags: ["x"], priority: "high" }, NOW);
  const url = new URL(issueUrl("a/b", task));
  assert.equal(url.origin + url.pathname, "https://github.com/a/b/issues/new");
  assert.equal(url.searchParams.get("title"), "Ship it");
  assert.match(url.searchParams.get("body"), /Suggested agent: Scout\nTags: #x\nPriority: high\n\n_Drafted/);
  assert.match(taskBrief(task), /^Task 1: Ship it\nPriority: high\./);
});

test("loadState survives junk and repairs numbering", () => {
  assert.deepEqual(loadState("{nope"), emptyState());
  assert.deepEqual(loadState({ tasks: "x" }), emptyState());
  const s = loadState({
    agents: ["Scout", 3],
    nextNum: 1,
    repo: "javascript:alert(1)",
    tasks: [
      { title: "ok", num: 4, status: "doing", agent: "Mira", url: "javascript:alert(1)" },
      { title: "dup num", num: 4, progress: "lots" },
      { title: "" },
      null,
    ],
  });
  assert.deepEqual(s.agents, ["Scout", "Mira"]);
  assert.deepEqual(s.tasks.map((t) => t.num), [4, 5]);
  assert.equal(s.tasks[0].url, null);
  assert.equal(s.tasks[1].progress, 0);
  assert.equal(s.nextNum, 6);
  assert.equal(s.repo, "");
  assert.deepEqual(loadState(JSON.stringify(s)), s);
});

test("deskLayout spreads desks symmetrically on an arc", () => {
  assert.deepEqual(deskLayout(0), []);
  assert.deepEqual(deskLayout(1), [{ x: 0, z: -140, rotateY: 0 }]);
  const five = deskLayout(5);
  assert.equal(five.length, 5);
  assert.equal(five[0].x, -five[4].x);
  assert.equal(five[2].x, 0);
  const many = deskLayout(30);
  assert.ok(many.every((d) => Math.abs(d.x) <= 560));
});

test("'for <agent>' still assigns when a priority word follows it", () => {
  const p = parseTask("ship the workroom for Scout urgent");
  assert.deepEqual([p.title, p.agent, p.priority], ["Ship the workroom", "Scout", "high"]);
});

test("hands-free commands parse, and near-misses stay tasks", () => {
  const agents = ["Scout", "Builder", "Claude"];
  const kind = (line) => parseCommand(line, agents);
  assert.equal(kind("refresh").kind, "sync");
  assert.equal(kind("check CI").kind, "sync");
  assert.equal(kind("Sync from GitHub.").kind, "sync");
  assert.equal(kind("what can I say?").kind, "help");
  assert.equal(kind("confirm").kind, "confirm");
  assert.equal(kind("send it").kind, "confirm");
  assert.equal(kind("never mind").kind, "cancel");
  assert.deepEqual(kind("go to the board").target, { kind: "board" });
  assert.deepEqual(kind("take me to Builder's desk").target, { kind: "desk", agent: "Builder" });
  assert.deepEqual(kind("look at claude").target, { kind: "desk", agent: "Claude" });
  assert.deepEqual(kind("recenter").target, { kind: "home" });
  assert.deepEqual(kind("select task three"), { kind: "select", ref: "three" });
  // "go"/"show" + something that is not a place or a number is a task title.
  assert.equal(kind("go through the onboarding copy").kind, "add");
  assert.equal(kind("show errors on the form").kind, "add");
});

test("ask commands name a known or mentionable agent, a task and the request", () => {
  const agents = ["Scout", "Claude"];
  assert.deepEqual(parseCommand("ask claude on 3 to add tests", agents), { kind: "ask", agent: "Claude", ref: "3", text: "add tests" });
  assert.deepEqual(parseCommand("Tell Copilot about task four, rebase onto main", ["Scout"]), {
    kind: "ask", agent: "Copilot", ref: "four", text: "rebase onto main",
  });
  assert.deepEqual(parseCommand("ask Scout to look at the flaky test", agents), { kind: "ask", agent: "Scout", ref: null, text: "look at the flaky test" });
  // An unknown name is not an agent, so this stays a task.
  assert.equal(parseCommand("tell the team about lunch", agents).kind, "add");
});

test("page commands leave the board alone", () => {
  const s = emptyState();
  for (const line of ["refresh", "go to the board", "confirm", "ask claude to fix it"]) {
    const r = applyCommand(s, parseCommand(line, ["Claude"]));
    assert.equal(r.state, s);
    assert.equal(r.page, true);
  }
});

test("pull requests keep their head sha and a pull reference", () => {
  const pr = { number: 9, state: "open", draft: false, title: "T", head: { ref: "claude/x", sha: "abc1234def" }, user: { login: "u" } };
  const { state } = mergePulls(emptyState(), [pr], "a/b");
  const t = state.tasks[0];
  assert.equal(t.sha, "abc1234def");
  assert.deepEqual(pullRef(t), { repo: "a/b", number: 9 });
  assert.equal(pullRef({ id: "t1", source: "local" }), null);
  const moved = mergePulls(state, [{ ...pr, head: { ...pr.head, sha: "fff0000aaa" } }], "a/b");
  assert.equal(moved.changed, 1);
  assert.equal(moved.state.tasks[0].sha, "fff0000aaa");
  assert.equal(loadState(JSON.stringify({ tasks: [{ title: "x", sha: "not a sha" }] })).tasks[0].sha, null);
  assert.equal(checkRunsApiUrl("a/b", "abc1234"), "https://api.github.com/repos/a/b/commits/abc1234/check-runs?per_page=100");
  assert.equal(commentApiUrl("a/b", 9), "https://api.github.com/repos/a/b/issues/9/comments");
});

test("checkSummary reduces check runs to one word", () => {
  assert.equal(checkSummary({}).state, "none");
  assert.equal(checkSummary({ check_runs: [{ status: "completed", conclusion: "success" }, { status: "completed", conclusion: "skipped" }] }).state, "passing");
  assert.equal(checkSummary({ check_runs: [{ status: "in_progress" }, { status: "completed", conclusion: "success" }] }).state, "running");
  const red = checkSummary({ check_runs: [{ status: "in_progress" }, { status: "completed", conclusion: "failure" }] });
  assert.deepEqual(red, { state: "failing", failed: 1, running: 1, total: 2 });
});

test("agentComment leads with the mention and refuses an empty request", () => {
  assert.equal(agentComment("Claude", "  add   tests "), "@claude add tests\n\n_Sent from Agent Workroom._");
  assert.equal(agentComment("Claude", " "), null);
});
