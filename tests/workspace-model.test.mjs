import test from "node:test";
import assert from "node:assert/strict";
import {
  actionBucket,
  aggregateApplications,
  applicationHealthIssues,
  applicationDate,
  buildActionItems,
  calendarEventType,
  currentProgress,
  dateKey,
  expandMonthDay,
  isArchivedApplication,
  isApplicationNode,
  isTerminalApplication,
  lastActivityDate,
  nextNode,
  nextActionSummary,
  normalizePriority,
  preserveUnchangedExplicitValue,
  removeTimelineNode,
  scheduleNodes,
  stageFor,
  statusLabel,
  suggestedProgress,
  suggestedProgressDetail,
  updateApplicationRecord,
  upsertTimelineNode,
  waitingDays,
} from "../src/workspace-model.js";

const company = {
  id: "role-1",
  status: "进行中",
  timeline: [
    { type: "投递", date: "2026-07-21" },
    { type: "一面", date: "2026-08-05" },
    { type: "二面", date: "2026-08-20" },
  ],
};

test("application date uses the earliest application node instead of the latest event", () => {
  assert.equal(applicationDate(company), "2026-07-21");
});

test("preparation notes mentioning application are not treated as application facts", () => {
  const preparation = { type: "自定义", title: "准备投递材料", date: "2026-08-01" };
  assert.equal(isApplicationNode(preparation), false);
  assert.equal(applicationDate({ timeline: [preparation] }, "2026-08-12"), "");
});

test("future nodes do not advance current progress", () => {
  assert.equal(currentProgress(company, "2026-08-12"), "一面");
  assert.equal(stageFor(company, {}, "2026-08-12"), "interview");
  assert.equal(nextNode(company, "2026-08-12").type, "二面");
});

test("an explicit progress remains authoritative when the timeline is incomplete", () => {
  const partial = { status: "进行中", progress: "一面", timeline: [{ type: "投递", date: "2026-07-21" }, { type: "二面", date: "2026-08-20" }] };
  assert.equal(currentProgress(partial, "2026-08-12"), "一面");
  assert.equal(stageFor(partial, {}, "2026-08-12"), "interview");
});

test("an explicit progress remains authoritative when an occurred timeline node is further ahead", () => {
  const partial = { status: "进行中", progress: "一面", timeline: [{ type: "二面", date: "2026-08-10" }] };
  assert.equal(currentProgress(partial, "2026-08-12"), "一面");
  assert.equal(partial.progress, "一面");
});

test("an explicit next action is not hidden by a later planned node", () => {
  const partial = { nextAction: "准备二面", nextActionDeadline: "2026-08-13", timeline: [{ type: "二面", date: "2026-08-20" }] };
  assert.deepEqual(nextActionSummary(partial, "2026-08-12"), { label: "准备二面", date: "2026-08-13", time: "" });
});

test("closed applications do not surface a stale same-day node as the next action", () => {
  const closed = { status: "已挂", timeline: [{ type: "结束", date: "2026-08-12" }] };
  assert.deepEqual(nextActionSummary(closed, "2026-08-12"), { label: "无需跟进", date: "", time: "" });
});

test("terminal applications ignore stale explicit actions and are archived by default", () => {
  const closed = { status: "已拒绝", nextAction: "催问结果", nextActionDeadline: "2026-08-01" };
  assert.equal(isTerminalApplication(closed), true);
  assert.equal(isArchivedApplication(closed), true);
  assert.deepEqual(nextActionSummary(closed, "2026-08-12"), { label: "无需跟进", date: "", time: "" });
  assert.equal(isTerminalApplication({ status: "无消息", progress: "一面" }), false);
  assert.equal(isArchivedApplication({ status: "进行中", archived: true }), true);
  assert.equal(isTerminalApplication({ status: "进行中", progress: "签约/入职" }), true);
});

test("explicit terminal and offer statuses take precedence", () => {
  assert.equal(stageFor({ status: "已拒绝", timeline: [] }, {}), "closed");
  assert.equal(stageFor({ status: "Offer", timeline: [] }, {}), "offer");
  assert.equal(statusLabel({ status: "" }), "待投递");
});

test("an unchanged displayed fallback does not populate a missing explicit field", () => {
  assert.equal(preserveUnchangedExplicitValue("", "待投递", "待投递"), "");
  assert.equal(preserveUnchangedExplicitValue(undefined, "未开始", "未开始"), undefined);
  assert.equal(preserveUnchangedExplicitValue("", "待投递", "已投递"), "已投递");
  assert.equal(preserveUnchangedExplicitValue("进行中", "进行中", "进行中"), "进行中");
});

test("calendar colors follow explicit event type, not personal titles", () => {
  assert.equal(calendarEventType({ type: "自定义", title: "准备二面" }), "other");
  assert.equal(calendarEventType({ type: "自定义", title: "Offer 复盘" }), "other");
  assert.equal(calendarEventType({ type: "自定义", title: "提交材料" }), "other");
  assert.equal(calendarEventType({ type: "一面", title: "准备复盘" }), "interview");
  assert.equal(calendarEventType({ type: "自定义", title: "准备二面", isAction: true }), "deadline");
});

test("a pending role with no occurred timeline remains in the wishlist stage", () => {
  assert.equal(stageFor({ status: "待投递", progress: "未开始", timeline: [] }, {}, "2026-08-12"), "wishlist");
});

test("personal actions and preparation notes never advance the application stage", () => {
  const personalNodes = [
    { type: "自定义", title: "准备二面", date: "2026-08-10" },
    { type: "自定义", title: "Offer复盘", date: "2026-08-10" },
    { type: "自定义", title: "准备投递材料", date: "2026-08-10" },
    { type: "准备二面", date: "2026-08-10" },
    { type: "Offer复盘", date: "2026-08-10" },
    { type: "准备投递材料", date: "2026-08-10" },
    { type: "拒绝复盘", date: "2026-08-10" },
    { type: "二面", title: "准备二面", date: "2026-08-10", isAction: true },
    { type: "已拒绝", date: "2026-08-10", isAction: true },
  ];

  for (const node of personalNodes) {
    assert.equal(
      stageFor({ status: "待投递", progress: "未开始", timeline: [node] }, {}, "2026-08-12"),
      "wishlist",
      `${node.title || node.type} must not become recruitment evidence`,
    );
  }
});

test("a later personal note does not hide an occurred recruitment stage", () => {
  const role = {
    status: "进行中",
    timeline: [
      { type: "一面", date: "2026-08-08" },
      { type: "自定义", title: "Offer复盘", date: "2026-08-10" },
    ],
  };

  assert.equal(stageFor(role, {}, "2026-08-12"), "interview");
});

test("a recruitment node title cannot promote its explicit type to another stage", () => {
  const role = {
    status: "进行中",
    progress: "已投递",
    timeline: [{ type: "一面", title: "Offer 复盘", date: "2026-08-10" }],
  };

  assert.equal(stageFor(role, {}, "2026-08-12"), "interview");
});

test("a real terminal node still closes the stage after personal nodes are filtered", () => {
  assert.equal(
    stageFor({ status: "进行中", timeline: [{ type: "已拒绝", date: "2026-08-10" }] }, {}, "2026-08-12"),
    "closed",
  );
});

test("priority is constrained to the five-point scale", () => {
  assert.equal(normalizePriority("5"), 5);
  assert.equal(normalizePriority(0), 3);
  assert.equal(normalizePriority("not-a-score"), 3);
});

test("dateKey rejects invalid values and formats real dates", () => {
  assert.equal(dateKey("invalid"), "");
  assert.equal(dateKey(new Date(2026, 7, 12)), "2026-08-12");
});

test("month-day input validates real dates and preserves the original year", () => {
  assert.equal(expandMonthDay("08-03", "2026-07-01", 2027), "2026-08-03");
  assert.equal(expandMonthDay("19-39", "", 2026), "");
  assert.equal(expandMonthDay("02-30", "", 2026), "");
});

test("table edits update shared fields without replacing role details or explicit fallbacks", () => {
  const source = {
    id: "role-1",
    name: "原公司",
    role: "原岗位",
    team: "保留团队",
    status: "",
    progress: "",
    lastActivityAt: "2026-08-01",
    jd: "保留 JD",
    jdImage: "/api/assets/jd.png",
    notes: "保留备注",
    files: [{ id: "resume" }],
    customField: { keep: true },
    timeline: [
      { id: "apply", type: "投递", date: "2026-08-01", note: "保留节点备注" },
      { id: "interview", type: "一面", date: "2026-08-10" },
    ],
  };
  const original = structuredClone(source);
  const result = updateApplicationRecord(source, {
    name: "新公司",
    role: "新岗位",
    location: "上海",
    track: "互联网",
    channel: "内推",
    batch: "正式批",
    appliedAt: "08-03",
    status: "待投递",
    progress: "一面",
    nextAction: "准备终面",
    nextActionDeadline: "2026-08-20",
    priority: "5",
    jobUrl: "https://example.com/job",
  }, "2026-08-12", "new-application");

  assert.equal(result.error, "");
  assert.equal(result.company.name, "新公司");
  assert.equal(result.company.role, "新岗位");
  assert.equal(result.company.status, "");
  assert.equal(result.company.progress, "");
  assert.equal(result.company.lastActivityAt, "2026-08-01");
  assert.equal(result.company.priority, 5);
  assert.equal(result.company.jd, "保留 JD");
  assert.equal(result.company.jdImage, "/api/assets/jd.png");
  assert.equal(result.company.notes, "保留备注");
  assert.deepEqual(result.company.files, [{ id: "resume" }]);
  assert.deepEqual(result.company.customField, { keep: true });
  assert.deepEqual(result.company.timeline, [
    { id: "apply", type: "投递", date: "2026-08-03", note: "保留节点备注" },
    { id: "interview", type: "一面", date: "2026-08-10" },
  ]);
  assert.deepEqual(source, original);
});

test("table edits update activity only for real status or progress changes", () => {
  const source = {
    id: "role-1",
    name: "示例公司",
    role: "产品经理",
    status: "已投递",
    progress: "已投递",
    lastActivityAt: "2026-08-01",
    timeline: [{ id: "apply", type: "投递", date: "2026-08-01" }],
  };
  const result = updateApplicationRecord(source, {
    appliedAt: "08-01",
    status: "进行中",
    progress: "一面",
  }, "2026-08-12", "new-application");

  assert.equal(result.company.status, "进行中");
  assert.equal(result.company.progress, "一面");
  assert.equal(result.company.lastActivityAt, "2026-08-12");
});

test("table edits keep future applications as plans and reject invalid dates", () => {
  const source = {
    id: "role-1",
    name: "示例公司",
    role: "产品经理",
    status: "待投递",
    progress: "未开始",
    timeline: [{ id: "prepare", type: "自定义", title: "准备材料", date: "2026-08-15" }],
  };
  const planned = updateApplicationRecord(source, { appliedAt: "08-20" }, "2026-08-12", "application-plan");
  assert.equal(planned.error, "");
  assert.equal(planned.company.appliedAt, "");
  assert.deepEqual(planned.company.timeline, [
    { id: "prepare", type: "自定义", title: "准备材料", date: "2026-08-15" },
    { id: "application-plan", type: "投递", title: "", date: "2026-08-20", time: "", note: "" },
  ]);

  const invalid = updateApplicationRecord(source, { appliedAt: "02-30" }, "2026-08-12", "invalid-plan");
  assert.equal(invalid.error, "投递时间无效，请按月-日填写");
  assert.equal(invalid.company, source);
});

test("timeline nodes can be added on the same day without replacing each other", () => {
  const roles = [{ id: "role-a", timeline: [{ id: "node-1", type: "一面", date: "2026-08-20", time: "10:00" }] }];
  const updated = upsertTimelineNode(roles, "role-a", "role-a", { id: "node-2", type: "二面", date: "2026-08-20", time: "15:00" });
  assert.equal(updated[0].timeline.length, 2);
  assert.equal(roles[0].timeline.length, 1);
});

test("editing a timeline node can move it between roles without leaving a duplicate", () => {
  const roles = [
    { id: "role-a", appliedAt: "2026-08-01", timeline: [{ id: "node-1", type: "投递", date: "2026-08-01" }] },
    { id: "role-b", appliedAt: "", timeline: [] },
  ];
  const moved = upsertTimelineNode(roles, "role-b", "role-a", { id: "node-1", type: "投递", date: "2026-08-02" });
  assert.equal(moved[0].timeline.length, 0);
  assert.equal(moved[0].appliedAt, "");
  assert.deepEqual(moved[1].timeline.map((node) => node.id), ["node-1"]);
  assert.equal(moved[1].appliedAt, "2026-08-02");
});

test("deleting an application node recalculates the application date", () => {
  const roles = [{ id: "role-a", appliedAt: "2026-08-01", timeline: [
    { id: "node-1", type: "投递", date: "2026-08-01" },
    { id: "node-2", type: "网申", date: "2026-08-03" },
  ] }];
  const updated = removeTimelineNode(roles, "role-a", "node-1");
  assert.equal(updated[0].appliedAt, "2026-08-03");
  assert.deepEqual(updated[0].timeline.map((node) => node.id), ["node-2"]);
});

test("a future application plan is not persisted or aggregated as an occurred application", () => {
  const roles = [{ id: "planned", track: "互联网", status: "待投递", progress: "未开始", timeline: [] }];
  const updated = upsertTimelineNode(roles, "planned", "planned", {
    id: "future-application",
    type: "投递",
    date: "2026-08-20",
  }, "2026-08-12");

  assert.equal(updated[0].appliedAt || "", "");
  assert.equal(applicationDate(updated[0], "2026-08-12"), "");
  assert.deepEqual(aggregateApplications(updated, "track", "2026-08-12"), []);
  assert.equal(applicationDate(updated[0], "2026-08-20"), "2026-08-20");
});

test("an explicit applied status is preserved but a future application date is flagged", () => {
  const role = {
    status: "已投递",
    progress: "已投递",
    timeline: [{ id: "future", type: "投递", date: "2026-08-20" }],
  };

  assert.equal(stageFor(role, {}, "2026-08-12"), "applied");
  assert.equal(applicationDate(role, "2026-08-12"), "");
  assert.equal(
    applicationHealthIssues(role, "2026-08-12").some((issue) => issue.code === "future-application-status-conflict"),
    true,
  );
});

test("adding a future application plan preserves an existing occurred application date", () => {
  const roles = [{ id: "applied", appliedAt: "2026-08-01", timeline: [] }];
  const updated = upsertTimelineNode(roles, "applied", "applied", {
    id: "future-application",
    type: "投递",
    date: "2026-08-20",
  }, "2026-08-12");

  assert.equal(updated[0].appliedAt, "2026-08-01");
  assert.equal(applicationDate(updated[0], "2026-08-12"), "2026-08-01");
});

test("editing an unrelated node preserves a legacy future explicit application date", () => {
  const roles = [{ id: "legacy", appliedAt: "2026-08-20", timeline: [] }];
  const updated = upsertTimelineNode(roles, "legacy", "legacy", {
    id: "prep",
    type: "自定义",
    title: "准备材料",
    date: "2026-08-13",
  }, "2026-08-12");

  assert.equal(updated[0].appliedAt, "2026-08-20");
  assert.equal(applicationDate(updated[0], "2026-08-12"), "");
});

test("action items merge deadlines and timeline nodes, bucket them, and remove duplicates", () => {
  const roles = [
    { id: "overdue", name: "甲公司", role: "产品", status: "进行中", priority: 5, nextAction: "提交材料", nextActionDeadline: "2026-08-11", timeline: [{ id: "past", type: "投递", date: "2026-08-01" }] },
    { id: "today", name: "乙公司", role: "运营", status: "进行中", nextAction: "一面", nextActionDeadline: "2026-08-12", timeline: [{ id: "same", type: "一面", date: "2026-08-12", time: "10:00" }] },
    { id: "soon", name: "丙公司", role: "开发", status: "进行中", timeline: [{ id: "soon-node", type: "测评", date: "2026-08-15" }] },
    { id: "later", name: "丁公司", role: "设计", status: "进行中", nextAction: "准备作品集", timeline: [{ id: "later-node", type: "二面", date: "2026-08-16" }, { id: "note", type: "自定义", title: "私人备注", kind: "note", date: "2026-08-13" }] },
    { id: "closed", name: "结束公司", role: "测试", status: "已挂", nextAction: "无效任务", nextActionDeadline: "2026-08-10", timeline: [{ type: "二面", date: "2026-08-14" }] },
  ];
  const items = buildActionItems(roles, "2026-08-12");
  assert.deepEqual(items.map((item) => item.bucket), ["overdue", "today", "soon", "later", "later"]);
  assert.deepEqual(items.map((item) => item.companyId), ["overdue", "today", "soon", "later", "later"]);
  assert.equal(items.filter((item) => item.companyId === "today").length, 1);
  assert.deepEqual(items.find((item) => item.companyId === "today").sources, ["explicit", "timeline"]);
  assert.equal(items.find((item) => item.companyId === "today").time, "10:00");
  assert.equal(items.some((item) => item.companyId === "closed"), false);
  assert.equal(actionBucket("2026-08-15", "2026-08-12"), "soon");
  assert.equal(actionBucket("", "2026-08-12"), "later");
});

test("same-label timeline events at different times remain distinct", () => {
  const items = buildActionItems([{ id: "role", status: "进行中", timeline: [
    { id: "am", type: "沟通", date: "2026-08-13", time: "10:00" },
    { id: "pm", type: "沟通", date: "2026-08-13", time: "15:00" },
  ] }], "2026-08-12");
  assert.deepEqual(items.map((item) => item.time), ["10:00", "15:00"]);
});

test("action deduplication tolerates harmless label punctuation and keeps timeline time", () => {
  const items = buildActionItems([{
    id: "role",
    name: "示例公司",
    status: "进行中",
    nextAction: "准备 二面",
    nextActionDeadline: "2026-08-13",
    timeline: [{ id: "round-2", type: "自定义", title: "准备-二面", date: "2026-08-13", time: "14:30" }],
  }], "2026-08-12");

  assert.equal(items.length, 1);
  assert.equal(items[0].time, "14:30");
  assert.deepEqual(items[0].sources, ["explicit", "timeline"]);
  assert.equal(items[0].nodeId, "round-2");
});

test("actions with the same deadline are ordered by priority then company name", () => {
  const roles = [
    { id: "low", name: "C Company", status: "进行中", priority: 1, nextAction: "提交", nextActionDeadline: "2026-08-13" },
    { id: "high-b", name: "B Company", status: "进行中", priority: 5, nextAction: "提交", nextActionDeadline: "2026-08-13" },
    { id: "high-a", name: "A Company", status: "进行中", priority: 5, nextAction: "提交", nextActionDeadline: "2026-08-13" },
    { id: "archived", name: "Archived", status: "进行中", archived: true, priority: 5, nextAction: "不应出现", nextActionDeadline: "2026-08-12" },
  ];

  const items = buildActionItems(roles, "2026-08-12");
  assert.deepEqual(items.map((item) => item.companyId), ["high-a", "high-b", "low"]);
  assert.deepEqual(items.map((item) => item.daysUntil), [1, 1, 1]);
});

test("waiting time uses the latest occurred activity and ignores future plans", () => {
  const role = {
    appliedAt: "2026-08-01",
    lastActivityAt: "2026-08-09",
    timeline: [
      { type: "一面", date: "2026-08-10" },
      { type: "二面", date: "2026-08-20" },
    ],
  };
  assert.equal(lastActivityDate(role, "2026-08-12"), "2026-08-10");
  assert.equal(waitingDays(role, "2026-08-12"), 2);
  assert.equal(waitingDays({ timeline: [{ type: "一面", date: "2026-08-20" }] }, "2026-08-12"), null);
});

test("waiting time ignores internal edits, preparation items, and custom nodes", () => {
  const role = {
    appliedAt: "2026-08-01",
    priority: 5,
    nextAction: "继续准备二面",
    timeline: [
      { type: "一面", date: "2026-08-05" },
      { type: "自定义", title: "记录面试感受", date: "2026-08-09" },
      { type: "准备二面", date: "2026-08-10" },
    ],
  };

  assert.equal(lastActivityDate(role, "2026-08-12"), "2026-08-05");
  assert.equal(waitingDays(role, "2026-08-12"), 7);
});

test("waiting time accepts lastActivityAt when status or progress really changed", () => {
  const role = {
    appliedAt: "2026-08-01",
    status: "进行中",
    progress: "二面",
    lastActivityAt: "2026-08-12",
    timeline: [{ type: "一面", date: "2026-08-05" }],
  };

  assert.equal(lastActivityDate(role, "2026-08-12"), "2026-08-12");
  assert.equal(waitingDays(role, "2026-08-12"), 0);
});

test("suggested progress reflects the furthest completed timeline stage", () => {
  const role = { timeline: [
    { type: "二面", date: "2026-08-10" },
    { type: "自定义", title: "补充备注", date: "2026-08-11" },
    { type: "终面", date: "2026-08-20" },
  ] };
  assert.equal(suggestedProgress(role, "2026-08-12"), "二面");
  assert.equal(suggestedProgress(role, "invalid"), "");
});

test("progress suggestions expose the occurred node used as evidence", () => {
  const role = { timeline: [
    { id: "future", type: "二面", date: "2026-08-20" },
    { id: "occurred", type: "一面", date: "2026-08-10" },
  ] };

  assert.deepEqual(suggestedProgressDetail(role, "2026-08-12"), {
    label: "一面",
    rank: 40,
    date: "2026-08-10",
    nodeId: "occurred",
  });
});

test("custom plans and cancelled interviews never become progress evidence", () => {
  const role = { timeline: [
    { id: "prep", type: "自定义", title: "准备二面", date: "2026-08-10" },
    { id: "cancelled", type: "取消二面", date: "2026-08-11" },
  ] };

  assert.equal(suggestedProgress(role, "2026-08-12"), "");
  assert.equal(suggestedProgressDetail(role, "2026-08-12"), null);
});

test("data health reports overdue, missing action, and state alignment problems", () => {
  const issues = applicationHealthIssues({
    status: "待投递",
    progress: "简历筛选",
    nextActionDeadline: "2026-08-10",
    timeline: [{ type: "投递", date: "2026-08-01" }, { type: "一面", date: "2026-08-11" }],
  }, "2026-08-12");
  assert.equal(issues[0].code, "overdue-deadline");
  assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set([
    "overdue-deadline",
    "status-timeline-conflict",
    "progress-timeline-conflict",
    "deadline-without-action",
    "missing-next-action",
  ]));
  assert.deepEqual(
    {
      progress: issues.find((issue) => issue.code === "progress-timeline-conflict").suggestedProgress,
      date: issues.find((issue) => issue.code === "progress-timeline-conflict").suggestedNodeDate,
    },
    { progress: "一面", date: "2026-08-11" },
  );
});

test("personal terminal wording does not create a false status conflict", () => {
  const issues = applicationHealthIssues({
    status: "进行中",
    progress: "已投递",
    timeline: [{ type: "自定义", title: "拒绝复盘", date: "2026-08-10" }],
  }, "2026-08-12");

  assert.equal(issues.some((issue) => issue.code === "status-timeline-conflict"), false);
});

test("terminal roles report stale actions without creating overdue or missing-action noise", () => {
  const issues = applicationHealthIssues({
    status: "已拒绝",
    nextAction: "继续准备",
    nextActionDeadline: "2026-08-01",
    timeline: [{ type: "二面", date: "2026-08-20" }],
  }, "2026-08-12");
  assert.deepEqual(issues.map((issue) => issue.code), ["terminal-has-action"]);
  assert.deepEqual(applicationHealthIssues({ status: "已挂", timeline: [{ type: "结束", date: "2026-08-12" }] }, "2026-08-12"), []);
});

test("schedule keeps history but hides future events for ended roles", () => {
  const ended = {
    id: "ended",
    status: "已拒绝",
    nextAction: "继续跟进",
    nextActionDeadline: "2026-08-20",
    timeline: [
      { id: "past", type: "一面", date: "2026-08-10" },
      { id: "future", type: "二面", date: "2026-08-20" },
    ],
  };
  assert.deepEqual(scheduleNodes(ended, "2026-08-12").map((node) => node.id), ["past"]);
  assert.deepEqual(scheduleNodes({ ...ended, status: "进行中", nextAction: "", nextActionDeadline: "" }, "2026-08-12").map((node) => node.id), ["past", "future"]);
});

test("schedule uses the same harmless punctuation deduplication as the action center", () => {
  const role = {
    id: "active",
    status: "进行中",
    nextAction: "准备-二面",
    nextActionDeadline: "2026-08-20",
    timeline: [{ id: "interview", type: "自定义", title: "准备 二面", date: "2026-08-20" }],
  };
  assert.deepEqual(scheduleNodes(role, "2026-08-12").map((node) => node.id), ["interview"]);
});

test("track aggregation exposes useful outcomes and median waiting time", () => {
  const roles = [
    { id: "a", track: "互联网", status: "进行中", progress: "一面", timeline: [{ type: "一面", date: "2026-08-10" }] },
    { id: "b", track: "互联网", status: "已投递", progress: "已投递", timeline: [{ type: "投递", date: "2026-08-08" }] },
    { id: "c", track: "互联网", status: "已拒绝", progress: "测评", timeline: [{ type: "测评", date: "2026-08-09" }] },
    { id: "d", track: "", status: "Offer", progress: "Offer", timeline: [{ type: "Offer", date: "2026-08-12" }] },
  ];
  assert.deepEqual(aggregateApplications(roles, "track", "2026-08-12"), [
    { value: "互联网", total: 3, active: 2, responded: 2, interviews: 1, offers: 0, closed: 1, medianWaitingDays: 3 },
    { value: "赛道未注明", total: 1, active: 1, responded: 1, interviews: 0, offers: 1, closed: 0, medianWaitingDays: 0 },
  ]);
});

test("personal timeline actions do not inflate interview or offer analytics", () => {
  const roles = [
    { id: "prep-interview", track: "互联网", status: "已投递", progress: "已投递", appliedAt: "2026-08-01", timeline: [{ type: "自定义", title: "准备二面", date: "2026-08-10" }] },
    { id: "offer-review", track: "互联网", status: "已投递", progress: "已投递", appliedAt: "2026-08-01", timeline: [{ type: "自定义", title: "Offer复盘", date: "2026-08-10" }] },
    { id: "application-materials", track: "互联网", status: "已投递", progress: "已投递", appliedAt: "2026-08-01", timeline: [{ type: "自定义", title: "准备投递材料", date: "2026-08-10" }] },
    { id: "action-node", track: "互联网", status: "已投递", progress: "已投递", appliedAt: "2026-08-01", timeline: [{ type: "二面", title: "准备二面", date: "2026-08-10", isAction: true }] },
    { id: "typed-review", track: "互联网", status: "已投递", progress: "已投递", appliedAt: "2026-08-01", timeline: [{ type: "Offer复盘", date: "2026-08-10" }] },
  ];

  assert.deepEqual(aggregateApplications(roles, "track", "2026-08-12"), [
    { value: "互联网", total: 5, active: 5, responded: 0, interviews: 0, offers: 0, closed: 0, medianWaitingDays: 11 },
  ]);
});

test("signed and onboarded applications count as having received an offer", () => {
  const roles = [
    { id: "signed", track: "互联网", status: "已结束", progress: "签约", timeline: [{ type: "签约", date: "2026-08-10" }] },
    { id: "onboarded", track: "互联网", status: "已结束", progress: "入职", timeline: [{ type: "入职", date: "2026-08-11" }] },
  ];

  assert.deepEqual(aggregateApplications(roles, "track", "2026-08-12"), [
    { value: "互联网", total: 2, active: 0, responded: 2, interviews: 0, offers: 2, closed: 2, medianWaitingDays: null },
  ]);
});

test("signed and onboarded progress is terminal even without a separate closed status", () => {
  assert.equal(stageFor({ status: "进行中", progress: "签约", timeline: [] }, {}, "2026-08-12"), "closed");
  assert.equal(stageFor({ status: "进行中", progress: "入职", timeline: [] }, {}, "2026-08-12"), "closed");
});

test("channel aggregation ignores future progress and uses only active roles for waiting median", () => {
  const roles = [
    { id: "a", channel: "官网", status: "进行中", appliedAt: "2026-08-09", timeline: [{ type: "一面", date: "2026-08-20" }] },
    { id: "b", channel: "官网", status: "进行中", appliedAt: "2026-08-11", timeline: [] },
    { id: "c", channel: "官网", status: "已拒绝", appliedAt: "2026-07-01", timeline: [{ type: "一面", date: "2026-07-10" }] },
    { id: "d", channel: "", status: "进行中", appliedAt: "2026-08-12", timeline: [] },
  ];

  assert.deepEqual(aggregateApplications(roles, "channel", "2026-08-12"), [
    { value: "官网", total: 3, active: 2, responded: 1, interviews: 1, offers: 0, closed: 1, medianWaitingDays: 2 },
    { value: "渠道未注明", total: 1, active: 1, responded: 0, interviews: 0, offers: 0, closed: 0, medianWaitingDays: 0 },
  ]);
});
