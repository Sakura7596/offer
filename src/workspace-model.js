export function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function expandMonthDay(value, existingValue = "", currentYear = new Date().getFullYear()) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = String(existingValue || "").match(/^(\d{4})-/)?.[1] || String(currentYear);
  const candidate = `${year}-${text}`;
  const date = new Date(`${candidate}T00:00:00`);
  return dateKey(date) === candidate ? candidate : "";
}

export function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function nodeName(node) {
  if (!node) return "尚无下一步";
  return node.type === "自定义" ? (node.title || "自定义节点") : node.type;
}

function isApplicationNode(node) {
  return /投递|网申/.test(`${node?.type || ""}${node?.title || ""}`);
}

function withTimeline(company, timeline, removedNode = null) {
  const appliedAt = [...timeline]
    .filter(isApplicationNode)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.date;
  return {
    ...company,
    timeline,
    appliedAt: appliedAt || (isApplicationNode(removedNode) ? "" : company.appliedAt),
  };
}

export function upsertTimelineNode(companies, targetCompanyId, originalCompanyId, node) {
  return companies.map((company) => {
    const isTarget = company.id === targetCompanyId;
    const isOriginal = Boolean(node.id) && company.id === (originalCompanyId || targetCompanyId);
    if (!isTarget && !isOriginal) return company;
    const removedNode = (company.timeline || []).find((item) => item.id === node.id);
    const timeline = [
      ...(company.timeline || []).filter((item) => item.id !== node.id),
      ...(isTarget ? [node] : []),
    ];
    return withTimeline(company, timeline, removedNode);
  });
}

export function removeTimelineNode(companies, companyId, nodeId) {
  return companies.map((company) => {
    if (company.id !== companyId) return company;
    const removedNode = (company.timeline || []).find((item) => item.id === nodeId);
    const timeline = (company.timeline || []).filter((item) => item.id !== nodeId);
    return withTimeline(company, timeline, removedNode);
  });
}

export function applicationDate(company) {
  return String(company?.appliedAt || "") || [...(company?.timeline || [])]
    .filter((node) => /投递|网申/.test(`${node.type || ""}${node.title || ""}`))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.date || "";
}

export function currentNode(company, today = dateKey(new Date())) {
  return [...(company?.timeline || [])]
    .filter((node) => node.date && node.date <= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) || null;
}

export function currentProgress(company, today = dateKey(new Date())) {
  const explicit = String(company?.progress || "").trim();
  if (explicit) return explicit;
  const node = currentNode(company, today);
  return node ? nodeName(node) : "未开始";
}

export function nextNode(company, today = dateKey(new Date())) {
  return [...(company?.timeline || [])]
    .filter((node) => node.date && node.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}

export function normalizePriority(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 3;
}

export function statusLabel(company) {
  return String(company?.status || "待投递").trim() || "待投递";
}

const TERMINAL_STATUS = /已拒绝|拒绝|已挂|淘汰|未通过|暂停|放弃|撤回|结束|已归档|入职|签约|hired|rejected|discarded|closed/i;
const TERMINAL_NODE = /拒绝|淘汰|未通过|已挂|放弃|撤回|结束|入职|签约|hired|rejected|discarded|closed/i;

function validDateKey(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00`);
  return dateKey(date) === text ? text : "";
}

function calendarDayNumber(value) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function calendarDayDifference(from, to) {
  const start = validDateKey(from);
  const end = validDateKey(to);
  return start && end ? calendarDayNumber(end) - calendarDayNumber(start) : null;
}

export function isTerminalApplication(company) {
  return TERMINAL_STATUS.test(`${statusLabel(company)} ${company?.progress || ""}`);
}

export function isArchivedApplication(company) {
  return company?.archived === true || Boolean(company?.archivedAt) || isTerminalApplication(company);
}

export function scheduleNodes(company, today = dateKey(new Date())) {
  const nodes = [...(company?.timeline || [])]
    .filter((node) => !isArchivedApplication(company) || !node.date || node.date <= today);
  const label = String(company?.nextAction || "").trim();
  const deadline = validDateKey(company?.nextActionDeadline);
  if (!isArchivedApplication(company) && label && deadline
    && !nodes.some((node) => node.date === deadline && normalizedActionLabel(nodeName(node)) === normalizedActionLabel(label))) {
    nodes.push({ id: `action-${company.id}`, date: deadline, type: "自定义", title: label, time: "", note: "下一步行动", isAction: true });
  }
  return nodes;
}

export function lastActivityDate(company, today = dateKey(new Date())) {
  const limit = validDateKey(today);
  if (!limit) return "";
  const candidates = [applicationDate(company), company?.lastActivityAt]
    .concat((company?.timeline || []).map((node) => node?.date))
    .map(validDateKey)
    .filter((date) => date && date <= limit)
    .sort((a, b) => a.localeCompare(b));
  return candidates.at(-1) || "";
}

export function waitingDays(company, today = dateKey(new Date())) {
  const lastActivity = lastActivityDate(company, today);
  const difference = calendarDayDifference(lastActivity, today);
  return difference === null ? null : Math.max(0, difference);
}

export function actionBucket(date, today = dateKey(new Date()), soonDays = 3) {
  const difference = calendarDayDifference(today, date);
  if (difference === null) return "later";
  if (difference < 0) return "overdue";
  if (difference === 0) return "today";
  return difference <= Math.max(0, Number(soonDays) || 0) ? "soon" : "later";
}

function normalizedActionLabel(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/[\s·，,。.!！?？:：/\\_-]+/g, "");
}

function actionSortValue(item) {
  return validDateKey(item.date) || "9999-12-31";
}

export function buildActionItems(companies, today = dateKey(new Date()), soonDays = 3) {
  const currentDay = validDateKey(today);
  if (!currentDay) return [];
  const candidates = [];

  for (const company of companies || []) {
    if (!company || isArchivedApplication(company)) continue;
    const common = {
      companyId: company.id,
      companyName: String(company.name || "未命名公司"),
      role: String(company.role || "未注明岗位"),
      priority: normalizePriority(company.priority),
    };
    const explicitLabel = String(company.nextAction || "").trim();
    const explicitDate = validDateKey(company.nextActionDeadline);
    if (explicitLabel || explicitDate) {
      candidates.push({
        ...common,
        id: `${company.id}:explicit`,
        source: "explicit",
        label: explicitLabel || "处理下一步行动",
        date: explicitDate,
        time: "",
      });
    }
    for (const [index, node] of (company.timeline || []).entries()) {
      const nodeDate = validDateKey(node?.date);
      if (!nodeDate || nodeDate < currentDay || node?.kind === "note") continue;
      candidates.push({
        ...common,
        id: `${company.id}:timeline:${node.id || `${nodeDate}:${node.time || ""}:${index}`}`,
        source: "timeline",
        nodeId: node.id || "",
        label: nodeName(node),
        date: nodeDate,
        time: String(node.time || ""),
      });
    }
  }

  const deduplicated = [];
  for (const candidate of candidates) {
    const same = deduplicated.find((item) => item.companyId === candidate.companyId
      && item.date === candidate.date
      && normalizedActionLabel(item.label) === normalizedActionLabel(candidate.label)
      && (item.time === candidate.time || item.source === "explicit" || candidate.source === "explicit"));
    if (same) {
      if (!same.time && candidate.time) same.time = candidate.time;
      same.sources = [...new Set([...(same.sources || [same.source]), candidate.source])];
      if (candidate.nodeId) same.nodeId = candidate.nodeId;
      continue;
    }
    deduplicated.push({ ...candidate, sources: [candidate.source] });
  }

  const bucketOrder = { overdue: 0, today: 1, soon: 2, later: 3 };
  return deduplicated
    .map((item) => {
      const daysUntil = calendarDayDifference(currentDay, item.date);
      return {
        ...item,
        bucket: actionBucket(item.date, currentDay, soonDays),
        daysUntil,
      };
    })
    .sort((a, b) => bucketOrder[a.bucket] - bucketOrder[b.bucket]
      || actionSortValue(a).localeCompare(actionSortValue(b))
      || String(a.time).localeCompare(String(b.time))
      || b.priority - a.priority
      || a.companyName.localeCompare(b.companyName, "zh-CN"));
}

function canonicalProgress(value) {
  const text = String(value || "");
  if (/签约|入职/.test(text)) return { label: "签约/入职", rank: 100 };
  if (/offer/i.test(text)) return { label: "Offer", rank: 90 };
  if (/hr\s*面/i.test(text)) return { label: "HR 面", rank: 80 };
  if (/终面/.test(text)) return { label: "终面", rank: 70 };
  if (/三面/.test(text)) return { label: "三面", rank: 60 };
  if (/二面/.test(text)) return { label: "二面", rank: 50 };
  if (/一面/.test(text)) return { label: "一面", rank: 40 };
  if (/面试|interview/i.test(text)) return { label: "面试", rank: 40 };
  if (/笔试/.test(text)) return { label: "笔试", rank: 30 };
  if (/测评|assessment/i.test(text)) return { label: "测评", rank: 30 };
  if (/筛选|沟通|screening/i.test(text)) return { label: "简历筛选", rank: 20 };
  if (/投递|网申|applied/i.test(text)) return { label: "已投递", rank: 10 };
  if (/未开始/.test(text)) return { label: "未开始", rank: 0 };
  return { label: "", rank: -1 };
}

export function suggestedProgress(company, today = dateKey(new Date())) {
  const limit = validDateKey(today);
  if (!limit) return "";
  let suggestion = { label: "", rank: -1, date: "" };
  for (const node of company?.timeline || []) {
    const nodeDate = validDateKey(node?.date);
    if (!nodeDate || nodeDate > limit) continue;
    const candidate = canonicalProgress(`${node?.type || ""} ${node?.title || ""}`);
    if (candidate.rank > suggestion.rank || (candidate.rank === suggestion.rank && nodeDate > suggestion.date)) {
      suggestion = { ...candidate, date: nodeDate };
    }
  }
  return suggestion.label;
}

export function applicationHealthIssues(company, today = dateKey(new Date())) {
  const currentDay = validDateKey(today);
  if (!currentDay || !company) return [];
  const issues = [];
  const rawDeadline = String(company.nextActionDeadline || "").trim();
  const deadline = validDateKey(rawDeadline);
  const explicitAction = String(company.nextAction || "").trim();
  const timeline = company.timeline || [];
  const futureNodes = timeline.filter((node) => validDateKey(node?.date) >= currentDay);
  const plannedAfterToday = timeline.filter((node) => validDateKey(node?.date) > currentDay);
  const terminalTimeline = timeline.some((node) => {
    const nodeDate = validDateKey(node?.date);
    return nodeDate && nodeDate <= currentDay && TERMINAL_NODE.test(`${node?.type || ""} ${node?.title || ""}`);
  });
  const rawStatus = statusLabel(company);
  const statusIsTerminal = TERMINAL_STATUS.test(rawStatus);
  const progress = canonicalProgress(company.progress);
  const timelineSuggestion = suggestedProgress(company, currentDay);
  const suggested = canonicalProgress(timelineSuggestion);
  const addIssue = (code, severity, message, details = {}) => issues.push({ code, severity, message, ...details });

  if (rawDeadline && !deadline) {
    addIssue("invalid-deadline", "warning", "行动 DDL 不是有效日期，请重新设置。");
  }
  if (statusIsTerminal && (explicitAction || rawDeadline || plannedAfterToday.length)) {
    addIssue("terminal-has-action", "warning", "岗位已经结束，但仍保留下一步行动或未来节点。", { action: "清理旧行动" });
  }
  if (!statusIsTerminal && terminalTimeline) {
    addIssue("status-timeline-conflict", "warning", "时间线已经出现结束节点，但当前状态仍未结束。", { action: "对齐当前状态" });
  } else if (/待投递/.test(rawStatus) && applicationDate(company) && applicationDate(company) <= currentDay) {
    addIssue("status-timeline-conflict", "warning", "已经存在投递记录，但当前状态仍是待投递。", { action: "更新当前状态" });
  }
  if (!statusIsTerminal && /offer/i.test(rawStatus) && progress.rank < 90) {
    addIssue("status-progress-conflict", "warning", "当前状态已是 Offer，但当前进度尚未同步。", { suggestedProgress: "Offer" });
  }
  if (!statusIsTerminal && progress.rank >= 100 && !/入职|签约/.test(rawStatus)) {
    addIssue("status-progress-conflict", "warning", "当前进度已经签约或入职，但当前状态仍未结束。", { action: "对齐当前状态" });
  }
  if (!statusIsTerminal && suggested.rank > progress.rank && progress.rank >= 0) {
    addIssue("progress-timeline-conflict", "warning", `时间线已推进到${timelineSuggestion}，当前进度仍是${progress.label}。`, { suggestedProgress: timelineSuggestion });
  }
  if (!isArchivedApplication(company)) {
    if (deadline && deadline < currentDay) {
      addIssue("overdue-deadline", "urgent", "下一步行动已经逾期。", { date: deadline });
    }
    if (deadline && !explicitAction) {
      addIssue("deadline-without-action", "warning", "已设置行动 DDL，但没有填写具体行动。", { date: deadline });
    }
    if (!explicitAction && futureNodes.length === 0) {
      addIssue("missing-next-action", "info", "这个岗位还没有下一步行动或未来节点。", { action: "规划下一步" });
    }
  }

  const severityOrder = { urgent: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function aggregateApplications(companies, field, today = dateKey(new Date())) {
  const missingLabel = field === "track" ? "赛道未注明" : field === "channel" ? "渠道未注明" : "未注明";
  const groups = new Map();
  for (const company of companies || []) {
    const value = String(company?.[field] || "").trim() || missingLabel;
    if (!groups.has(value)) groups.set(value, { value, total: 0, active: 0, responded: 0, interviews: 0, offers: 0, closed: 0, waiting: [] });
    const group = groups.get(value);
    const archived = isArchivedApplication(company);
    const timelineText = (company.timeline || [])
      .filter((node) => !validDateKey(node?.date) || validDateKey(node.date) <= today)
      .map((node) => `${node?.type || ""} ${node?.title || ""}`).join(" ");
    const activityText = `${company.status || ""} ${company.progress || ""} ${timelineText}`;
    const reached = Math.max(canonicalProgress(company.progress).rank, canonicalProgress(suggestedProgress(company, today)).rank);
    group.total += 1;
    group.active += archived ? 0 : 1;
    group.closed += archived ? 1 : 0;
    group.responded += reached >= 20 ? 1 : 0;
    group.interviews += /面试|一面|二面|三面|终面|hr\s*面|interview/i.test(activityText) ? 1 : 0;
    group.offers += /offer/i.test(activityText) ? 1 : 0;
    const days = archived ? null : waitingDays(company, today);
    if (days !== null) group.waiting.push(days);
  }
  return [...groups.values()]
    .map(({ waiting, ...group }) => ({ ...group, medianWaitingDays: median(waiting) }))
    .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value, "zh-CN"));
}

export function nextActionSummary(company, today = dateKey(new Date())) {
  if (isTerminalApplication(company)) {
    return { label: "无需跟进", date: "", time: "" };
  }
  const explicit = String(company?.nextAction || "").trim();
  if (explicit) {
    return {
      label: explicit,
      date: String(company?.nextActionDeadline || ""),
      time: "",
    };
  }
  const planned = nextNode(company, today);
  if (planned) return { label: nodeName(planned), date: planned.date, time: planned.time || "" };
  return {
    label: "待规划",
    date: "",
    time: "",
  };
}

export function stageFor(company, intelligence = {}, today = dateKey(new Date())) {
  const record = intelligence.applicationSync?.records?.[company?.id];
  const latest = currentNode(company, today);
  const text = `${record?.normalizedStage || ""} ${record?.officialStatus || ""} ${company?.status || ""} ${company?.progress || ""} ${latest?.type || ""} ${latest?.title || ""}`;
  if (/入职|拒绝|淘汰|未通过|已挂|放弃|暂停|撤回|结束|hired|rejected|discarded/i.test(text)) return "closed";
  if (/offer/i.test(text)) return "offer";
  if (/面试|一面|二面|三面|终面|hr\s*面|interview/i.test(text)) return "interview";
  if (/筛选|测评|笔试|沟通|responded|screening|assessment/i.test(text)) return "screening";
  if (/投递|网申|已投递|进行中|applied/i.test(text)) return "applied";
  return "wishlist";
}
