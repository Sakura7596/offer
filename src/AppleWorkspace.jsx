import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AddressBook,
  Archive,
  ArrowDown,
  ArrowRight,
  Bell,
  BellSimple,
  Briefcase,
  Buildings,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartBar,
  Check,
  CheckCircle,
  CirclesFour,
  Clock,
  Copy,
  DotsThree,
  EnvelopeSimple,
  File,
  FileText,
  Flag,
  FolderSimple,
  FunnelSimple,
  Gear,
  House,
  ImageSquare,
  IdentificationCard,
  Kanban,
  LinkSimple,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  Note,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Rows,
  Sparkle,
  SquaresFour,
  Star,
  Tag,
  Target,
  Trash,
  TrendUp,
  UploadSimple,
  User,
  Users,
  X,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CareerOpsView from "./CareerOps.jsx";
import { findCompanyPreset, normalizeCompanyName } from "./company-identity.js";
import {
  addDays,
  applicationDate,
  applicationInputDate,
  aggregateApplications,
  applicationHealthIssues,
  buildActionItems,
  calendarEventType,
  currentProgress,
  dateKey,
  expandMonthDay,
  isArchivedApplication,
  nextActionSummary,
  nextNode,
  nodeName,
  normalizePriority,
  preserveUnchangedExplicitValue,
  removeTimelineNode,
  scheduleNodes,
  stageFor,
  startOfWeek,
  statusLabel,
  updateApplicationRecord,
  waitingDays,
  upsertTimelineNode,
} from "./workspace-model.js";

const NAV = [
  ["home", "首页", House],
  ["applications", "投递总表", PaperPlaneTilt],
  ["roles", "岗位", Briefcase],
  ["schedule", "时间规划", CalendarBlank],
  ["analytics", "数据分析", ChartBar],
];

const STATUS_OPTIONS = ["待投递", "已投递", "进行中", "Offer", "已拒绝", "已挂", "无消息", "暂停/放弃"];
const BATCH_OPTIONS = ["提前批", "正式批", "秋招补录", "暑期实习转正", "实习转正", "国企秋招", "事业单位/泛体制", "其他"];
const PROGRESS_OPTIONS = ["未开始", "已投递", "简历筛选", "笔试", "测评", "一面", "二面", "三面", "终面", "HR 面", "Offer", "签约/入职"];
const TRACK_OPTIONS = ["互联网", "国企/央企", "事业单位/泛体制", "其他"];
const CHANNEL_OPTIONS = ["官网", "内推", "招聘平台", "宣讲会/双选会", "学校渠道", "其他"];

const STAGES = [
  { id: "wishlist", label: "关注", color: "blue" },
  { id: "applied", label: "已投递", color: "sky" },
  { id: "screening", label: "筛选", color: "purple" },
  { id: "interview", label: "面试", color: "green" },
  { id: "offer", label: "Offer", color: "orange" },
  { id: "closed", label: "已结束", color: "red" },
];

const EMPTY_INTELLIGENCE = {
  generatedAt: null,
  opportunities: [],
  updates: [],
  roleBriefs: {},
  automation: { name: "秋招情报 Loop", schedule: "每天 22:30", status: "not_configured" },
  applicationSync: { records: {}, changes: [], checkedAt: null, status: "not_configured" },
};

const EMPTY_CAREER = {
  connected: false,
  applications: [],
  reports: [],
  outputs: [],
  interviewFiles: [],
  resume: null,
  assetCounts: { reports: 0, outputs: 0, interviews: 0 },
  pipelineCount: 0,
};

const EMPTY_LOOP_RUNS = { version: 1, runs: [] };

const EMPTY_PROFILE = { name: "", title: "", location: "" };
const APPLICATIONS_PAGE_SIZE = 12;
const HOME_STAGE_PREVIEW_SIZE = 3;
const ROLE_COMPANY_PREVIEW_SIZE = 8;
const GANTT_ROLE_PREVIEW_SIZE = 12;

function profileInitial(profile) {
  return String(profile?.name || "你").trim().slice(0, 1) || "你";
}

const LOGO_FILE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_FILE_LIMIT = 2 * 1024 * 1024;
const JD_IMAGE_LIMIT = 4 * 1024 * 1024;

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !LOGO_FILE_TYPES.has(file.type)) {
      reject(new Error("请选择 PNG、JPG 或 WebP 图片"));
      return;
    }
    if (file.size > LOGO_FILE_LIMIT) {
      reject(new Error("Logo 图片不能超过 2MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("无法读取这张图片"));
    reader.readAsDataURL(file);
  });
}

const COMPANY_PRESETS = [
  ["alibaba", ["阿里", "阿里巴巴", "千问", "alibaba"], "/logos/preset-alibaba.png"],
  ["tencent", ["腾讯", "tencent"], "/logos/preset-tencent.png"],
  ["xiaohongshu", ["小红书", "rednote"], "/logos/preset-xiaohongshu.png"],
  ["pinduoduo", ["拼多多", "pdd"], "/logos/preset-pinduoduo.jpg"],
  ["jd", ["京东", "jd"], "/logos/preset-jd.png"],
  ["baidu", ["百度", "baidu"], "/logos/preset-baidu.png"],
  ["deepseek", ["deepseek", "深度求索"], "/logos/preset-deepseek.png"],
  ["kimi", ["kimi", "月之暗面"], "/logos/preset-kimi.png"],
  ["minimax", ["minimax", "稀宇"], "/logos/preset-minimax.png"],
  ["zhipu", ["智谱", "zhipu", "glm"], "/logos/preset-zhipu.png"],
  ["kuaishou", ["快手", "kuaishou"], "/logos/preset-kuaishou.png"],
];

const COMPANY_DISPLAY_NAMES = {
  alibaba: "阿里巴巴",
  tencent: "腾讯",
  xiaohongshu: "小红书",
  pinduoduo: "拼多多",
  jd: "京东",
  baidu: "百度",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  minimax: "MiniMax",
  zhipu: "智谱",
  kuaishou: "快手",
};

function companyIdentity(value) {
  return findCompanyPreset(value, COMPANY_PRESETS)?.[0] || normalizeCompanyName(value);
}

function companyDisplayName(value) {
  const identity = companyIdentity(value);
  return COMPANY_DISPLAY_NAMES[identity] || String(value || "公司未注明").trim();
}

function matchLogo(value) {
  return findCompanyPreset(value, COMPANY_PRESETS)?.[2] || "";
}

function shortDate(value) {
  if (!value) return "未设置";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function relativeTime(value) {
  if (!value) return "时间未记录";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return "时间未记录";
  const days = Math.floor(delta / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days}天前`;
}

function itemDate(company) {
  return applicationDate(company);
}

function categoryLabel(value, fallback = "未分类") {
  return String(value || "").trim() || fallback;
}

function actionDueLabel(item) {
  if (item.source === "suggestion") return `已等待 ${item.waiting} 天`;
  if (!item.date) return "时间待定";
  if (item.bucket === "overdue") return `逾期 ${Math.abs(item.daysUntil)} 天`;
  if (item.bucket === "today") return "今天";
  if (item.bucket === "soon") return `${item.daysUntil} 天后`;
  return shortDate(item.date);
}

function readJdImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !LOGO_FILE_TYPES.has(file.type)) {
      reject(new Error("JD 截图仅支持 PNG、JPG 或 WebP"));
      return;
    }
    if (file.size > JD_IMAGE_LIMIT) {
      reject(new Error("JD 截图不能超过 4MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name || "粘贴的 JD 截图", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("无法读取 JD 截图"));
    reader.readAsDataURL(file);
  });
}

async function storeLocalImage(image) {
  if (!image?.dataUrl?.startsWith("data:image/")) return image;
  const response = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl: image.dataUrl }),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok || !value.url) throw new Error(value.error || "无法保存图片");
  return { ...image, dataUrl: value.url };
}

function monthDayInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value).slice(5) : String(value || "");
}

function CompanyLogo({ company, size = "md" }) {
  const src = company.logoUrl || matchLogo(company.name);
  return (
    <span className={`aw-company-logo size-${size}`}>
      {src ? <img src={src} alt="" /> : <b>{company.mark || company.name?.slice(0, 1) || "?"}</b>}
    </span>
  );
}

function OpportunityLogo({ opportunity }) {
  const name = opportunity.company || opportunity.organization || opportunity.title || "公司";
  return <CompanyLogo company={{ name, team: opportunity.title || opportunity.role || "", mark: name.slice(0, 1) }} size="md" />;
}

function StagePill({ stage }) {
  const value = STAGES.find((item) => item.id === stage) || STAGES[0];
  return <span className={`aw-pill tone-${value.color}`}>{value.label}</span>;
}

function PriorityPill({ value }) {
  const priority = normalizePriority(value);
  return <span className={`aw-priority priority-${priority}`} aria-label={`重视程度 ${priority} 分`}>{priority} 分</span>;
}

function IconButton({ children, label, className = "", ...props }) {
  return <button className={`aw-icon-button ${className}`} aria-label={label} {...props}>{children}</button>;
}

function TimelineAction({ onClick, label = "添加时间节点" }) {
  return <button type="button" className="aw-timeline-action" onClick={onClick}><CalendarBlank />{label}</button>;
}

function PageHeader({ title, subtitle, action, onAction, actionIcon: ActionIcon = Plus, children }) {
  return (
    <header className="aw-page-header">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="aw-page-actions">{children}{action && <button className="aw-black-button" onClick={onAction}><ActionIcon weight="bold" />{action}</button>}</div>
    </header>
  );
}

function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`aw-panel ${className}`}>
      {(title || action) && <header className="aw-panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
      {children}
    </section>
  );
}

function SearchField({ value, onChange, placeholder, inputRef, shortcut = false, searchboxProps = {} }) {
  return (
    <label className="aw-search-field"><MagnifyingGlass /><input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} {...searchboxProps}/>{shortcut && <kbd>Ctrl K</kbd>}</label>
  );
}

function FilterButton({ children }) {
  return <button className="aw-filter-button">{children}<CaretDown /></button>;
}

function EmptyState({ icon: Icon = Archive, title, text, action, onAction }) {
  return <div className="aw-empty"><span><Icon /></span><h3>{title}</h3><p>{text}</p>{action && <button className="aw-outline-button" onClick={onAction}><Plus />{action}</button>}</div>;
}

function Donut({ values, total, center, sub }) {
  const colors = ["#94b4ff", "#9bd7ff", "#8de0a7", "#ffc96c", "#ff898d", "#b7a3ff"];
  const sum = Math.max(total || values.reduce((acc, value) => acc + value, 0), 1);
  let cursor = 0;
  const stops = values.map((value, index) => {
    const start = cursor;
    cursor += (value / sum) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(", ");
  return <div className="aw-donut" style={{ background: `conic-gradient(${stops || "#edf0f5 0 100%"})` }}><div><strong>{center ?? total}</strong><small>{sub}</small></div></div>;
}

function Funnel({ counts, compact = false }) {
  const values = [counts.applied || 0, counts.screening || 0, counts.interview || 0, counts.offer || 0, counts.closed || 0];
  const maximum = Math.max(1, ...values);
  return <div className={`aw-funnel ${compact ? "is-compact" : ""}`}>{values.map((value, index) => <div className={value === 0 ? "is-zero" : ""} key={index} style={{ width: `${58 + value / maximum * 42}%` }}><span>{value}</span></div>)}</div>;
}

function countStages(companies, intelligence) {
  return Object.fromEntries(STAGES.map((stage) => [stage.id, companies.filter((company) => stageFor(company, intelligence) === stage.id).length]));
}

function HomePage({ companies, intelligence, profile, navigate, openAdd, openNotifications, openNode, openQuickUpdate, openActionEditor, completeAction }) {
  const [expandedStages, setExpandedStages] = useState([]);
  const counts = countStages(companies, intelligence);
  const appliedTotal = companies.filter((company) => stageFor(company, intelligence) !== "wishlist").length;
  const today = dateKey(new Date());
  const weekEnd = dateKey(addDays(new Date(), 7));
  const futureEvents = companies.filter((company)=>!isArchivedApplication(company)).flatMap((company) => scheduleNodes(company).map((node) => ({ company, node })))
    .filter(({ node }) => node.date >= today).sort((a, b) => `${a.node.date} ${a.node.time || ""}`.localeCompare(`${b.node.date} ${b.node.time || ""}`));
  const upcoming = futureEvents.slice(0, 4);
  const thisWeek = futureEvents.filter(({ node }) => node.date <= weekEnd);
  const todayCount = futureEvents.filter(({ node }) => node.date === today).length;
  const recent = [...(intelligence.updates || []), ...(intelligence.applicationSync?.changes || [])]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 4);
  const groups = companies.reduce((map, company) => map.set(company.name, Math.max(map.get(company.name) || 0, normalizePriority(company.priority))), new Map());
  const topCompanies = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const weekCounts = {
    interviews: thisWeek.filter(({ node }) => /面/.test(`${node.type}${node.title}`)).length,
    assessments: thisWeek.filter(({ node }) => /笔试|测评/.test(`${node.type}${node.title}`)).length,
    followups: companies.filter((company) => !company.jd && !company.jdImage).length,
    tasks: thisWeek.length,
  };
  const allActions = buildActionItems(companies);
  const plannedActions = allActions.filter((item) => item.bucket !== "later" || !item.date);
  const plannedCompanyIds = new Set(allActions.map((item) => item.companyId));
  const followupSuggestions = companies
    .filter((company) => !isArchivedApplication(company) && applicationDate(company) && !plannedCompanyIds.has(company.id) && (waitingDays(company) ?? 0) >= 7)
    .map((company) => ({
      id: `${company.id}:suggestion`, companyId: company.id, companyName: company.name, role: company.role,
      label: "确认申请进展并规划下一步", source: "suggestion", bucket: "soon", waiting: waitingDays(company),
      priority: normalizePriority(company.priority), date: "", daysUntil: null,
    }))
    .sort((a, b) => b.priority - a.priority || b.waiting - a.waiting);
  const actionItems = [...plannedActions, ...followupSuggestions].slice(0, 8);
  const overdueCount = plannedActions.filter((item) => item.bucket === "overdue").length;
  const todayActionCount = plannedActions.filter((item) => item.bucket === "today").length;
  return <div className="aw-page aw-home-page">
    <PageHeader title={profile?.name ? `早上好，${profile.name}` : "欢迎回来"} subtitle={`今天有 ${todayCount} 个求职节点，本周还有 ${thisWeek.length} 个安排。`} action="添加岗位" onAction={openAdd}>
      <IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton>
    </PageHeader>
    <Panel title="今日行动" subtitle={`${overdueCount ? `${overdueCount} 项逾期 · ` : ""}${todayActionCount} 项今天到期，先处理最影响推进的事情。`} action={<button className="aw-text-button" onClick={() => navigate("applications")}>查看全部投递 <ArrowRight /></button>} className="aw-action-center">
      {actionItems.length ? <div className="aw-action-list">{actionItems.map((item) => <article key={item.id} className={`bucket-${item.bucket}`}>
        <span className="aw-action-marker">{item.bucket === "overdue" ? <Bell /> : item.source === "suggestion" ? <Sparkle /> : <CalendarBlank />}</span>
        <button type="button" className="aw-action-main" onClick={() => navigate("roles", item.companyId)}><strong>{item.label}</strong><small>{item.companyName} · {item.role}</small></button>
        <span className="aw-action-due">{actionDueLabel(item)}</span>
        <button type="button" className="aw-action-update" onClick={() => item.source === "suggestion" ? openQuickUpdate(item.companyId) : openActionEditor(item)}>{item.source === "suggestion" ? "设置" : "改期"}</button>
        {item.source === "explicit" && !item.sources?.includes("timeline") && <button type="button" className="aw-action-done" onClick={() => completeAction(item.companyId)}><Check />完成</button>}
      </article>)}</div> : <EmptyState icon={CheckCircle} title="眼下没有紧急行动" text="给活跃岗位设置下一步行动和 DDL，首页会自动按紧急程度排序。" />}
    </Panel>
    <div className="aw-home-top aw-grid-3">
      <Panel title="阶段分布"><div className="aw-funnel-card"><Funnel counts={counts} compact /><div className="aw-funnel-legend"><strong>{appliedTotal}<small>有效进程</small></strong>{STAGES.slice(1).map((stage) => <span key={stage.id}><i className={`tone-${stage.color}`} />{stage.label}<b>{counts[stage.id]}</b></span>)}</div></div></Panel>
      <Panel title="申请状态"><div className="aw-donut-card"><Donut values={STAGES.map((stage) => counts[stage.id])} total={companies.length} center={companies.length} sub="全部" /><div className="aw-mini-legend">{STAGES.map((stage) => <span key={stage.id}><i className={`tone-${stage.color}`} />{stage.label}<b>{counts[stage.id]}</b></span>)}</div></div></Panel>
      <Panel title="本周"><div className="aw-week-list"><span><i className="blue"><Users /></i><b>{weekCounts.interviews}</b>面试</span><span><i className="purple"><FileText /></i><b>{weekCounts.assessments}</b>测评</span><span><i className="sky"><EnvelopeSimple /></i><b>{weekCounts.followups}</b>待补资料</span><span><i className="gray"><CalendarBlank /></i><b>{weekCounts.tasks}</b>时间节点</span></div></Panel>
    </div>
    <Panel title="岗位进展" className="aw-home-pipeline">
      <div className="aw-home-columns">{STAGES.slice(1).map((stage) => { const items = companies.filter((company) => stageFor(company, intelligence) === stage.id); const expanded=expandedStages.includes(stage.id); const visibleItems=expanded?items:items.slice(0,HOME_STAGE_PREVIEW_SIZE); return <div key={stage.id} className={`aw-home-column tone-${stage.color}`}><header><span>{stage.label}</span><b>{items.length}</b></header>{visibleItems.map((company) => <button key={company.id} onClick={() => navigate("roles", company.id)}><CompanyLogo company={company} size="sm" /><span><strong>{company.name}</strong><small>{company.role}</small></span><em>{shortDate(itemDate(company))}</em></button>)}{items.length>HOME_STAGE_PREVIEW_SIZE&&<button type="button" className="aw-home-column-more" aria-expanded={expanded} onClick={()=>setExpandedStages((current)=>expanded?current.filter((id)=>id!==stage.id):[...current,stage.id])}>{expanded?"收起":`展开其余 ${items.length-HOME_STAGE_PREVIEW_SIZE} 个`}<CaretDown/></button>}</div>; })}</div>
    </Panel>
    <div className="aw-home-bottom aw-grid-3">
      <Panel title="即将到来" action={<TimelineAction label="添加节点" onClick={() => openNode()} />}>{upcoming.length ? <div className="aw-simple-list">{upcoming.map(({ company, node }) => <button key={`${company.id}-${node.id}`} onClick={() => node.isAction?openQuickUpdate(company.id):openNode(company.id, node.date, node)}><span className="aw-soft-icon"><CalendarBlank /></span><span><strong>{nodeName(node)}</strong><small>{company.name}</small></span><em>{shortDate(node.date)} {node.isAction?"行动 DDL":node.time}</em></button>)}</div> : <EmptyState title="暂无日程" text="记录投递、测评或面试日期，保存后会自动同步到所有时间视图。" action="添加节点" onAction={() => openNode()} />}</Panel>
      <Panel title="重点公司"><div className="aw-bar-list">{topCompanies.map(([name, value]) => <div key={name}><span>{name}</span><i><b style={{ width: `${value / 5 * 100}%` }} /></i><strong>{value} 分</strong></div>)}</div></Panel>
      <Panel title="最近动态">{recent.length ? <div className="aw-activity-list">{recent.map((item, index) => <div key={`${item.id || "update"}-${index}`}><span className="aw-soft-icon"><TrendUp /></span><p><strong>{item.title}</strong><small>{item.summary}</small></p><em>{relativeTime(item.createdAt)}</em></div>)}</div> : <EmptyState title="暂无动态" text="情报 Loop 的更新会显示在这里。" />}</Panel>
    </div>
  </div>;
}

function ApplicationInlineEditor({ company, dirty, onCancel, onDirty, onSave }) {
  const safeId = String(company.id || "role").replace(/[^a-zA-Z0-9_-]/g, "");
  const progressListId = `table-progress-${safeId}`;
  const batchListId = `table-batch-${safeId}`;
  const currentStatus = statusLabel(company);
  const currentTrack = String(company.track || "");
  const currentChannel = String(company.channel || "");
  return <form id={`application-editor-${safeId}`} className="aw-table-inline-editor" aria-label={`编辑 ${company.name} ${company.role}`} onChange={onDirty} onSubmit={(event) => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget))); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <header><div><PencilSimple /><span><strong>编辑这条投递</strong><small>{dirty ? "有未保存修改，保存后会同步到所有相关页面。" : "保存后，首页、岗位、时间规划和数据分析会同步更新。"}</small></span></div><button type="button" aria-label="取消编辑" onClick={onCancel}><X /></button></header>
    <datalist id={progressListId}>{PROGRESS_OPTIONS.map((value) => <option key={value} value={value} />)}</datalist>
    <datalist id={batchListId}>{BATCH_OPTIONS.map((value) => <option key={value} value={value} />)}</datalist>
    <div className="aw-table-editor-grid">
      <label>公司名称<input name="name" autoFocus required defaultValue={company.name} /></label>
      <label>岗位名称<input name="role" required defaultValue={company.role} /></label>
      <label>城市<input name="location" defaultValue={company.location} /></label>
      <label>投递时间（月-日）<input name="appliedAt" inputMode="numeric" pattern="[0-1][0-9]-[0-3][0-9]" defaultValue={monthDayInput(applicationInputDate(company))} placeholder="07-21" /></label>
      <label>投递赛道<select name="track" defaultValue={currentTrack}><option value="">未分类</option>{currentTrack && !TRACK_OPTIONS.includes(currentTrack) && <option>{currentTrack}</option>}{TRACK_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>投递渠道<select name="channel" defaultValue={currentChannel}><option value="">未分类</option>{currentChannel && !CHANNEL_OPTIONS.includes(currentChannel) && <option>{currentChannel}</option>}{CHANNEL_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>招聘批次<input name="batch" list={batchListId} defaultValue={company.batch} /></label>
      <label>重视程度<select name="priority" defaultValue={normalizePriority(company.priority)}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 分</option>)}</select></label>
      <label>当前状态<select name="status" defaultValue={currentStatus}>{!STATUS_OPTIONS.includes(currentStatus) && <option>{currentStatus}</option>}{STATUS_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>当前进度<input name="progress" list={progressListId} defaultValue={currentProgress(company)} /></label>
      <label>下一步行动<input name="nextAction" defaultValue={company.nextAction} /></label>
      <label>行动 DDL<input name="nextActionDeadline" type="date" defaultValue={company.nextActionDeadline} /></label>
      <label className="is-wide">职位链接<input name="jobUrl" type="url" defaultValue={company.jobUrl} placeholder="https://" /></label>
    </div>
    <footer><p><CheckCircle /><span><strong>一次保存，全局同步</strong><small>JD、备注、附件和其他时间节点不会被改动。</small></span></p><div><button type="button" className="aw-outline-button" onClick={onCancel}>取消</button><button type="submit" className="aw-black-button"><Check />保存更新</button></div></footer>
  </form>;
}

function ApplicationsPage({ companies, intelligence, selectedId, selectCompany, openAdd, openNotifications, navigate, openNode, openQuickUpdate, saveApplicationSummary, onEditorStateChange }) {
  const [stageFilter, setStageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [lifecycleFilter, setLifecycleFilter] = useState("active");
  const [localQuery, setLocalQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState("");
  const [editingDirty, setEditingDirty] = useState(false);
  const editButtonRefs = useRef(new Map());
  const applications = companies;
  const filtered = applications.filter((company) => {
    const searchText = `${company.name} ${company.role} ${company.location} ${company.batch} ${company.status} ${company.progress} ${company.track} ${company.channel}`.toLowerCase();
    return (!localQuery || searchText.includes(localQuery.toLowerCase()))
      && (stageFilter === "all" || stageFor(company, intelligence) === stageFilter)
      && (priorityFilter === "all" || normalizePriority(company.priority) === Number(priorityFilter))
      && (trackFilter === "all" || categoryLabel(company.track) === trackFilter)
      && (channelFilter === "all" || categoryLabel(company.channel) === channelFilter)
      && (lifecycleFilter === "all" || (lifecycleFilter === "archived") === isArchivedApplication(company));
  });
  const counts = countStages(applications, intelligence);
  const pageCount = Math.max(1, Math.ceil(filtered.length / APPLICATIONS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * APPLICATIONS_PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + APPLICATIONS_PAGE_SIZE);
  useEffect(() => { setPage(1); }, [stageFilter, priorityFilter, trackFilter, channelFilter, lifecycleFilter, localQuery]);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  useEffect(() => { const index = filtered.findIndex((company) => company.id === selectedId); if (index >= 0) setPage(Math.floor(index / APPLICATIONS_PAGE_SIZE) + 1); }, [selectedId]);
  useEffect(() => { if (editingId && !companies.some((company) => company.id === editingId)) { setEditingId(""); setEditingDirty(false); } }, [companies, editingId]);
  useEffect(() => { onEditorStateChange({ open: Boolean(editingId), dirty: editingDirty }); }, [editingId, editingDirty, onEditorStateChange]);
  useEffect(() => () => onEditorStateChange({ open: false, dirty: false }), [onEditorStateChange]);
  const canDiscardEditor = () => !editingId || !editingDirty || window.confirm("当前编辑还没有保存，是否放弃这些修改？");
  const closeEditor = (restoreFocus = true) => {
    const closingId = editingId;
    setEditingId("");
    setEditingDirty(false);
    if (restoreFocus && closingId) requestAnimationFrame(() => editButtonRefs.current.get(closingId)?.focus());
  };
  const runAfterDiscard = (action) => {
    if (!canDiscardEditor()) return false;
    closeEditor(false);
    action();
    return true;
  };
  const beginEditing = (company) => {
    if (company.id === editingId) {
      if (canDiscardEditor()) closeEditor();
      return;
    }
    if (!canDiscardEditor()) return;
    setEditingId(company.id);
    setEditingDirty(false);
    selectCompany(company.id);
  };
  const submitEditor = (company, values) => {
    if (!saveApplicationSummary(company.id, values)) return false;
    closeEditor();
    return true;
  };
  return <div className="aw-page aw-applications-page">
    <PageHeader title="秋招投递总表" subtitle="公司、岗位、批次、状态、进度和下一步集中在一张表里。" action="添加投递" onAction={openAdd}><TimelineAction onClick={() => openNode("")} /><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-lifecycle-tabs" role="group" aria-label="投递生命周期筛选">{[["active", "活跃"], ["archived", "已结束"], ["all", "全部"]].map(([id, label]) => <button type="button" key={id} className={lifecycleFilter === id ? "is-active" : ""} onClick={() => runAfterDiscard(() => setLifecycleFilter(id))}>{label}<b>{id === "all" ? applications.length : applications.filter((company) => (id === "archived") === isArchivedApplication(company)).length}</b></button>)}</div>
    <div className="aw-toolbar aw-tracker-toolbar"><SearchField value={localQuery} onChange={(value) => runAfterDiscard(() => setLocalQuery(value))} placeholder="搜索公司、岗位、城市或批次" /><label>阶段<select value={stageFilter} onChange={(event) => { const value = event.target.value; runAfterDiscard(() => setStageFilter(value)); }}><option value="all">全部</option>{STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}（{counts[stage.id] || 0}）</option>)}</select></label><label>赛道<select value={trackFilter} onChange={(event) => { const value = event.target.value; runAfterDiscard(() => setTrackFilter(value)); }}><option value="all">全部</option>{[...TRACK_OPTIONS, "未分类"].map((value) => <option key={value}>{value}</option>)}</select></label><label>渠道<select value={channelFilter} onChange={(event) => { const value = event.target.value; runAfterDiscard(() => setChannelFilter(value)); }}><option value="all">全部</option>{[...CHANNEL_OPTIONS, "未分类"].map((value) => <option key={value}>{value}</option>)}</select></label><label>重视程度<select value={priorityFilter} onChange={(event) => { const value = event.target.value; runAfterDiscard(() => setPriorityFilter(value)); }}><option value="all">全部</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} 分</option>)}</select></label><span className="aw-tracker-count">显示 {filtered.length} / {applications.length} 条</span></div>
    <Panel className="aw-table-panel aw-tracker-table-panel">
      <div className="aw-table aw-app-table aw-tracker-table">
        <div className="aw-tr aw-th"><span>公司 / 岗位</span><span>城市</span><span>批次 / 来源</span><span>投递时间</span><span>当前状态</span><span>当前进度</span><span>下一步行动 / DDL</span><span>重视程度</span><span>资料</span><span>职位链接</span></div>
        {pageItems.map((company) => {
          const next = nextActionSummary(company);
          const isEditing = company.id === editingId;
          const editorId = `application-editor-${String(company.id || "role").replace(/[^a-zA-Z0-9_-]/g, "")}`;
          return <div className="aw-table-record" key={company.id}>
            <div className={`aw-tr ${company.id === selectedId ? "is-selected" : ""} ${isEditing ? "is-editing" : ""}`}>
              <span className="aw-table-company-slot"><button type="button" className="aw-company-cell aw-table-company-link" onClick={() => navigate("roles", company.id)}><CompanyLogo company={company} size="sm" /><span><strong>{company.name}</strong><small>{company.role}</small></span></button><button type="button" ref={(node) => { if (node) editButtonRefs.current.set(company.id, node); else editButtonRefs.current.delete(company.id); }} className="aw-row-edit-button" aria-label={`编辑 ${company.name} ${company.role}`} aria-expanded={isEditing} aria-controls={editorId} onClick={() => beginEditing(company)}><PencilSimple />编辑</button></span>
              <span><MapPin />{company.location || "未注明"}</span>
              <span><strong>{categoryLabel(company.track)}</strong><small>{categoryLabel(company.channel)} · {company.batch || "批次未注明"}</small></span>
              <span>{shortDate(applicationDate(company))}</span>
              <span><b>{statusLabel(company)}</b></span>
              <span>{currentProgress(company)}</span>
              <button type="button" className="aw-table-action-link" onClick={() => runAfterDiscard(() => openQuickUpdate(company.id))}><strong>{next.label}</strong><small>{next.date ? `${shortDate(next.date)} ${next.time}` : "点击快速更新"}</small></button>
              <span><PriorityPill value={company.priority} /></span>
              <span className="aw-material-flags"><small className={company.jd || company.jdImage ? "is-ready" : ""}>JD</small><small className={company.notes ? "is-ready" : ""}>备注</small></span>
              <span>{company.jobUrl ? <a className="aw-job-link" href={company.jobUrl} target="_blank" rel="noreferrer"><LinkSimple />打开职位</a> : <small>待补充</small>}</span>
            </div>
            {isEditing && <ApplicationInlineEditor company={company} dirty={editingDirty} onDirty={() => setEditingDirty(true)} onCancel={() => { if (canDiscardEditor()) closeEditor(); }} onSave={(values) => submitEditor(company, values)} />}
          </div>;
        })}
        {!filtered.length && <EmptyState title="没有符合条件的投递" text="调整搜索或筛选条件，也可以添加一条新记录。" action="添加投递" onAction={openAdd} />}
      </div>
      <footer className="aw-table-footer"><span>{filtered.length ? `显示 ${pageStart + 1}–${Math.min(pageStart + APPLICATIONS_PAGE_SIZE, filtered.length)}，共 ${filtered.length} 条` : "暂无记录"}</span>{pageCount > 1 ? <nav className="aw-pagination" aria-label="投递记录分页"><button type="button" aria-label="上一页" disabled={currentPage === 1} onClick={() => runAfterDiscard(() => setPage((value) => Math.max(1, value - 1)))}><CaretLeft /></button><strong aria-live="polite">第 {currentPage} / {pageCount} 页</strong><button type="button" aria-label="下一页" disabled={currentPage === pageCount} onClick={() => runAfterDiscard(() => setPage((value) => Math.min(pageCount, value + 1)))}><CaretRight /></button></nav> : <span className="aw-table-hint">点击编辑可直接更新；点击公司查看完整资料</span>}</footer>
    </Panel>
  </div>;
}

function CompaniesPage({ companies, intelligence, selectCompany, openAdd, openNotifications }) {
  const groups = useMemo(() => {
    const map = new Map();
    companies.forEach((company) => { const key = company.name; if (!map.has(key)) map.set(key, []); map.get(key).push(company); });
    return [...map.entries()];
  }, [companies]);
  const counts = countStages(companies, intelligence);
  const verifiedOpportunities = intelligence.opportunities || [];
  return <div className="aw-page aw-companies-page"><PageHeader title="公司" subtitle="管理目标公司、岗位与研究情报。" action="添加公司" onAction={openAdd}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-toolbar"><SearchField value="" onChange={() => {}} placeholder="搜索公司…" /><FilterButton>行业</FilterButton><FilterButton>优先级</FilterButton><FilterButton>状态</FilterButton><FilterButton>保存列表</FilterButton><span className="aw-toolbar-spacer" /><FilterButton>最近更新</FilterButton><button className="aw-view-toggle"><SquaresFour /><Rows /></button></div>
    <div className="aw-company-metrics">{[[Star,"重点公司",groups.length,"purple"],[PaperPlaneTilt,"已投递",counts.applied,"blue"],[Users,"面试中",counts.interview,"green"],[Clock,"等待中",counts.screening,"orange"],[ListBullets,"全部岗位",companies.length,"gray"]].map(([Icon,label,value,tone]) => <div key={label}><i className={tone}><Icon /></i><strong>{value}<small>{label}</small></strong></div>)}</div>
    <div className="aw-company-grid">{groups.map(([name, positions]) => { const company = positions[0]; const bestStage = positions.map((item) => stageFor(item, intelligence)).sort((a,b) => STAGES.findIndex((stage) => stage.id === b) - STAGES.findIndex((stage) => stage.id === a))[0]; return <button className="aw-company-card" key={name} onClick={() => selectCompany(company.id)}><header><CompanyLogo company={company} size="lg" /><span><strong>{name}</strong><small>{positions.length} 个岗位</small></span><DotsThree /></header><StagePill stage={bestStage} /><div className="aw-card-divider" /><p>{company.jd ? company.jd.slice(0, 72) : "尚未补充 JD，可从情报或岗位详情继续完善。"}</p><footer><span><FileText />{positions.filter((item) => item.jd).length} 份 JD</span><span>{shortDate(itemDate(company))}</span></footer></button>; })}</div>
    <Panel title="公司情报" subtitle={`${verifiedOpportunities.length} 条已核验校招机会`} action={<button className="aw-text-button">查看全部 <ArrowRight /></button>}><div className="aw-research-grid">{verifiedOpportunities.slice(0,4).map((item,index) => <article key={item.id || index}><span className={`aw-soft-icon tone-${["green","blue","orange","purple"][index%4]}`}><TrendUp /></span><header><strong>{item.company || item.title}</strong><small>{item.role || item.title}</small></header><p>{item.summary || "已通过官方来源核验。"}</p><footer>{relativeTime(item.verifiedAt || item.updatedAt || intelligence.generatedAt)}</footer></article>)}{!verifiedOpportunities.length && <EmptyState title="暂无已核验机会" text="情报 Loop 完成后会显示在这里。" />}</div></Panel>
  </div>;
}

function answerBlocks(text, synthesis) {
  const source = String(text || "").trim();
  if (!source) return [];
  const markers = [...source.matchAll(/【([^】]+)】/g)];
  if (!markers.length) return [{ title: "经验资料", body: source }];
  const compact = (value) => String(value || "").replace(/\s+/g, "").replace(/[：:，,。.!！?？]/g, "");
  const synthesisKey = compact(synthesis);
  return markers.map((marker, index) => ({
    title: marker[1].trim(),
    body: source.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? source.length).trim(),
  })).filter(({ title, body }) => {
    if (!body) return false;
    if (!["资料结论", "面试官在考什么"].includes(title)) return true;
    const bodyKey = compact(body);
    return !synthesisKey || (!synthesisKey.includes(bodyKey) && !bodyKey.includes(synthesisKey));
  });
}

function RoleIntelligence({ brief }) {
  const sections = useMemo(() => {
    if (Array.isArray(brief?.experienceSections) && brief.experienceSections.length) return brief.experienceSections;
    const questions = Array.isArray(brief?.questions) ? brief.questions : [];
    return questions.length ? [{ id: "questions", title: "问题清单", summary: "根据当前岗位情报整理的问题。", questions: questions.map((question, index) => typeof question === "string" ? { id: `question-${index}`, question, answers: [] } : question) }] : [];
  }, [brief]);
  const [sectionId, setSectionId] = useState("");
  const [questionId, setQuestionId] = useState("");
  useEffect(() => {
    if (!sections.some((section) => (section.id || section.title) === sectionId)) setSectionId(sections[0]?.id || sections[0]?.title || "");
  }, [sections, sectionId]);
  const activeSection = sections.find((section) => (section.id || section.title) === sectionId) || sections[0];
  const questions = activeSection?.questions || [];
  useEffect(() => {
    if (!questions.some((question) => (question.id || question.question) === questionId)) setQuestionId(questions[0]?.id || questions[0]?.question || "");
  }, [questions, questionId]);
  const activeQuestion = questions.find((question) => (question.id || question.question) === questionId) || questions[0];
  if (!brief) return <EmptyState icon={Sparkle} title="还没有岗位情报" text="情报 Loop 会读取最新 JD 和公开来源，把流程、问题与答案归到这里。" />;
  if (!sections.length) return <EmptyState icon={Sparkle} title="还没有可练习的问题" text="下一轮情报 Loop 会按面试环节整理公开经验。" />;
  const totalQuestions = sections.reduce((total, section) => total + (section.questions?.length || 0), 0);
  const sourceMap = new Map((brief.sources || []).map((source) => [source.id, source]));
  const sourceIds = [...new Set((activeQuestion?.answers || []).flatMap((answer) => answer.sourceIds || []))];
  const relatedSources = sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
  const blocks = (activeQuestion?.answers || []).flatMap((answer) => answerBlocks(answer.text, activeQuestion.synthesis));
  return <div className="aw-role-intelligence">
    <section className="aw-intel-summary"><span><Sparkle /></span><div><small>岗位情报摘要</small><strong>{brief.summary}</strong><p>{brief.updatedAt ? `更新于 ${relativeTime(brief.updatedAt)}` : "更新时间未注明"} · {sections.length} 个环节 · {totalQuestions} 个问题 · {(brief.sources || []).length} 个来源</p></div></section>
    {(brief.signals || []).length > 0 && <div className="aw-signal-row">{brief.signals.map((signal) => <span key={signal}>{signal}</span>)}</div>}
    <div className="aw-intel-reader">
      <aside className="aw-intel-index">
        <header><small>INTERVIEW MAP</small><strong>按环节准备</strong><span>{totalQuestions} 个问题</span></header>
        <nav aria-label="面试环节">{sections.map((section, index) => { const id = section.id || section.title; const active = id === (activeSection.id || activeSection.title); return <button key={id} className={active ? "is-active" : ""} onClick={() => setSectionId(id)} aria-current={active ? "step" : undefined}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{section.title}</strong><small>{section.questions?.length || 0} 个问题</small></span><CaretRight /></button>; })}</nav>
      </aside>
      <section className="aw-intel-workspace">
        <header className="aw-intel-stage-header"><div><small>当前环节</small><h3>{activeSection.title}</h3><p>{activeSection.summary}</p></div><b>{questions.length}</b></header>
        <div className="aw-intel-stage-body">
          <nav className="aw-question-index" aria-label={`${activeSection.title}问题`}>{questions.map((question, index) => { const id = question.id || question.question; const active = id === (activeQuestion?.id || activeQuestion?.question); return <button key={id} className={active ? "is-active" : ""} onClick={() => setQuestionId(id)} aria-current={active ? "true" : undefined}><i>{String(index + 1).padStart(2, "0")}</i><span>{question.question}</span><CaretRight /></button>; })}</nav>
          <article className="aw-question-reader">
            <header><small>QUESTION {String(Math.max(0, questions.indexOf(activeQuestion)) + 1).padStart(2, "0")}</small><h2>{activeQuestion?.question}</h2></header>
            {activeQuestion?.synthesis && <section className="aw-question-takeaway"><span><Sparkle /></span><div><small>核心判断</small><p>{activeQuestion.synthesis}</p></div></section>}
            <div className="aw-answer-blocks">{blocks.length ? blocks.map((block, index) => <section key={`${block.title}-${index}`}><h3>{block.title}</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.body}</ReactMarkdown></section>) : <p className="aw-answer-empty">该问题暂时只有题目，下一轮情报更新会补充经验与准备建议。</p>}</div>
            {relatedSources.length > 0 && <footer className="aw-question-sources"><small>本题来源</small><div>{relatedSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id || source.url}><span><strong>{source.title || source.source || "公开来源"}</strong><small>{source.source}{source.year ? ` · ${source.year}` : ""}</small></span><ArrowRight /></a>)}</div></footer>}
          </article>
        </div>
      </section>
    </div>
    {(brief.sources || []).length > relatedSources.length && <details className="aw-role-sources"><summary>查看全部 {(brief.sources || []).length} 个公开来源 <CaretDown /></summary><div>{brief.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id || source.url}><span><strong>{source.title || source.source || "公开来源"}</strong><small>{source.source}{source.year ? ` · ${source.year}` : ""}</small></span><ArrowRight /></a>)}</div></details>}
  </div>;
}

function RolesPage({ companies, intelligence, selectedId, selectedCompany, selectCompany, openAdd, openNotifications, openRoleEditor, openNode, openQuickUpdate, adoptProgressSuggestion }) {
  const [localQuery, setLocalQuery] = useState("");
  const [tab, setTab] = useState("overview");
  const [companyListExpanded, setCompanyListExpanded] = useState(false);
  const [timelineHistoryExpanded, setTimelineHistoryExpanded] = useState(false);
  const groups = useMemo(() => {
    const map = new Map();
    companies.filter((company) => `${company.name} ${company.team} ${company.role} ${company.jd}`.toLowerCase().includes(localQuery.toLowerCase())).forEach((company) => {
      const identity = companyIdentity(company.name);
      if (!map.has(identity)) map.set(identity, { name: companyDisplayName(company.name), positions: [] });
      map.get(identity).positions.push(company);
    });
    return [...map.values()].map(({ name, positions }) => [name, positions]);
  }, [companies, localQuery]);
  const selected = selectedCompany || companies[0] || null;
  const selectedGroup = selected ? [companyDisplayName(selected.name),companies.filter((company)=>companyIdentity(company.name)===companyIdentity(selected.name))] : null;
  const displayGroups = selectedGroup ? (groups.some(([name])=>companyIdentity(name)===companyIdentity(selected.name)) ? groups.map((group)=>companyIdentity(group[0])===companyIdentity(selected.name)?selectedGroup:group) : [...groups,selectedGroup]) : groups;
  const hasCompanySearch = Boolean(localQuery.trim());
  const previewGroups = displayGroups.slice(0, ROLE_COMPANY_PREVIEW_SIZE);
  const visibleGroups = companyListExpanded || hasCompanySearch || displayGroups.length <= ROLE_COMPANY_PREVIEW_SIZE
    ? displayGroups
    : selectedGroup && !previewGroups.includes(selectedGroup) ? [...previewGroups, selectedGroup] : previewGroups;
  const brief = selected ? intelligence.roleBriefs?.[selected.id] : null;
  const stage = selected ? stageFor(selected, intelligence) : "wishlist";
  const intelligenceQuestionCount = Array.isArray(brief?.experienceSections) && brief.experienceSections.length
    ? brief.experienceSections.reduce((total, section) => total + (section.questions?.length || 0), 0)
    : (brief?.questions?.length || 0);
  const tabs = [["overview","概览"],["jd","详细 JD"],["process","具体流程"],["intelligence","情报与问题"],["notes","笔记"]];
  const sortedTimeline = [...(selected?.timeline || [])].sort((a,b)=>`${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));
  const pastTimeline = sortedTimeline.filter((node)=>node.date<dateKey(new Date()));
  const currentTimeline = sortedTimeline.filter((node)=>node.date>=dateKey(new Date()));
  const hiddenPastTimeline = pastTimeline.slice(0,Math.max(0,pastTimeline.length-5));
  const visibleTimeline = [...(timelineHistoryExpanded?pastTimeline:pastTimeline.slice(-5)),...currentTimeline];
  const healthIssues = selected ? applicationHealthIssues(selected).slice(0, 3) : [];
  useEffect(() => { setTab("overview"); setTimelineHistoryExpanded(false); }, [selected?.id]);
  return <div className="aw-page aw-roles-page">
    <PageHeader title="岗位" subtitle="以公司为目录，集中管理岗位、JD、流程、情报问题和准备材料。" action="添加岗位" onAction={openAdd}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-role-workspace">
      <section className="aw-role-library">
        <div className="aw-role-library-toolbar"><SearchField value={localQuery} onChange={setLocalQuery} placeholder="搜索公司、岗位或 JD" /><span>{groups.length} 家公司 · {companies.length} 个岗位</span></div>
        <nav id="aw-company-directory" className={`aw-company-nav ${companyListExpanded?"is-expanded":""}`} aria-label="公司选择">{visibleGroups.map(([name, positions]) => {
          const isActive = companyIdentity(name) === companyIdentity(selected?.name);
          const activePosition = isActive && positions.some((position) => position.id === selectedId) ? selected : positions[0];
          return <button key={name} className={isActive ? "is-active" : ""} onClick={() => selectCompany(activePosition.id)} aria-pressed={isActive} aria-label={`${name}，${positions.length} 个岗位，${positions.filter((item) => item.jd).length} 份 JD`}><CompanyLogo company={positions[0]} size="md" /><span><strong>{name}</strong><small>{positions.length} 岗 · {positions.filter((item) => item.jd).length} JD</small></span></button>;
        })}</nav>
        {!hasCompanySearch&&displayGroups.length>ROLE_COMPANY_PREVIEW_SIZE&&<button type="button" className="aw-library-disclosure" aria-expanded={companyListExpanded} aria-controls="aw-company-directory" onClick={()=>setCompanyListExpanded((value)=>!value)}><span>{companyListExpanded?"收起公司目录":`展开全部 ${displayGroups.length} 家公司`}</span><CaretDown/></button>}
        {selectedGroup?.[1]?.length > 1 && <div className="aw-company-role-switcher"><span>{selectedGroup[0]} 的岗位</span>{selectedGroup[1].map((company) => <button key={company.id} className={company.id === selectedId ? "is-active" : ""} onClick={() => selectCompany(company.id)}><strong>{company.role}</strong><StagePill stage={stageFor(company, intelligence)} /></button>)}</div>}
      </section>
      <main className="aw-role-detail">{selected ? <>
        <header className="aw-role-hero"><div><CompanyLogo company={selected} size="lg" /><span><small>{selected.name}</small><h2>{selected.role}</h2><p>{selected.team || "团队未注明"}{selected.location ? ` · ${selected.location}` : ""}</p></span></div><div><PriorityPill value={selected.priority} /><StagePill stage={stage} /><button className="aw-outline-button" onClick={()=>openQuickUpdate(selected.id)}><TrendUp/>快速更新</button><TimelineAction label="添加节点" onClick={() => openNode(selected.id)} /><button className="aw-outline-button" onClick={() => openRoleEditor(selected)}><FileText />编辑资料</button></div></header>
        <nav className="aw-role-tabs">{tabs.map(([id,label]) => <button key={id} className={tab===id?"is-active":""} onClick={()=>setTab(id)}>{label}{id==="intelligence"&&intelligenceQuestionCount?<b>{intelligenceQuestionCount}</b>:null}</button>)}</nav>
        <div className="aw-role-tab-content">
          {tab === "overview" && <div className="aw-role-overview"><Panel title="投递信息"><div className="aw-role-tracker-facts"><span><small>赛道 / 渠道</small><b>{categoryLabel(selected.track)} · {categoryLabel(selected.channel)}</b></span><span><small>招聘批次</small><b>{selected.batch || "未注明"}</b></span><span><small>投递时间</small><b>{shortDate(applicationDate(selected))}</b></span><span><small>当前状态</small><b>{statusLabel(selected)}</b></span><span><small>当前进度</small><b>{currentProgress(selected)}</b></span><span><small>下一步行动 / DDL</small><b>{nextActionSummary(selected).label}{nextActionSummary(selected).date ? ` · ${shortDate(nextActionSummary(selected).date)}` : ""}</b></span><span><small>重视程度</small><PriorityPill value={selected.priority} /></span><span><small>等待天数</small><b>{waitingDays(selected) === null ? "未开始" : `${waitingDays(selected)} 天`}</b></span><span><small>城市</small><b>{selected.location || "未注明"}</b></span><span><small>职位链接</small>{selected.jobUrl ? <a href={selected.jobUrl} target="_blank" rel="noreferrer"><LinkSimple />打开原职位</a> : <b>待补充</b>}</span></div></Panel>{healthIssues.length>0&&<Panel title="记录检查" subtitle="只提示可能影响判断的地方，不会自动改你的状态或进度。"><div className="aw-health-list">{healthIssues.map((issue)=>issue.code==="progress-timeline-conflict"&&issue.suggestedProgress?<div key={`${issue.code}-${issue.message}`} className={`aw-health-suggestion severity-${issue.severity}`}><Bell/><span><strong>{issue.message}</strong><small>依据：{shortDate(issue.suggestedNodeDate)} · 已发生的时间节点</small></span><div><button type="button" onClick={()=>setTab("process")}>查看时间线</button><button type="button" className="is-primary" onClick={()=>adoptProgressSuggestion(selected.id,issue.suggestedProgress)}>采纳为“{issue.suggestedProgress}”</button></div></div>:<button type="button" key={`${issue.code}-${issue.message}`} onClick={()=>openQuickUpdate(selected.id)} className={`severity-${issue.severity}`}><Bell/><span><strong>{issue.message}</strong><small>点击快速更新</small></span><ArrowRight/></button>)}</div></Panel>}<div className="aw-role-overview-grid"><Panel title="岗位资料"><div className="aw-role-facts"><span><FileText /><b>{selected.jd || selected.jdImage ? "JD 已完整" : "等待补充 JD"}</b></span><span><MapPin /><b>{selected.location || "地点未注明"}</b></span><span><CalendarBlank /><b>{(selected.timeline || []).length} 个个人节点</b></span><span><Sparkle /><b>{brief ? "公开情报已覆盖" : "等待情报更新"}</b></span></div></Panel><Panel title="公开情报"><div className="aw-role-brief-preview"><strong>{brief?.summary || "下一轮情报搜索会围绕这个岗位收集公开流程、经验与来源。"}</strong><button className="aw-text-button" onClick={()=>setTab("intelligence")}>查看问题与答案 <ArrowRight /></button></div></Panel></div><Panel title="岗位描述预览"><div className="aw-role-copy">{selected.jd ? `${selected.jd.slice(0, 700)}${selected.jd.length > 700 ? "…" : ""}` : selected.jdImage ? "已保存 JD 截图，点击“详细 JD”查看完整图片。" : "尚未补充 JD。点击“编辑资料”粘贴真实职位描述。"}</div></Panel></div>}
          {tab === "jd" && <div className="aw-document-view"><header><div><small>JOB DESCRIPTION</small><h2>{selected.name} · {selected.role}</h2></div><button className="aw-outline-button" onClick={() => openRoleEditor(selected)}><FileText />编辑 JD</button></header><article>{selected.jd && <div className="aw-jd-text">{selected.jd}</div>}{selected.jdImage && <img className="aw-jd-image" src={selected.jdImage} alt={`${selected.name} ${selected.role} JD 截图`}/>} {!selected.jd&&!selected.jdImage&&"尚未补充 JD。"}</article></div>}
          {tab === "process" && <div className="aw-process-detail"><Panel title="我的投递时间轴" subtitle="可从首页、总表、岗位页或日历添加；保存一次后自动同步。" action={<TimelineAction label="添加节点" onClick={() => openNode(selected.id)} />}><div className="aw-personal-timeline">{hiddenPastTimeline.length>0&&<button type="button" className="aw-timeline-history-toggle" aria-expanded={timelineHistoryExpanded} onClick={()=>setTimelineHistoryExpanded((value)=>!value)}><CalendarBlank/><span><strong>{timelineHistoryExpanded?"收起较早记录":`查看更早 ${hiddenPastTimeline.length} 个节点`}</strong><small>未来安排始终保持可见</small></span><CaretDown/></button>}{visibleTimeline.length ? visibleTimeline.map((node,index)=><button key={node.id||index} onClick={()=>openNode(selected.id,node.date,node)}><i/><span><small>{shortDate(node.date)} {node.time}</small><strong>{nodeName(node)}{node.review&&<em className="aw-review-badge">已复盘</em>}</strong><p>{node.note || "没有额外备注"}</p></span></button>) : <EmptyState title="还没有个人节点" text="记录投递、测评或面试日期，后续安排会集中显示在所有时间视图中。" action="添加节点" onAction={() => openNode(selected.id)} />}</div></Panel><Panel title="公开招聘流程" subtitle="来自公开职位与候选人经验，仅作为准备参考。"><div className="aw-public-process">{brief?.processTimeline?.length ? brief.processTimeline.map((node,index)=><article key={node.id||index}><span>{String(index+1).padStart(2,"0")}</span><div><header><strong>{node.title}</strong><em className={`confidence-${node.confidence}`}>{node.confidence === "high" ? "高可信" : node.confidence === "medium" ? "中可信" : "低可信"}</em></header><small>{node.dateLabel || "日期待确认"}</small><p>{node.description}</p><footer>{node.basis}</footer></div></article>) : <EmptyState title="还没有公开流程" text="情报 Loop 找到可靠信息后会按阶段整理到这里。" />}</div></Panel></div>}
          {tab === "intelligence" && <RoleIntelligence brief={brief} />}
          {tab === "notes" && <div className="aw-document-view aw-notes-inline"><header><div><small>ROLE NOTES</small><h2>岗位笔记</h2></div><button className="aw-outline-button" onClick={() => openRoleEditor(selected)}><Note />编辑笔记</button></header><article>{selected.notes || "尚未记录个人判断、联系人或准备重点。"}</article></div>}
        </div>
      </> : <EmptyState title="还没有岗位" text="添加第一个岗位后，可在这里管理 JD、流程、情报与准备。" action="添加岗位" onAction={openAdd} />}</main>
    </div>
  </div>;
}

function PipelinePage({ companies, intelligence, selectCompany, openAdd, openNotifications }) {
  const counts = countStages(companies, intelligence);
  return <div className="aw-page aw-pipeline-page"><PageHeader title="流程" subtitle="在每个阶段跟踪你的申请进展。" action="添加申请" onAction={openAdd}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-toolbar"><SearchField value="" onChange={() => {}} placeholder="搜索申请…" /><FilterButton>全部阶段</FilterButton><FilterButton>全部公司</FilterButton><FilterButton>全部优先级</FilterButton><span className="aw-toolbar-spacer" /><button className="aw-view-toggle"><SquaresFour /><Rows /></button></div>
    <div className="aw-stage-strip">{STAGES.map((stage) => <div key={stage.id}><span><i className={`tone-${stage.color}`} />{stage.label}</span><b>{counts[stage.id]}</b><em><i className={`tone-${stage.color}`} style={{ width: `${Math.max(12, counts[stage.id] / Math.max(companies.length,1) * 100)}%` }} /></em></div>)}<strong>{companies.length}<small>全部</small></strong></div>
    <div className="aw-kanban">{STAGES.map((stage) => { const items = companies.filter((company) => stageFor(company, intelligence) === stage.id); return <section key={stage.id} className={`aw-kanban-column tone-${stage.color}`}><header><span><i />{stage.label}</span><b>{items.length}</b><DotsThree /></header>{items.map((company) => { const node = nextNode(company); return <button className="aw-kanban-card" key={company.id} onClick={() => selectCompany(company.id)}><div><CompanyLogo company={company} size="sm" /><span><strong>{company.role}</strong><small>{company.name}</small></span></div><p>{node ? `下一步：${nodeName(node)}` : company.jd ? "岗位资料已就绪" : "待补充岗位资料"}</p><footer><span><CalendarBlank />{node ? shortDate(node.date) : shortDate(itemDate(company))}</span><StagePill stage={stage.id} /></footer></button>; })}<button className="aw-add-inline" onClick={openAdd}><Plus />添加申请</button></section>; })}</div>
  </div>;
}

function buildCalendar(date, companies) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = first.getDay();
  const start = new Date(first); start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); const key = dateKey(day); const events = companies.flatMap((company) => scheduleNodes(company).filter((node) => node.date === key).map((node) => ({ company, node }))).sort((a,b)=>String(a.node.time||"").localeCompare(String(b.node.time||""))); return { day, key, events, current: day.getMonth() === date.getMonth() }; });
}

const CALENDAR_EVENT_LEGEND = [
  { id: "interview", label: "面试", tone: "green" },
  { id: "assessment", label: "笔试 / 测评", tone: "purple" },
  { id: "offer", label: "Offer / 签约", tone: "orange" },
  { id: "deadline", label: "截止 / 跟进", tone: "red" },
  { id: "other", label: "其他节点", tone: "blue" },
];

const GANTT_DAY_WIDTH = 58;
const GANTT_ROLE_WIDTH = 210;
const GANTT_WINDOW_DAYS = 112;
const GANTT_PAST_DAYS = 56;
const GANTT_SHIFT_DAYS = 42;
const GANTT_EDGE_DAYS = 8;

function CalendarPage({ companies, intelligence, openNode, openAdd, openNotifications }) {
  const [month, setMonth] = useState(new Date());
  const cells = buildCalendar(month, companies);
  const future = companies.flatMap((company) => (company.timeline || []).map((node) => ({ company, node }))).filter(({node}) => node.date >= dateKey(new Date())).sort((a,b) => a.node.date.localeCompare(b.node.date));
  return <div className="aw-page aw-calendar-page"><PageHeader title="日历" action="新建日程" onAction={() => openNode("", dateKey(new Date()))}><SearchField value="" onChange={() => {}} placeholder="搜索日程" /><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-calendar-tabs"><button className="is-active">月</button><button>周</button><button>日程</button><div><IconButton label="上个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1,1))}><CaretLeft /></IconButton><strong>{month.getFullYear()}年 {month.getMonth()+1}月</strong><IconButton label="下个月" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1,1))}><CaretRight /></IconButton><button className="aw-outline-button" onClick={() => setMonth(new Date())}>今天</button></div></div>
    <div className="aw-calendar-layout"><Panel className="aw-calendar-main"><div className="aw-weekdays">{["周日","周一","周二","周三","周四","周五","周六"].map((day) => <span key={day}>{day}</span>)}</div><div className="aw-month-grid">{cells.map((cell) => <button key={cell.key} className={`${cell.current ? "" : "is-muted"} ${cell.key === dateKey(new Date()) ? "is-today" : ""}`} onClick={() => openNode("", cell.key)}><span>{cell.day.getDate()}</span>{cell.events.slice(0,2).map(({company,node},index) => <em className={`event-${calendarEventType(node)}`} key={`${company.id}-${node.id || index}`} onClick={(event) => { event.stopPropagation(); openNode(company.id, cell.key, node); }}><b>{node.time || nodeName(node)}</b><small>{company.name}</small></em>)}{cell.events.length > 2 && <small>+{cell.events.length-2}</small>}</button>)}</div></Panel>
      <aside className="aw-right-stack"><Panel title="即将到来" action={<button className="aw-text-button">查看全部</button>}>{future.length ? <div className="aw-upcoming-list">{future.slice(0,5).map(({company,node}) => <button key={`${company.id}-${node.id}`} onClick={() => openNode(company.id,node.date,node)}><span className="aw-soft-icon"><CalendarBlank /></span><span><strong>{nodeName(node)}</strong><small>{company.name}</small></span><em>{shortDate(node.date)}<small>{node.time}</small></em></button>)}</div> : <EmptyState title="暂无日程" text="添加面试、测评或截止日期。" />}</Panel><Panel title="今日日程"><EmptyState icon={CalendarBlank} title={cells.find((cell) => cell.key === dateKey(new Date()))?.events.length ? `${cells.find((cell) => cell.key === dateKey(new Date())).events.length} 项安排` : "今天没有日程"} text="保持专注，也给自己留一点空间。" action="新建日程" onAction={() => openNode("",dateKey(new Date()))} /></Panel><Panel title="图例"><div className="aw-legend-grid"><span><i className="tone-green" />面试</span><span><i className="tone-orange" />跟进</span><span><i className="tone-purple" />测评</span><span><i className="tone-red" />截止</span></div></Panel></aside>
    </div>
  </div>;
}

function SchedulePage({ companies, intelligence, openNode, openNotifications, selectCompany, selectedId, openQuickUpdate }) {
  const [mode, setMode] = useState("timeline");
  const [ganttStart, setGanttStart] = useState(() => startOfWeek(addDays(new Date(), -GANTT_PAST_DAYS)));
  const [month, setMonth] = useState(new Date());
  const [includeArchived, setIncludeArchived] = useState(false);
  const [visibleIds, setVisibleIds] = useState(() => companies.filter((company) => !isArchivedApplication(company)).map((company) => company.id));
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [ganttPage, setGanttPage] = useState(1);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => dateKey(new Date()));
  const [calendarAgendaExpanded, setCalendarAgendaExpanded] = useState(false);
  const knownCompanyIdsRef = useRef(new Set(companies.map((company)=>company.id)));
  const [visibleRange, setVisibleRange] = useState({ start: "", end: "" });
  const visibleRangeRef = useRef({ start: "", end: "" });
  const ganttScrollRef = useRef(null);
  const ganttPositionedRef = useRef(false);
  const ganttShiftRef = useRef(null);
  const ganttShiftLockedRef = useRef(false);
  useEffect(() => { const validIds=new Set(companies.map((company)=>company.id));const newIds=companies.filter((company)=>!knownCompanyIdsRef.current.has(company.id)&&(!isArchivedApplication(company)||includeArchived)).map((company)=>company.id);knownCompanyIdsRef.current=validIds;setVisibleIds((current)=>[...new Set([...current.filter((id)=>validIds.has(id)),...newIds])]); }, [companies,includeArchived]);
  const days = useMemo(() => Array.from({ length: GANTT_WINDOW_DAYS }, (_, index) => addDays(ganttStart, index)), [ganttStart]);
  const availableScheduleCompanies = useMemo(() => companies.filter((company)=>includeArchived||!isArchivedApplication(company)),[companies,includeArchived]);
  const scheduleCompanies = useMemo(() => availableScheduleCompanies.filter((company)=>visibleIds.includes(company.id)),[availableScheduleCompanies,visibleIds]);
  const cells = useMemo(() => buildCalendar(month, scheduleCompanies), [month, scheduleCompanies]);
  const counts = countStages(scheduleCompanies, intelligence);
  const ganttPageCount = Math.max(1,Math.ceil(scheduleCompanies.length/GANTT_ROLE_PREVIEW_SIZE));
  const currentGanttPage = Math.min(ganttPage,ganttPageCount);
  const displayedTimelineCompanies = scheduleCompanies.slice((currentGanttPage-1)*GANTT_ROLE_PREVIEW_SIZE,currentGanttPage*GANTT_ROLE_PREVIEW_SIZE);
  const timelineIndex = useMemo(() => new Map(scheduleCompanies.map((company)=>{const byDate=new Map();scheduleNodes(company).forEach((node)=>{const nodes=byDate.get(node.date)||[];nodes.push(node);byDate.set(node.date,nodes);});byDate.forEach((nodes)=>nodes.sort((a,b)=>String(a.time||"").localeCompare(String(b.time||""))));return [company.id,byDate];})),[scheduleCompanies]);
  const selectedCalendarCell = cells.find((cell) => cell.key === selectedCalendarDate);
  const calendarAgendaEvents = selectedCalendarCell?.events || [];
  const displayedCalendarEvents = calendarAgendaExpanded ? calendarAgendaEvents : calendarAgendaEvents.slice(0,8);
  useEffect(()=>{const index=scheduleCompanies.findIndex((company)=>company.id===selectedId);if(index>=0)setGanttPage(Math.floor(index/GANTT_ROLE_PREVIEW_SIZE)+1);else setGanttPage((current)=>Math.min(current,ganttPageCount));},[selectedId,scheduleCompanies,ganttPageCount]);
  useEffect(()=>{if(!cells.some((cell)=>cell.key===selectedCalendarDate&&cell.current))setSelectedCalendarDate(dateKey(new Date(month.getFullYear(),month.getMonth(),1)));},[month,cells,selectedCalendarDate]);
  useEffect(()=>setCalendarAgendaExpanded(false),[selectedCalendarDate]);

  const updateVisibleRange = useCallback((element) => {
    if (!element || !days.length) return;
    const firstIndex = Math.max(0, Math.min(days.length - 1, Math.floor(element.scrollLeft / GANTT_DAY_WIDTH)));
    const visibleDayCount = Math.max(1, Math.ceil((element.clientWidth - GANTT_ROLE_WIDTH) / GANTT_DAY_WIDTH));
    const lastIndex = Math.min(days.length - 1, firstIndex + visibleDayCount - 1);
    const next = { start: dateKey(days[firstIndex]), end: dateKey(days[lastIndex]) };
    if (visibleRangeRef.current.start === next.start && visibleRangeRef.current.end === next.end) return;
    visibleRangeRef.current = next;
    setVisibleRange(next);
  }, [days]);

  const scrollToDay = useCallback((target, behavior = "auto") => {
    const element = ganttScrollRef.current;
    if (!element) return false;
    const targetKey = dateKey(target);
    const index = days.findIndex((day) => dateKey(day) === targetKey);
    if (index < 0) return false;
    const viewportWidth = Math.max(GANTT_DAY_WIDTH, element.clientWidth - GANTT_ROLE_WIDTH);
    element.scrollTo({
      left: Math.max(0, index * GANTT_DAY_WIDTH - viewportWidth / 2 + GANTT_DAY_WIDTH / 2),
      behavior,
    });
    updateVisibleRange(element);
    return true;
  }, [days, updateVisibleRange]);

  useLayoutEffect(() => {
    if (mode !== "timeline") return;
    const element = ganttScrollRef.current;
    if (!element) return;
    const pending = ganttShiftRef.current;
    if (pending?.type === "preserve") {
      element.scrollLeft = Math.max(0, pending.scrollLeft + pending.adjustBy);
      ganttShiftRef.current = null;
      ganttShiftLockedRef.current = false;
      updateVisibleRange(element);
      return;
    }
    if (!pending && ganttPositionedRef.current) {
      updateVisibleRange(element);
      return;
    }
    const target = pending?.target ? new Date(`${pending.target}T12:00:00`) : new Date();
    scrollToDay(target);
    ganttShiftRef.current = null;
    ganttShiftLockedRef.current = false;
    ganttPositionedRef.current = true;
  }, [ganttStart, mode, scrollToDay, updateVisibleRange]);

  const handleGanttScroll = (event) => {
    const element = event.currentTarget;
    updateVisibleRange(element);
    if (ganttShiftLockedRef.current) return;
    const threshold = GANTT_EDGE_DAYS * GANTT_DAY_WIDTH;
    if (element.scrollLeft <= threshold) {
      ganttShiftLockedRef.current = true;
      ganttShiftRef.current = { type: "preserve", scrollLeft: element.scrollLeft, adjustBy: GANTT_SHIFT_DAYS * GANTT_DAY_WIDTH };
      setGanttStart((current) => addDays(current, -GANTT_SHIFT_DAYS));
      return;
    }
    if (element.scrollLeft + element.clientWidth >= element.scrollWidth - threshold) {
      ganttShiftLockedRef.current = true;
      ganttShiftRef.current = { type: "preserve", scrollLeft: element.scrollLeft, adjustBy: -GANTT_SHIFT_DAYS * GANTT_DAY_WIDTH };
      setGanttStart((current) => addDays(current, GANTT_SHIFT_DAYS));
    }
  };

  const scrollGanttByDays = (offset) => {
    const element = ganttScrollRef.current;
    if (!element) return;
    element.scrollBy({ left: offset * GANTT_DAY_WIDTH, behavior: "smooth" });
  };

  const scrollGanttToToday = () => {
    if (scrollToDay(new Date(), "smooth")) return;
    ganttShiftLockedRef.current = true;
    ganttShiftRef.current = { type: "target", target: dateKey(new Date()) };
    setGanttStart(startOfWeek(addDays(new Date(), -GANTT_PAST_DAYS)));
  };

  const toggleArchived = (event) => {
    const checked = event.target.checked;
    setIncludeArchived(checked);
    if (checked) setVisibleIds((current)=>[...new Set([...current,...companies.filter(isArchivedApplication).map((company)=>company.id)])]);
  };

  const openNewScheduleNode = (date) => openNode("",date);

  return <div className="aw-page aw-schedule-page">
    <PageHeader title="时间规划" subtitle="把个人时间轴、甘特图和日历放在同一个连续视图里。" action="添加时间节点" onAction={() => openNewScheduleNode(dateKey(new Date()))}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-schedule-toolbar"><div className="aw-segmented"><button className={mode==="timeline"?"is-active":""} onClick={()=>setMode("timeline")}><Kanban />时间轴与甘特图</button><button className={mode==="calendar"?"is-active":""} onClick={()=>setMode("calendar")}><CalendarBlank />日历</button></div>{mode === "timeline" ? <div><IconButton label="向前滚动两周" onClick={()=>scrollGanttByDays(-14)}><CaretLeft /></IconButton><button className="aw-outline-button" onClick={scrollGanttToToday}>今天</button><IconButton label="向后滚动两周" onClick={()=>scrollGanttByDays(14)}><CaretRight /></IconButton></div> : <div><IconButton label="上个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><CaretLeft /></IconButton><strong>{month.getFullYear()}年 {month.getMonth()+1}月</strong><IconButton label="下个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><CaretRight /></IconButton></div>}</div>
    <section className="aw-timeline-filter-panel"><div className="aw-timeline-filter-bar"><button type="button" className="aw-timeline-filter-summary" aria-expanded={filtersExpanded} aria-controls="aw-timeline-filter-options" onClick={()=>setFiltersExpanded((value)=>!value)}><span><FunnelSimple/>显示岗位</span><small>{scheduleCompanies.length} / {availableScheduleCompanies.length} 个岗位已显示</small><CaretDown/></button><label className="aw-timeline-archive-toggle"><input type="checkbox" checked={includeArchived} onChange={toggleArchived}/><span>包含已结束</span></label></div>{filtersExpanded&&<div id="aw-timeline-filter-options" className="aw-timeline-filter-options"><div className="aw-timeline-filter-actions"><button type="button" onClick={()=>setVisibleIds((current)=>[...new Set([...current,...availableScheduleCompanies.map((company)=>company.id)])])}>全选当前范围</button><button type="button" onClick={()=>{const availableIds=new Set(availableScheduleCompanies.map((company)=>company.id));setVisibleIds((current)=>current.filter((id)=>!availableIds.has(id)));}}>清空当前范围</button></div><div className="aw-timeline-filters">{availableScheduleCompanies.map((company) => <label key={company.id} className={visibleIds.includes(company.id)?"is-active":""}><input type="checkbox" checked={visibleIds.includes(company.id)} onChange={()=>setVisibleIds((current)=>current.includes(company.id)?current.filter((id)=>id!==company.id):[...current,company.id])}/><CompanyLogo company={company} size="sm" /><small>{company.name} · {company.role}{isArchivedApplication(company)?" · 已结束":""}</small><Check /></label>)}{!availableScheduleCompanies.length&&<span>当前没有可显示的岗位</span>}</div></div>}</section>
    {mode === "timeline" ? <>
      <Panel className="aw-gantt-panel"><div className="aw-gantt-scroll" ref={ganttScrollRef} onScroll={handleGanttScroll}><div className="aw-gantt" style={{"--gantt-days":days.length}}><div className="aw-gantt-corner"><strong>岗位</strong><small>{visibleRange.start ? `${shortDate(visibleRange.start)} 至 ${shortDate(visibleRange.end)}` : "连续时间轴"}</small></div><div className="aw-gantt-dates">{days.map((day)=><div key={dateKey(day)} className={dateKey(day)===dateKey(new Date())?"is-today":""}><small>{["日","一","二","三","四","五","六"][day.getDay()]}</small><strong>{day.getDate()}</strong></div>)}</div>{displayedTimelineCompanies.map((company)=><div className="aw-gantt-row" key={company.id}><button className="aw-gantt-role" onClick={()=>selectCompany(company.id)}><CompanyLogo company={company} size="sm" /><span><strong>{company.name}</strong><small>{company.role}</small></span><StagePill stage={stageFor(company,intelligence)}/></button><div className="aw-gantt-track">{days.map((day)=>{const key=dateKey(day);const nodes=timelineIndex.get(company.id)?.get(key)||[];const node=nodes[0];return <button key={key} className={`${key===dateKey(new Date())?"is-today":""} ${node?"has-node":""} ${node?.isAction?"is-action":""}`} onClick={()=>node?.isAction?openQuickUpdate(company.id):openNode(company.id,key,node)} aria-label={node?`${nodeName(node)}${nodes.length>1?`，当天共 ${nodes.length} 个节点`:""}`:`${shortDate(key)} 添加节点`}>{node?<span><i/><strong>{nodeName(node)}</strong><small>{nodes.length>1?`${node.time?`${node.time} · `:""}+${nodes.length-1}`:node.isAction?"行动 DDL":node.time}</small></span>:<Plus/>}</button>;})}</div></div>)}{!displayedTimelineCompanies.length&&<div className="aw-gantt-empty"><Archive/><strong>没有显示中的岗位</strong><small>展开“显示岗位”并选择需要查看的岗位。</small></div>}</div></div><footer className="aw-gantt-help"><span><i/>时间节点与行动 DDL</span><span>左右滑动自动加载更多日期</span><span>同日多个节点会显示 +N</span>{ganttPageCount>1&&<nav className="aw-gantt-pagination" aria-label="甘特图岗位分页"><button type="button" aria-label="上一组岗位" disabled={currentGanttPage===1} onClick={()=>setGanttPage((value)=>Math.max(1,value-1))}><CaretLeft/></button><strong aria-live="polite">岗位 {currentGanttPage} / {ganttPageCount} 组</strong><button type="button" aria-label="下一组岗位" disabled={currentGanttPage===ganttPageCount} onClick={()=>setGanttPage((value)=>Math.min(ganttPageCount,value+1))}><CaretRight/></button></nav>}</footer></Panel>
    </> : <div className="aw-calendar-layout aw-calendar-merged">
      <Panel className="aw-calendar-main"><div className="aw-weekdays">{["周日","周一","周二","周三","周四","周五","周六"].map((day)=><span key={day}>{day}</span>)}</div><div className="aw-month-grid">{cells.map((cell)=><button key={cell.key} aria-pressed={selectedCalendarDate===cell.key} aria-label={`${shortDate(cell.key)}，${cell.events.length} 项安排，点击查看全部`} className={`${cell.current?"":"is-muted"} ${cell.key===dateKey(new Date())?"is-today":""} ${selectedCalendarDate===cell.key?"is-selected-day":""}`} onClick={()=>setSelectedCalendarDate(cell.key)}><span>{cell.day.getDate()}</span>{cell.events.slice(0,3).map(({company,node},index)=><em className={`event-${calendarEventType(node)}`} key={`${company.id}-${node.id||index}`}><b>{node.time?`${node.time} · ${nodeName(node)}`:nodeName(node)}</b><small>{company.name}</small></em>)}{cell.events.length>3&&<small className="aw-calendar-overflow">+{cell.events.length-3} 更多</small>}</button>)}</div></Panel>
      <aside className="aw-right-stack"><Panel title="当日日程" subtitle={shortDate(selectedCalendarDate)} action={<TimelineAction label="添加" onClick={()=>openNewScheduleNode(selectedCalendarDate)}/>}>{calendarAgendaEvents.length?<><div id="aw-calendar-agenda" className={`aw-upcoming-list aw-calendar-agenda-list ${calendarAgendaExpanded?"is-expanded":""}`}>{displayedCalendarEvents.map(({company,node},index)=><button key={`${company.id}-${node.id||index}`} onClick={()=>node.isAction?openQuickUpdate(company.id):openNode(company.id,node.date,node)}><span className="aw-soft-icon"><CalendarBlank/></span><span><strong>{nodeName(node)}</strong><small>{company.name} · {company.role}</small></span><em>{node.isAction?"行动 DDL":node.time||"全天"}</em></button>)}</div>{calendarAgendaEvents.length>8&&<button type="button" className="aw-agenda-more" aria-expanded={calendarAgendaExpanded} aria-controls="aw-calendar-agenda" onClick={()=>setCalendarAgendaExpanded((value)=>!value)}>{calendarAgendaExpanded?"收起当日日程":`查看其余 ${calendarAgendaEvents.length-8} 项`}<CaretDown/></button>}</>:<EmptyState icon={CalendarBlank} title="这天还没有安排" text="选择其他日期，或添加一个新的时间节点。"/>}</Panel><Panel title="阶段概览"><div className="aw-summary-list">{STAGES.slice(1).map((stage)=><div key={stage.id}><span><i className={`tone-${stage.color}`}/>{stage.label}</span><b>{counts[stage.id]}</b></div>)}</div></Panel><Panel title="事件类型"><div className="aw-legend-grid">{CALENDAR_EVENT_LEGEND.map((item)=><span key={item.id}><i className={`tone-${item.tone}`}/>{item.label}</span>)}</div></Panel></aside>
    </div>}
  </div>;
}

function DiscoveryPage({ companies, intelligence, selectedCompany, openNotifications }) {
  const opportunities = intelligence.opportunities || [];
  return <div className="aw-page aw-discovery-page">
    <PageHeader title="情报" subtitle="搜索互联网、核验来源、自动筛选新岗位，并把面试信息整理成可直接准备的问题。"><div className="aw-loop-badge"><i/><span><strong>情报 Loop</strong><small>{intelligence.automation?.status === "active" ? intelligence.automation.schedule : "未启用"}</small></span></div><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <CareerOpsView selectedRole={selectedCompany} roles={companies} surface="discovery" embedded />
    <div className="aw-discovery-summary"><Panel title="已筛选的新机会" subtitle={`${opportunities.length} 条已核验校招全职岗位`}><div className="aw-opportunity-list">{opportunities.length ? opportunities.map((item,index)=><a href={item.url} target="_blank" rel="noreferrer" key={item.id||index}><OpportunityLogo opportunity={item}/><p><strong>{item.company || "公司未注明"} · {item.title || item.role}</strong><small>{item.summary || "已通过公开来源核验"}</small><em>{item.location || "地点未注明"} · {item.source || "来源已记录"}</em></p><ArrowRight /></a>) : <EmptyState title="还没有已核验的新机会" text="运行上方岗位扫描后，只有符合校招全职范围且来源可靠的岗位会出现在这里。" />}</div></Panel><Panel title="岗位情报覆盖" subtitle={`${Object.keys(intelligence.roleBriefs || {}).length}/${companies.length} 个岗位`}><div className="aw-brief-coverage">{companies.map((company)=><div key={company.id}><CompanyLogo company={company} size="sm"/><span><strong>{company.name}</strong><small>{company.role}</small></span>{intelligence.roleBriefs?.[company.id]?<Check/>:<Clock/>}</div>)}</div></Panel></div>
  </div>;
}

function LoopRunsPage({ loopRuns, openNotifications }) {
  const runs = Array.isArray(loopRuns?.runs) ? loopRuns.runs : [];
  const [selectedId, setSelectedId] = useState(runs[0]?.id || "");
  useEffect(() => { if (!runs.some((run) => run.id === selectedId)) setSelectedId(runs[0]?.id || ""); }, [runs, selectedId]);
  const run = runs.find((item) => item.id === selectedId) || runs[0] || null;
  const counts = run?.counts || {};
  const xhsRoles = run?.xiaohongshu?.roles || [];
  const statusLabel = { success: "已完成", partial: "部分完成", blocked: "受阻", unavailable: "不可用", running: "运行中" };
  const stageStatusLabel = { covered: "已覆盖", partial: "旁证", gap: "待补", blocked: "受阻" };
  return <div className="aw-page aw-loop-page">
    <PageHeader title="Loop 日报" subtitle="查看每天搜到了什么、哪些官网状态有变化，以及每个岗位的面经核验进度。"><div className={`aw-loop-state is-${run?.status || "empty"}`}><i/><span>{run ? statusLabel[run.status] || run.status : "等待首次运行"}</span></div><IconButton label="通知" onClick={openNotifications}><BellSimple/></IconButton></PageHeader>
    {!run ? <EmptyState icon={Sparkle} title="还没有 Loop 日报" text="每日任务完成后，无论成功、受阻还是没有变化，都会在这里留下记录。"/> : <div className="aw-loop-layout">
      <aside className="aw-loop-history"><header><strong>运行记录</strong><span>{runs.length} 次</span></header>{runs.map((item)=><button key={item.id} className={item.id===run.id?"is-active":""} onClick={()=>setSelectedId(item.id)}><i className={`is-${item.status}`}/><span><strong>{new Date(item.completedAt || item.startedAt).toLocaleDateString("zh-CN",{month:"long",day:"numeric"})}</strong><small>{item.summary || statusLabel[item.status] || item.status}</small></span><em>{new Date(item.completedAt || item.startedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</em></button>)}</aside>
      <main className="aw-loop-report"><section className="aw-loop-hero"><div><small>{new Date(run.completedAt || run.startedAt).toLocaleString("zh-CN")}</small><h2>{run.title || "秋招情报每日同步"}</h2><p>{run.summary}</p></div><span className={`aw-loop-status is-${run.status}`}>{statusLabel[run.status] || run.status}</span></section>
        <div className="aw-loop-metrics">{[["已选岗位",counts.roles ?? xhsRoles.length],["正文已核验",counts.xhsPosts ?? xhsRoles.reduce((sum,item)=>sum+(item.posts?.length || item.verifiedCount || 0),0)],["新增 Pipeline",counts.pipelineAdded ?? 0],["官网变化",counts.applicationChanges ?? 0],["首页提醒",counts.homepageReminders ?? 0]].map(([label,value])=><article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
        <Panel title="小红书岗位资料" subtitle="持续检索至新增高价值结果饱和，逐篇打开正文后才计入"><div className="aw-loop-role-list">{xhsRoles.map((item)=><article key={item.id}><header><div><strong>{item.company} · {item.role}</strong><small>{item.priority === "active" ? "已有招聘进展，优先检索" : "已选岗位"}{item.saturation?.status === "saturated" ? " · 检索已饱和" : item.saturation?.status === "expanding" ? " · 扩展检索中" : ""}</small></div><span className={`is-${item.status}`}>{item.posts?.length || item.verifiedCount || 0} 篇已核验</span></header>{item.stageCoverage?.length ? <div className="aw-loop-stage-coverage">{item.stageCoverage.map((stage)=><span key={stage.stage} className={`is-${stage.status}`} title={stage.detail}><b>{stage.stage}</b><small>{stageStatusLabel[stage.status] || stage.status}</small></span>)}</div> : null}{item.posts?.length ? <div className="aw-loop-posts">{item.posts.map((post,index)=><a href={post.url} target="_blank" rel="noreferrer" key={post.id || post.url || index}><b>{index+1}</b><span><strong>{post.title}</strong><small>{post.digest || "正文已核验"}</small></span><ArrowRight/></a>)}</div> : <p className="aw-loop-limitation">{item.limitation || "暂未找到与该岗位严格匹配且正文可读的帖子。"}</p>}</article>)}</div></Panel>
        <div className="aw-loop-detail-grid"><Panel title="官网投递进度">{run.officialProgress?.length ? <div className="aw-loop-notes">{run.officialProgress.map((item,index)=><article key={item.id||index}><strong>{item.company} · {item.role}</strong><p>{item.summary}</p><small>{item.status || "已核验"}</small></article>)}</div> : <EmptyState title="本次没有已核验的状态变化" text="登录失败、空白页或验证码会单独记为受阻，不会写成无更新。"/>}</Panel><Panel title="失败与限制">{run.failures?.length ? <div className="aw-loop-failures">{run.failures.map((item,index)=><p key={index}><Flag/>{typeof item === "string" ? item : item.summary}</p>)}</div> : <EmptyState icon={CheckCircle} title="没有未说明的失败" text="本次可访问范围均已记录。"/>}</Panel></div>
      </main>
    </div>}
  </div>;
}

function RolePicker({ companies, selectedCompany, selectCompany }) {
  const [open, setOpen] = useState(false);
  const selected = selectedCompany || companies[0] || null;
  return <div className="aw-role-picker">
    <button className="aw-current-role" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="listbox"><CompanyLogo company={selected || {name:"?"}} size="sm"/><span><small>当前岗位</small><strong>{selected ? `${selected.name} · ${selected.role}` : "请先选择岗位"}</strong></span><CaretDown/></button>
    {open && <><button className="aw-role-picker-dismiss" aria-label="关闭岗位选择" onClick={() => setOpen(false)}/><div className="aw-role-picker-menu" role="listbox" aria-label="选择分析岗位">{companies.map((company) => <button key={company.id} className={company.id === selected?.id ? "is-active" : ""} onClick={() => { selectCompany(company.id); setOpen(false); }} role="option" aria-selected={company.id === selected?.id}><CompanyLogo company={company} size="sm"/><span><strong>{company.name}</strong><small>{company.role}{company.team ? ` · ${company.team}` : ""}</small></span>{company.id === selected?.id && <Check/>}</button>)}</div></>}
  </div>;
}

function storedFileSize(value) {
  if (!Number.isFinite(value) || value <= 0) return "大小未知";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const CAREER_FILE_ALIASES = {
  "京东": ["jingdong", "jd"], "百度": ["baidu"], "小红书": ["xiaohongshu", "rednote"],
  "腾讯": ["tencent"], "DeepSeek": ["deepseek"], "Kimi": ["kimi", "moonshot"], "智谱": ["zhipu", "glm"], "MiniMax": ["minimax"], "阿里": ["alibaba", "qwen", "千问"],
};

function FilesPage({ companies, career, selectedCompany, selectCompany, importRoleFiles, openStoredFile, openCareerFile, openNotifications }) {
  const [query, setQuery] = useState("");
  const selected = selectedCompany || companies[0] || null;
  const storedFiles = (selected?.files || []).filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase()));
  const aliases = selected ? [selected.name, ...(CAREER_FILE_ALIASES[selected.name] || [])].map((value) => value.toLowerCase()) : [];
  const careerFiles = [...(career.reports || []), ...(career.outputs || []), ...(career.interviewFiles || [])]
    .filter((file) => aliases.some((alias) => file.name.toLowerCase().includes(alias)))
    .filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase()));
  const totalStored = companies.reduce((sum, company) => sum + (company.files || []).length, 0);
  return <div className="aw-page aw-files-page">
    <PageHeader title="文件" subtitle="把简历、评估报告、面试材料和其他附件按岗位归档。" action="添加文件" onAction={() => importRoleFiles(selected?.id)}><RolePicker companies={companies} selectedCompany={selected} selectCompany={selectCompany}/><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader>
    <div className="aw-file-toolbar"><SearchField value={query} onChange={setQuery} placeholder="搜索当前岗位的文件"/><span>{totalStored} 个已归档文件</span></div>
    <nav className="aw-file-role-nav" aria-label="按岗位查看文件">{companies.map((company) => <button key={company.id} className={company.id === selected?.id ? "is-active" : ""} onClick={() => selectCompany(company.id)}><CompanyLogo company={company} size="sm"/><span><strong>{company.name}</strong><small>{company.role}</small></span><b>{(company.files || []).length}</b></button>)}</nav>
    <section className="aw-file-shelf"><header><div><small>当前岗位</small><h2>{selected ? `${selected.name} · ${selected.role}` : "尚未选择岗位"}</h2><p>{storedFiles.length} 个已归档文件{careerFiles.length ? ` · ${careerFiles.length} 个关联 Career Ops 文件` : ""}</p></div><button className="aw-outline-button" onClick={() => importRoleFiles(selected?.id)}><Plus/>添加文件</button></header>
      {storedFiles.length
        ? <div className="aw-file-grid">{storedFiles.map((file) => <article key={file.id || file.path}><span className="aw-file-type"><File/><b>{file.extension || "FILE"}</b></span><div><h3>{file.name}</h3><p>{storedFileSize(file.size)} · {relativeTime(file.importedAt || file.updatedAt)}</p></div><footer><button onClick={() => openStoredFile(file.path)}><FileText/>打开</button><button onClick={() => openStoredFile(file.path, true)}><FolderSimple/>在 Finder 中显示</button></footer></article>)}</div>
        : <EmptyState icon={FolderSimple} title="这个岗位还没有归档文件" text="添加的文件会复制进 offer 的本地资料库，原文件移动后也不会丢失。" action="添加文件" onAction={() => importRoleFiles(selected?.id)}/>
      }
    </section>
    {careerFiles.length > 0 && <Panel title="关联的 Career Ops 文件" subtitle="根据公司名称匹配到当前岗位；点击即可打开。"><div className="aw-linked-file-list">{careerFiles.map((file) => <button key={file.path} onClick={() => openCareerFile(file.path)}><span className="aw-soft-icon"><FileText/></span><span><strong>{file.name}</strong><small>{storedFileSize(file.size)} · {relativeTime(file.updatedAt)}</small></span><ArrowRight/></button>)}</div></Panel>}
  </div>;
}

function PreparePage({ companies, selectedCompany, selectCompany, openNotifications }) {
  return <div className="aw-page aw-prepare-page"><PageHeader title="准备" subtitle="简历分析、岗位评估、材料定制、面试训练和复盘都在这里。"><RolePicker companies={companies} selectedCompany={selectedCompany} selectCompany={selectCompany}/><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader><CareerOpsView key={selectedCompany?.id || "no-role"} selectedRole={selectedCompany} roles={companies} surface="prepare" embedded /></div>;
}

function TasksPage({ companies, intelligence, navigate, openNode, openNotifications }) {
  const today = dateKey(new Date()); const week = new Date(); week.setDate(week.getDate()+7); const weekKey=dateKey(week);
  const all = companies.flatMap((company) => (company.timeline || []).map((node) => ({ company, node, done: node.date < today })));
  const groups = [{label:"今天",items:all.filter(({node})=>node.date===today),color:"blue"},{label:"本周",items:all.filter(({node})=>node.date>today&&node.date<=weekKey),color:"blue"},{label:"之后",items:all.filter(({node})=>node.date>weekKey),color:"purple"}];
  const overdue = all.filter(({node})=>node.date<today).slice(0,4); const complete=all.filter((item)=>item.done).length;
  return <div className="aw-page aw-tasks-page"><PageHeader title="任务" subtitle="管理行动，让每个求职机会继续向前。" action="添加任务" onAction={() => openNode("",today)}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader><div className="aw-toolbar"><FilterButton>今天</FilterButton><FilterButton>即将到来</FilterButton><FilterButton>优先级</FilterButton><FilterButton>关联公司</FilterButton><button className="aw-icon-button"><DotsThree /></button></div>
    <div className="aw-task-layout"><main className="aw-task-groups">{groups.map((group) => <Panel key={group.label} className="aw-task-group" title={group.label} action={<span>{group.items.length} 项</span>}>{group.items.length ? group.items.map(({company,node}) => <button key={`${company.id}-${node.id}`} onClick={() => openNode(company.id,node.date,node)}><i className="aw-check-ring" /><span><strong>{nodeName(node)}</strong><small>{company.name} · {company.role}</small></span><em><CalendarBlank />{node.date===today ? node.time || "今天" : shortDate(node.date)}</em><StagePill stage={stageFor(company,intelligence)} /><CompanyLogo company={company} size="sm" /></button>) : <EmptyState icon={CheckCircle} title="这一组没有任务" text="新的流程节点会自动成为待办。" />}</Panel>)}</main>
      <aside className="aw-right-stack"><Panel title="进度"><div className="aw-progress-card"><Donut values={[complete,Math.max(all.length-complete,0)]} total={all.length} center={`${all.length ? Math.round(complete/all.length*100):0}%`} sub="已完成" /><div><span><i className="tone-blue" />已完成 <b>{complete}</b></span><span><i className="tone-green" />进行中 <b>{Math.max(all.length-complete,0)}</b></span><span><i className="tone-red" />已逾期 <b>{overdue.length}</b></span></div></div></Panel><Panel title="已逾期">{overdue.length ? <div className="aw-overdue-list">{overdue.map(({company,node}) => <button key={`${company.id}-${node.id}`} onClick={() => openNode(company.id,node.date,node)}><i className="aw-check-ring" /><span><strong>{nodeName(node)}</strong><small>{company.name}</small></span><em>{shortDate(node.date)}</em></button>)}</div> : <EmptyState icon={CheckCircle} title="没有逾期任务" text="当前安排都在计划内。" />}</Panel><Panel title="快捷操作"><div className="aw-quick-list"><button onClick={() => navigate("calendar")}><CalendarBlank /><span><strong>安排面试</strong><small>在日历中添加流程节点</small></span></button><button onClick={() => navigate("applications")}><EnvelopeSimple /><span><strong>跟进申请</strong><small>查看当前投递状态</small></span></button><button onClick={() => navigate("notes")}><Note /><span><strong>添加笔记</strong><small>记录岗位判断与准备</small></span></button></div></Panel></aside>
    </div>
  </div>;
}

function NotesPage({ companies, career, selectedId, selectCompany, openCareerFile, openNotifications }) {
  const notes = companies.filter((company) => company.notes || company.jd).map((company) => ({ type:"company", company, title:`${company.name} · ${company.role}`, body:company.notes || company.jd, updatedAt:itemDate(company) }));
  const reports = (career.reports || []).map((report) => ({type:"report", title:report.name.replace(/\.md$/i,""), body:"Career Ops 评估报告", updatedAt:report.updatedAt, report}));
  const items=[...notes,...reports]; const [selectedKey,setSelectedKey]=useState(""); const selected=items.find((item)=> (item.company?.id || item.report?.path) === (selectedKey || selectedId)) || items[0];
  return <div className="aw-page aw-notes-page"><PageHeader title="笔记" subtitle="整理想法、准备面试并记录求职进展。" action="新建笔记" onAction={() => {}}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader><div className="aw-toolbar"><SearchField value="" onChange={()=>{}} placeholder="搜索笔记…" /><FilterButton>全部标签</FilterButton><FilterButton>全部类型</FilterButton><button className="aw-icon-button"><FunnelSimple /></button><span className="aw-toolbar-spacer" /><button className="aw-filter-button"><Bell />已置顶</button></div>
    <div className="aw-notes-layout"><aside className="aw-note-nav"><Panel title="集合" action={<Plus />}><button className="is-active"><SquaresFour /><span>岗位笔记</span><b>{notes.length}</b></button><button><FolderSimple /><span>评估报告</span><b>{reports.length}</b></button><button><FileText /><span>全部笔记</span><b>{items.length}</b></button></Panel><Panel title="最近更新">{items.slice(0,4).map((item)=><button key={item.company?.id||item.report?.path} onClick={()=>setSelectedKey(item.company?.id||item.report?.path)}><span>{item.title}</span><small>{relativeTime(item.updatedAt)}</small></button>)}</Panel></aside>
      <Panel title="全部笔记" className="aw-note-list" action={<span>最近更新 <CaretDown /></span>}>{items.length ? items.map((item)=><button className={(item.company?.id||item.report?.path)===(selected?.company?.id||selected?.report?.path)?"is-active":""} key={item.company?.id||item.report?.path} onClick={()=>setSelectedKey(item.company?.id||item.report?.path)}><strong>{item.title}</strong><p>{item.body.slice(0,70)}</p><footer><StagePill stage={item.type==="report"?"screening":"wishlist"}/><span>{relativeTime(item.updatedAt)}</span></footer></button>) : <EmptyState title="还没有笔记" text="为岗位补充 JD 或备注后会显示在这里。" />}</Panel>
      <Panel className="aw-note-editor">{selected ? <><header className="aw-note-title"><div><h2>{selected.title}</h2><span>{selected.type==="report"?"评估报告":"岗位笔记"}</span></div><div><small>保存于 {relativeTime(selected.updatedAt)}</small><DotsThree /></div></header><article>{selected.type==="report" ? <><h2>Career Ops 评估报告</h2><p>这是一份独立的本地报告文件。点击下方按钮可直接打开查看。</p><button className="aw-black-button" onClick={()=>openCareerFile(selected.report.path)}><FileText />打开报告文件</button></> : <><h2>岗位概览</h2><p>{selected.company?.notes || "尚未添加额外备注。"}</p><h2>岗位描述</h2><p className="aw-prewrap">{selected.company?.jd || "尚未补充 JD。"}</p><div className="aw-insight"><Sparkle /><span><strong>准备提示</strong><p>围绕岗位要求，把实习和项目证据整理成可追问的故事。</p></span></div></>}</article></> : <EmptyState title="选择一条笔记" text="内容会显示在这里。" />}</Panel>
    </div>
  </div>;
}

function ContactsPage({ openNotifications }) {
  return <div className="aw-page aw-contacts-page"><PageHeader title="联系人" subtitle="管理招聘者、面试官和内推人的联系记录。" action="添加联系人" onAction={()=>{}}><IconButton label="通知" onClick={openNotifications}><BellSimple /></IconButton></PageHeader><div className="aw-toolbar"><SearchField value="" onChange={()=>{}} placeholder="搜索联系人…"/><button className="aw-tab is-active">全部</button><button className="aw-tab">招聘者</button><button className="aw-tab">面试官</button><button className="aw-tab">内推人</button><span className="aw-toolbar-spacer"/><FilterButton>最近联系</FilterButton><button className="aw-icon-button"><FunnelSimple/></button></div><div className="aw-main-aside"><Panel className="aw-table-panel"><div className="aw-contact-empty-table"><div className="aw-tr aw-th"><span>联系人</span><span>公司</span><span>关系</span><span>最近互动</span><span>下次跟进</span></div><EmptyState icon={AddressBook} title="还没有联系人" text="offer 不会用示例人物填充你的通讯录。添加真实联系人后，这里会按设计稿呈现关系与跟进信息。" action="添加联系人" onAction={()=>{}}/></div></Panel><aside className="aw-right-stack"><Panel title="关系健康"><div className="aw-progress-card"><Donut values={[0,0,0,1]} total={1} center="0" sub="联系人"/><div><span><i className="tone-green"/>良好 <b>0</b></span><span><i className="tone-orange"/>待跟进 <b>0</b></span></div></div></Panel><Panel title="即将跟进"><EmptyState title="暂无跟进" text="添加联系人后即可设置提醒。"/></Panel><Panel title="重点联系人"><EmptyState icon={Star} title="暂无收藏" text="收藏的联系人会显示在这里。"/></Panel></aside></div></div>;
}

function AnalyticsPage({ companies, intelligence, career, openNotifications, exportData }) {
  const counts=countStages(companies,intelligence);
  const applications=companies.filter((company)=>applicationDate(company)||stageFor(company,intelligence)!=="wishlist");
  const applied=applications.length;
  const outcomes=aggregateApplications(applications,"overall")[0]||{responded:0,interviews:0,offers:0};
  const response=outcomes.responded;
  const interview=outcomes.interviews;
  const offer=outcomes.offers;
  const categories=companies.reduce((map,c)=>{const key=c.batch||"批次未注明";map[key]=(map[key]||0)+1;return map;},{});
  const currentYear=new Date().getFullYear();
  const activity=Array.from({length:12},(_,index)=>{const prefix=`${currentYear}-${String(index+1).padStart(2,"0")}-`;return companies.reduce((total,company)=>total+(company.timeline||[]).filter((node)=>String(node.date||"").startsWith(prefix)).length,0);});
  const heatDays=Array.from({length:35},(_,index)=>dateKey(addDays(new Date(),index-34)));
  const heatValues=heatDays.map((date)=>companies.reduce((total,company)=>total+(company.timeline||[]).filter((node)=>node.date===date).length,0));
  const heatMax=Math.max(1,...heatValues);
  const focusCount=companies.filter((company)=>normalizePriority(company.priority)>=4).length;
  const trackStats=aggregateApplications(applications,"track");
  const healthCount=companies.reduce((total,company)=>total+applicationHealthIssues(company).filter((issue)=>issue.severity!=="info").length,0);
  return <div className="aw-page aw-analytics-page"><PageHeader title="分析" subtitle="了解求职进展，发现最值得投入的方向。"><button className="aw-filter-button" onClick={exportData}><ArrowDown/>导出</button><IconButton label="通知" onClick={openNotifications}><BellSimple/></IconButton></PageHeader>
    <div className="aw-metric-grid">{[[PaperPlaneTilt,"已投递",applied,"份申请","blue"],[EnvelopeSimple,"推进率",applied?Math.round(response/applied*100):0,"%","green"],[Users,"进入面试",applied?Math.round(interview/applied*100):0,"%","purple"],[Target,"Offer 率",applied?Math.round(offer/applied*100):0,"%","orange"]].map(([Icon,label,value,unit,tone])=><Panel key={label} title={label}><div className="aw-metric"><i className={tone}><Icon/></i><strong>{value}<small>{unit}</small></strong><span><TrendUp/> 基于当前真实记录</span></div></Panel>)}</div>
    <div className="aw-analytics-middle"><Panel title={`${currentYear} 年流程节点`} className="aw-line-panel"><div className="aw-chart-legend"><span><i className="tone-blue"/>投递、测评、面试等事件</span></div><div className="aw-line-chart">{activity.map((value,index)=><div key={index}><i style={{height:`${Math.max(8,value*22)}px`}}/><small>{index+1}月</small></div>)}</div></Panel><Panel title="当前阶段分布"><div className="aw-funnel-analytics"><Funnel counts={counts}/><div>{STAGES.slice(1).map(stage=><span key={stage.id}><i className={`tone-${stage.color}`}/>{stage.label}<b>{counts[stage.id]}</b></span>)}</div></div></Panel></div>
    <Panel title="赛道对比" subtitle="先看数量和真实结果；不足 5 份时不展示容易误导的百分比。"><div className="aw-decision-table"><div className="aw-decision-row is-header"><span>赛道</span><span>投递</span><span>有回应</span><span>进面</span><span>Offer</span><span>活跃等待中位数</span><span>结果判断</span></div>{trackStats.map((row)=><div className="aw-decision-row" key={row.value}><strong>{row.value}</strong><span>{row.total}</span><span>{row.responded}</span><span>{row.interviews}</span><span>{row.offers}</span><span>{row.medianWaitingDays===null?"—":`${row.medianWaitingDays} 天`}</span><small>{row.total<5?"数据不足":`${Math.round(row.interviews/row.total*100)}% 进面`}</small></div>)}</div></Panel>
    <div className="aw-analytics-bottom"><Panel title="招聘批次"><div className="aw-bar-list">{Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([label,value])=><div key={label}><span>{label}</span><i><b style={{width:`${Math.max(12,value/Math.max(1,companies.length)*100)}%`}}/></i><strong>{value}</strong></div>)}</div></Panel><Panel title="最近 5 周活动"><div className="aw-heatmap">{heatValues.map((value,index)=><i key={heatDays[index]} title={`${shortDate(heatDays[index])}：${value} 个节点`} style={{opacity:value?0.25+value/heatMax*0.75:0.08}}/> )}</div><footer className="aw-heat-legend">较少 <span><i/><i/><i/><i/></span> 较多</footer></Panel><Panel title="当前关注"><div className="aw-insight-stack"><div><span className="aw-soft-icon tone-purple"><Star/></span><p><strong>{focusCount} 个重点岗位</strong><small>重视程度为 4 至 5 分</small></p></div><div><span className={`aw-soft-icon ${healthCount?"tone-orange":"tone-green"}`}><CheckCircle/></span><p><strong>{healthCount ? `${healthCount} 项记录待核对` : "记录状态一致"}</strong><small>根据时间线、状态和下一步自动检查</small></p></div></div></Panel></div>
  </div>;
}

function TemplatesPage({ career, selectedCompany, openCareer, openCareerFile, openNotifications }) {
  const assets=[...(career.reports||[]).map(file=>({...file,type:"report",label:"评估报告"})),...(career.outputs||[]).map(file=>({...file,type:"output",label:"生成材料"})),...(career.interviewFiles||[]).map(file=>({...file,type:"interview",label:"面试准备"}))];
  return <div className="aw-page aw-templates-page"><PageHeader title="模板与材料" subtitle="创建、管理并复用你的求职材料。" action="新建材料" onAction={openCareer}><IconButton label="通知" onClick={openNotifications}><BellSimple/></IconButton></PageHeader><div className="aw-toolbar"><SearchField value="" onChange={()=>{}} placeholder="搜索模板与材料…"/><button className="aw-tab is-active">全部</button><button className="aw-tab">简历</button><button className="aw-tab">评估报告</button><button className="aw-tab">面试准备</button><span className="aw-toolbar-spacer"/><button className="aw-filter-button"><FunnelSimple/>筛选</button></div>
    <Panel title="全部材料" action={<button className="aw-view-toggle"><SquaresFour/><Rows/></button>}><div className="aw-template-grid"><button className="aw-template-card is-resume" onClick={openCareer}><header><span className="aw-soft-icon tone-blue"><FileText/></span><DotsThree/></header><div className="aw-document-preview"><strong>{career.resume?.source?.name || career.resume?.latestAnalysis?.sourceName || "导入 PDF 简历"}</strong><i/><i/><i/><i/><i/></div><h3>PDF 简历分析</h3><div><span className="aw-pill tone-blue">简历</span><span className="aw-pill">Career Ops</span></div><p>{career.resume?.latestAnalysis ? "已有评估结果，点击查看或重新分析" : "直接读取 PDF，逐页完成评估"}</p><footer><span><Target/>开始分析</span><ArrowRight/></footer></button>{assets.slice(0,7).map((file,index)=><button className="aw-template-card" key={file.path} onClick={()=>openCareerFile(file.path)}><header><span className={`aw-soft-icon tone-${["green","orange","purple","blue"][index%4]}`}><File/></span><DotsThree/></header><div className="aw-document-preview"><strong>{file.label}</strong><i/><i/><i/><i/><i/></div><h3>{file.name.replace(/\.(md|html|pdf|docx)$/i,"")}</h3><div><span className="aw-pill tone-green">{file.label}</span></div><p>更新于 {relativeTime(file.updatedAt)}</p><footer><span><FileText/>打开文件</span><ArrowRight/></footer></button>)}</div></Panel>
    <Panel title="推荐操作"><div className="aw-recommended-grid">{[[FileText,"分析当前 PDF 简历","直接读取 PDF 并逐页评估"],[Target,"评估目标岗位",selectedCompany?`${selectedCompany.name} · ${selectedCompany.role}`:"先选择一个岗位"],[Users,"生成面试准备","基于岗位与真实经历整理"],[EnvelopeSimple,"生成沟通草稿","只生成草稿，不自动发送"]].map(([Icon,title,text])=><button key={title} onClick={openCareer}><span className="aw-soft-icon"><Icon/></span><p><strong>{title}</strong><small>{text}</small></p><Copy/></button>)}</div></Panel>
  </div>;
}

function SettingsPage({ profile = EMPTY_PROFILE, openAdd, openNotifications, storage, saveState, exportData, importData, openDataDirectory, restoreBackup, canRestore }) {
  const [backups,setBackups]=useState([]);
  const [backupState,setBackupState]=useState("loading");
  const loadBackups=useCallback(async()=>{setBackupState("loading");try{const response=await fetch("/api/workspace/backups",{cache:"no-store"});const value=await response.json();if(!response.ok)throw new Error(value.error);setBackups(Array.isArray(value.backups)?value.backups:[]);setBackupState("ready");}catch{setBackupState("error");}},[]);
  useEffect(()=>{loadBackups();},[loadBackups]);
  const requestRestore=async(backup)=>{if(!window.confirm(`将工作台恢复到 ${new Date(backup.createdAt).toLocaleString("zh-CN")} 的 ${backup.recordCount} 条记录，是否继续？\n\n恢复前会自动保留当前版本。`))return;setBackupState("restoring");const restored=await restoreBackup(backup.name);if(restored)await loadBackups();else setBackupState("ready");};
  return <div className="aw-page aw-settings-page"><PageHeader title="数据与设置" subtitle="你的投递数据保存在这台电脑，并自动生成历史备份。" action="添加投递" onAction={openAdd}><IconButton label="通知" onClick={openNotifications}><BellSimple/></IconButton></PageHeader><div className="aw-data-settings-grid">
    <Panel title="保存状态"><div className="aw-storage-status"><span className={`aw-save-orb state-${saveState.status}`}>{saveState.status === "error" ? <X/> : <Check/>}</span><div><strong>{saveState.status === "saving" ? "正在保存" : saveState.status === "error" ? "本机保存失败" : "已保存到本机"}</strong><small>{saveState.message || "每次修改都会写入主数据文件并保留快照。"}</small></div></div><dl className="aw-storage-facts"><div><dt>数据目录</dt><dd>{storage?.dataDirectory || "正在读取…"}</dd></div><div><dt>历史备份</dt><dd>{storage?.backupCount ?? 0} 份</dd></div><div><dt>最新备份</dt><dd>{storage?.latestBackup || "首次保存后生成"}</dd></div></dl></Panel>
    <Panel title="备份与恢复" subtitle="日常用自动快照；需要复制到其他位置时再导出 JSON。"><div className="aw-data-actions"><button className="aw-outline-button" onClick={exportData}><ArrowDown/>导出全部数据</button><label className="aw-outline-button"><UploadSimple/>从 JSON 恢复<input type="file" accept="application/json,.json" onChange={(event)=>{const file=event.target.files?.[0];if(file)importData(file);event.target.value="";}}/></label><button className="aw-outline-button" onClick={openDataDirectory}><FolderSimple/>打开数据目录</button></div><div className="aw-backup-list"><header><strong>最近的本机快照</strong><button type="button" className="aw-text-button" onClick={loadBackups}>刷新</button></header>{backupState==="loading"?<p>正在读取快照…</p>:backupState==="error"?<p>暂时无法读取快照列表。</p>:backups.slice(0,5).map((backup)=><div key={backup.name} className={!backup.valid?"is-invalid":""}><span><strong>{new Date(backup.createdAt).toLocaleString("zh-CN")}</strong><small>{backup.valid?`${backup.recordCount} 条记录 · ${Math.max(1,Math.round(backup.size/1024))} KB`:"快照已损坏，不可恢复"}</small></span><button type="button" className="aw-outline-button" disabled={!backup.valid||!canRestore||backupState==="restoring"} onClick={()=>requestRestore(backup)}>{backupState==="restoring"?"恢复中…":"恢复"}</button></div>)}{backupState==="ready"&&!backups.length&&<p>首次修改并保存后会自动生成快照。</p>}</div><p className="aw-data-warning">恢复只在没有未保存修改时可用；当前版本会先自动备份，所以仍可撤回。</p></Panel>
    <Panel title="个人资料"><div className="aw-profile-summary"><span>{profileInitial(profile)}</span><div><strong>{profile.name || "尚未填写姓名"}</strong><small>{profile.title || "尚未填写目标方向"}{profile.location ? ` · ${profile.location}` : ""}</small></div></div></Panel>
    <Panel title="本地保存说明"><div className="aw-privacy-copy"><IdentificationCard/><p><strong>不依赖登录或云端账号</strong><small>浏览器页面只是操作界面。主数据文件、自动备份和导出的副本都由你掌控。</small></p></div></Panel>
  </div></div>;
}

function NotificationDrawer({ intelligence, onClose }) {
  const items=[...(intelligence.applicationSync?.changes||[]),...(intelligence.updates||[])].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,12);
  return <><button className="aw-backdrop" onClick={onClose} aria-label="关闭通知"/><aside className="aw-notification-drawer"><header><div><span>更新中心</span><h2>通知</h2></div><IconButton label="关闭" onClick={onClose}><X/></IconButton></header><div className="aw-drawer-list">{items.length?items.map((item,index)=><article key={`${item.id||"notification"}-${index}`}><span className="aw-soft-icon"><Bell/></span><p><strong>{item.title}</strong><small>{item.summary}</small><em>{relativeTime(item.createdAt)}</em></p></article>):<EmptyState title="暂无通知" text="情报与申请状态更新会显示在这里。"/>}</div><footer><span><Sparkle/>情报 Loop</span><b>{intelligence.automation?.status==="active"?intelligence.automation.schedule:"未启用"}</b></footer></aside></>;
}

function Modal({ title, onClose, children, footer, dismissible = true }) {
  const modalRef=useRef(null);const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
  useEffect(()=>{const previous=document.activeElement;const frame=requestAnimationFrame(()=>{const target=modalRef.current?.querySelector("[autofocus]")||modalRef.current?.querySelector("button, input, select, textarea");target?.focus();});const handleKey=(event)=>{if(event.key==="Escape"&&dismissible){event.preventDefault();onCloseRef.current();return;}if(event.key!=="Tab")return;const focusable=[...(modalRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")||[])];if(!focusable.length)return;const first=focusable[0];const last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};window.addEventListener("keydown",handleKey);return()=>{cancelAnimationFrame(frame);window.removeEventListener("keydown",handleKey);previous?.focus?.();};},[dismissible]);
  return <>{dismissible?<button className="aw-backdrop" onClick={onClose} aria-label="关闭"/>:<div className="aw-backdrop"/>}<section ref={modalRef} className="aw-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2>{dismissible&&<IconButton label="关闭" onClick={onClose}><X/></IconButton>}</header><div>{children}</div>{footer&&<footer>{footer}</footer>}</section></>;
}

export function AppleWorkspace() {
  const [companies,setCompanies]=useState([]); const [intelligence,setIntelligence]=useState(EMPTY_INTELLIGENCE); const [loopRuns,setLoopRuns]=useState(EMPTY_LOOP_RUNS); const [career,setCareer]=useState(EMPTY_CAREER); const [profile,setProfile]=useState(EMPTY_PROFILE); const [workspaceExtra,setWorkspaceExtra]=useState({}); const [view,setView]=useState("home"); const [query,setQuery]=useState(""); const [selectedId,setSelectedId]=useState(""); const [hydrated,setHydrated]=useState(false); const [dirtyVersion,setDirtyVersion]=useState(0); const [writeEnabled,setWriteEnabled]=useState(false); const [storage,setStorage]=useState(null); const [saveState,setSaveState]=useState({status:"loading",message:"正在读取本机数据"}); const [modal,setModal]=useState(null); const [nodeDraft,setNodeDraft]=useState(null); const [logoDraft,setLogoDraft]=useState(null); const [jdImageDraft,setJdImageDraft]=useState(null); const [notice,setNotice]=useState(""); const [notifications,setNotifications]=useState(false); const [undoState,setUndoState]=useState(null); const [conflict,setConflict]=useState(false); const [staleDraft,setStaleDraft]=useState(null); const [draftKey]=useState(()=>{let id=sessionStorage.getItem("offer-draft-id");if(!id){id=crypto.randomUUID();sessionStorage.setItem("offer-draft-id",id);}return `offer-workspace-draft:${id}`;}); const searchRef=useRef(null); const persistTimer=useRef(null); const revisionRef=useRef(null); const dirtyVersionRef=useRef(0); const persistQueueRef=useRef({inFlight:false,pending:null}); const undoTimerRef=useRef(null); const noticeTimerRef=useRef(null);
  const [applicationEditorState,setApplicationEditorState]=useState({open:false,dirty:false});
  useEffect(()=>{let active=true;Promise.allSettled([fetch("/api/workspace",{cache:"no-store"}),fetch("/api/intelligence",{cache:"no-store"}),fetch("/api/loop-runs",{cache:"no-store"}),fetch("/api/career-ops/snapshot",{cache:"no-store"})]).then(async(results)=>{if(!active)return;const [workspaceResult,intelligenceResult,loopRunsResult,careerResult]=results;let remoteWorkspace=null;if(workspaceResult.status==="fulfilled"&&workspaceResult.value.ok){const value=await workspaceResult.value.json();if(Array.isArray(value.companies)){remoteWorkspace=value;revisionRef.current=value.updatedAt||null;setStorage(value.storage||null);}}if(remoteWorkspace){let workspace=remoteWorkspace;let recoveredDraft=null;let mismatchedDraft=null;try{for(let index=0;index<localStorage.length;index+=1){const key=localStorage.key(index);if(!key?.startsWith("offer-workspace-draft:"))continue;const candidate=JSON.parse(localStorage.getItem(key)||"null");if(!Array.isArray(candidate?.companies))continue;const wrapped={...candidate,storageKey:key};if(candidate.baseUpdatedAt===remoteWorkspace.updatedAt){if(!recoveredDraft||String(candidate.updatedAt).localeCompare(String(recoveredDraft.updatedAt))>0)recoveredDraft=wrapped;}else if(!mismatchedDraft||String(candidate.updatedAt).localeCompare(String(mismatchedDraft.updatedAt))>0)mismatchedDraft=wrapped;}}catch{/* Disk data remains authoritative if draft inspection fails. */}if(recoveredDraft){workspace=recoveredDraft;setDirtyVersion(1);}else if(mismatchedDraft){setStaleDraft(mismatchedDraft);setConflict("stale");}const {version:_version,updatedAt:_updatedAt,baseUpdatedAt:_baseUpdatedAt,storage:_storage,storageKey:_storageKey,profile:_profile,companies:_companies,...extra}=workspace;setWorkspaceExtra(extra);setCompanies(workspace.companies);setSelectedId(workspace.companies?.[0]?.id||"");setProfile(workspace.profile&&typeof workspace.profile==="object"?{...EMPTY_PROFILE,...workspace.profile}:EMPTY_PROFILE);setWriteEnabled(true);setSaveState({status:recoveredDraft?"saving":"saved",message:recoveredDraft?"已恢复上次未完成保存的草稿":mismatchedDraft?"发现一份与磁盘版本冲突的旧草稿":remoteWorkspace.storage?.recoveredFrom?`已从备份 ${remoteWorkspace.storage.recoveredFrom} 恢复`:"本机数据已载入"});}else{setSaveState({status:"error",message:"无法读取本机数据，已停止自动写入以防覆盖"});}if(intelligenceResult.status==="fulfilled"&&intelligenceResult.value.ok){const intel=await intelligenceResult.value.json();setIntelligence({...EMPTY_INTELLIGENCE,...intel,applicationSync:{...EMPTY_INTELLIGENCE.applicationSync,...intel.applicationSync}});}if(loopRunsResult.status==="fulfilled"&&loopRunsResult.value.ok){const value=await loopRunsResult.value.json();setLoopRuns({version:1,runs:Array.isArray(value.runs)?value.runs:[]});}if(careerResult.status==="fulfilled"&&careerResult.value.ok){const snapshot=await careerResult.value.json();setCareer({...EMPTY_CAREER,...snapshot});}}).catch((error)=>active&&setSaveState({status:"error",message:error.message||"本机数据加载失败"})).finally(()=>active&&setHydrated(true));return()=>{active=false;};},[draftKey]);
  useEffect(()=>{const handler=(event)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"&&!modal&&!notifications&&!conflict){event.preventDefault();searchRef.current?.focus();}else if(event.key==="Escape"&&query){setQuery("");searchRef.current?.blur();}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[query,modal,notifications,conflict]);
  useEffect(()=>{dirtyVersionRef.current=dirtyVersion;},[dirtyVersion]);
  useEffect(()=>{if(staleDraft)setWriteEnabled(false);},[staleDraft]);
  useEffect(()=>{const warn=(event)=>{if(dirtyVersion>0){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirtyVersion]);
  useEffect(()=>{if(!hydrated||dirtyVersion===0)return;try{localStorage.setItem(draftKey,JSON.stringify({...workspaceExtra,version:1,updatedAt:new Date().toISOString(),baseUpdatedAt:revisionRef.current,profile,companies}));}catch{setSaveState({status:"error",message:"浏览器草稿空间不足，请保持页面打开直到磁盘保存完成"});}},[companies,profile,workspaceExtra,hydrated,dirtyVersion,draftKey]);
  useEffect(()=>{if(!hydrated||!writeEnabled||dirtyVersion===0)return;clearTimeout(persistTimer.current);const snapshot={dirtyVersion,profile,companies,workspaceExtra};persistTimer.current=setTimeout(()=>{const run=async(task)=>{const queue=persistQueueRef.current;if(queue.inFlight){queue.pending=task;return;}queue.inFlight=true;let failed=false;setSaveState({status:"saving",message:"正在写入本机数据"});try{const payload={...task.workspaceExtra,version:1,updatedAt:new Date().toISOString(),baseUpdatedAt:revisionRef.current,profile:task.profile,companies:task.companies};const response=await fetch("/api/workspace",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const value=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(value.error||"保存接口不可用");error.isConflict=response.status===409;throw error;}revisionRef.current=value.savedAt||revisionRef.current;setStorage(value.storage||storage);if(dirtyVersionRef.current===task.dirtyVersion&&!queue.pending){localStorage.removeItem(draftKey);dirtyVersionRef.current=0;setDirtyVersion(0);setSaveState({status:"saved",message:`已保存，现有 ${value.storage?.backupCount??storage?.backupCount??0} 份历史备份`});}else{setSaveState({status:"saving",message:"检测到新的修改，继续保存"});}}catch(error){failed=true;queue.pending=null;setWriteEnabled(false);setConflict(error.isConflict?"conflict":"error");setSaveState({status:"error",message:error.isConflict?"另一个页面已保存新版本，本页草稿仍保留":error.message||"保存失败，本页草稿仍保留"});}finally{queue.inFlight=false;const pending=queue.pending;queue.pending=null;if(pending&&!failed)run(pending);}};run(snapshot);},320);return()=>clearTimeout(persistTimer.current);},[companies,profile,workspaceExtra,hydrated,writeEnabled,dirtyVersion,draftKey]);
  const searchResults=useMemo(()=>{const text=query.trim().toLowerCase();return text?companies.filter(c=>`${c.name}${c.team}${c.role}${c.location}${c.batch}${c.status}${c.progress}${c.nextAction}${c.jd}${c.notes}${c.track}${c.channel}`.toLowerCase().includes(text)):[];},[companies,query]); const selected=companies.find(c=>c.id===selectedId)||companies[0]||null;
  const flash=(message)=>{clearTimeout(noticeTimerRef.current);setNotice(message);noticeTimerRef.current=setTimeout(()=>setNotice(""),2800);};
  const invalidateGenericUndo=()=>{setUndoState((current)=>{if(!current||current.kind==="progress")return current;clearTimeout(undoTimerRef.current);return null;});};
  const downloadBlob=(blob,name)=>{const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const exportData=async()=>{if(dirtyVersion>0||persistQueueRef.current.inFlight){flash("请等本机保存完成后再导出，避免遗漏最新修改");return;}try{const response=await fetch("/api/workspace/export",{cache:"no-store"});if(!response.ok){const value=await response.json().catch(()=>({}));throw new Error(value.error||"导出失败");}downloadBlob(await response.blob(),`秋招工作台备份-${dateKey(new Date())}.json`);flash("完整数据和图片已导出");}catch(error){flash(error.message||"导出失败");}};
  const downloadCurrentDraft=()=>{const stale=conflict==="stale"&&staleDraft?Object.fromEntries(Object.entries(staleDraft).filter(([key])=>key!=="storageKey")):null;const draft=stale||{...workspaceExtra,version:1,updatedAt:new Date().toISOString(),baseUpdatedAt:revisionRef.current,profile,companies};downloadBlob(new Blob([JSON.stringify(draft,null,2)],{type:"application/json"}),`秋招工作台-本页未保存草稿-${dateKey(new Date())}.json`);flash("本页草稿已下载");};
  const applyRemoteWorkspace=(value)=>{invalidateGenericUndo();const {version:_version,updatedAt:_updatedAt,baseUpdatedAt:_baseUpdatedAt,storage:_storage,profile:_profile,companies:_companies,...extra}=value;setWorkspaceExtra(extra);setCompanies(value.companies);setProfile(value.profile&&typeof value.profile==="object"?{...EMPTY_PROFILE,...value.profile}:EMPTY_PROFILE);setSelectedId(value.companies?.[0]?.id||"");revisionRef.current=value.updatedAt||null;dirtyVersionRef.current=0;setDirtyVersion(0);setStorage(value.storage||null);setWriteEnabled(true);localStorage.removeItem(draftKey);if(staleDraft?.storageKey)localStorage.removeItem(staleDraft.storageKey);setStaleDraft(null);setSaveState({status:"saved",message:"已载入磁盘中的最新版本"});};
  const loadDiskVersion=async()=>{if(!window.confirm("将放弃本页未保存的修改并使用磁盘最新版本。若还没下载草稿，建议先取消并下载。是否继续？"))return;try{const response=await fetch("/api/workspace",{cache:"no-store"});const value=await response.json();if(!response.ok||!Array.isArray(value.companies))throw new Error(value.error||"无法读取磁盘版本");applyRemoteWorkspace(value);setConflict(false);setModal(null);flash("已使用磁盘中的最新版本");}catch(error){flash(error.message||"无法读取磁盘版本");}};
  const retryCurrentDraft=async()=>{try{const response=await fetch("/api/workspace",{cache:"no-store"});const value=await response.json();if(!response.ok)throw new Error(value.error||"无法读取最新版本");invalidateGenericUndo();if(conflict==="stale"&&staleDraft){const {version:_version,updatedAt:_updatedAt,baseUpdatedAt:_baseUpdatedAt,storageKey:_storageKey,profile:_profile,companies:_companies,...extra}=staleDraft;setWorkspaceExtra(extra);setCompanies(staleDraft.companies);setProfile(staleDraft.profile&&typeof staleDraft.profile==="object"?{...EMPTY_PROFILE,...staleDraft.profile}:EMPTY_PROFILE);setSelectedId(staleDraft.companies[0]?.id||"");if(staleDraft.storageKey)localStorage.removeItem(staleDraft.storageKey);}revisionRef.current=value.updatedAt||null;setStorage(value.storage||storage);setWriteEnabled(true);setConflict(false);setModal(null);setStaleDraft(null);setDirtyVersion((version)=>version+1);flash("正在把当前页面草稿保存为最新版本");}catch(error){flash(error.message||"无法继续保存草稿");}};
  const importData=async(file)=>{try{const value=JSON.parse(await file.text());const valid=Array.isArray(value?.companies)&&value.companies.every((company)=>{
    if(!company||typeof company!=="object"||Array.isArray(company)||typeof company.id!=="string")return false;
    if((company.name!==undefined&&typeof company.name!=="string")||(company.role!==undefined&&typeof company.role!=="string"))return false;
    return company.timeline===undefined||(Array.isArray(company.timeline)&&company.timeline.every((node)=>node&&typeof node==="object"&&!Array.isArray(node)&&(node.date===undefined||typeof node.date==="string")&&["type","title","time","note"].every((field)=>node[field]===undefined||typeof node[field]==="string")));
  });if(!valid)throw new Error("文件不是有效的秋招工作台备份");if(!window.confirm(`将用备份中的 ${value.companies.length} 条记录替换当前数据，是否继续？`))return;const restoredCompanies=await Promise.all(value.companies.map(async(company)=>{const logo=company.logoUrl?.startsWith("data:image/")?await storeLocalImage({name:"导入的 Logo",dataUrl:company.logoUrl}):null;const jdImage=company.jdImage?.startsWith("data:image/")?await storeLocalImage({name:"导入的 JD 截图",dataUrl:company.jdImage}):null;return {...company,logoUrl:logo?.dataUrl||company.logoUrl||"",jdImage:jdImage?.dataUrl||company.jdImage||""};}));invalidateGenericUndo();const {version:_version,updatedAt:_updatedAt,baseUpdatedAt:_baseUpdatedAt,storage:_storage,profile:_profile,companies:_companies,...extra}=value;setWorkspaceExtra(extra);setCompanies(restoredCompanies);setProfile(value.profile&&typeof value.profile==="object"?{...EMPTY_PROFILE,...value.profile}:EMPTY_PROFILE);setSelectedId(restoredCompanies[0]?.id||"");setWriteEnabled(true);setDirtyVersion((count)=>count+1);flash("备份已载入，正在保存到本机");}catch(error){flash(error.message||"无法读取备份文件");}};
  const restoreBackup=async(name)=>{if(dirtyVersion>0||persistQueueRef.current.inFlight){flash("请等待当前修改保存完成后再恢复快照");return false;}try{const response=await fetch("/api/workspace/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,baseUpdatedAt:revisionRef.current})});const value=await response.json();if(!response.ok)throw new Error(value.error||"恢复失败");const latestResponse=await fetch("/api/workspace",{cache:"no-store"});const latest=await latestResponse.json();if(!latestResponse.ok||!Array.isArray(latest.companies))throw new Error("恢复成功，但重新读取数据失败");applyRemoteWorkspace(latest);flash("已恢复本机快照，恢复前版本也已保留");return true;}catch(error){flash(error.message||"无法恢复快照");return false;}};
  const openDataDirectory=async()=>{try{const response=await fetch("/api/storage/open",{method:"POST"});const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.error||"无法打开数据目录");flash("已打开本机数据目录");}catch(error){flash(error.message||"无法打开数据目录");}};
  const beginUndo=(message,previousCompanies,previousSelectedId)=>{clearTimeout(undoTimerRef.current);setUndoState({message,companies:previousCompanies,selectedId:previousSelectedId});undoTimerRef.current=setTimeout(()=>setUndoState(null),10000);};
  const beginProgressUndo=(message,companyId,previousProgress,nextProgress)=>{clearTimeout(undoTimerRef.current);setUndoState({message,kind:"progress",companyId,previousProgress,nextProgress});undoTimerRef.current=setTimeout(()=>setUndoState(null),10000);};
  const undoLast=()=>{if(!undoState)return;if(undoState.kind==="progress"){const target=companies.find((company)=>company.id===undoState.companyId);if(!target||target.progress!==undoState.nextProgress){clearTimeout(undoTimerRef.current);setUndoState(null);flash("进度已经再次变化，未执行旧撤销");return;}setCompanies((current)=>current.map((company)=>company.id===undoState.companyId?{...company,progress:undoState.previousProgress}:company));}else{setCompanies(undoState.companies);setSelectedId(undoState.selectedId);}setDirtyVersion((value)=>value+1);clearTimeout(undoTimerRef.current);setUndoState(null);flash("已撤销刚才的操作");};
  const openAdd=()=>{setLogoDraft(null);setJdImageDraft(null);setModal("add");}; const closeAdd=()=>{setLogoDraft(null);setJdImageDraft(null);setModal(null);}; const selectCompany=(id)=>setSelectedId(id); const openRoleEditor=(company)=>{setSelectedId(company.id);setJdImageDraft(company.jdImage?{name:"已有 JD 截图",dataUrl:company.jdImage}:null);setModal("role");}; const openQuickUpdate=(id)=>{if(id)setSelectedId(id);setModal("quick-update");};
  const selectLogo=async(event)=>{const file=event.target.files?.[0];if(!file)return;try{setLogoDraft(await storeLocalImage(await readLogoFile(file)));}catch(error){event.target.value="";setLogoDraft(null);flash(error.message||"无法读取 Logo");}};
  const selectJdImage=async(event)=>{const file=event.target.files?.[0];if(!file)return;try{setJdImageDraft(await storeLocalImage(await readJdImageFile(file)));}catch(error){event.target.value="";flash(error.message||"无法读取 JD 截图");}};
  const pasteJdImage=async(event)=>{const file=[...(event.clipboardData?.files||[])].find((item)=>item.type.startsWith("image/"));if(!file)return;event.preventDefault();try{setJdImageDraft(await storeLocalImage(await readJdImageFile(file)));flash("JD 截图已粘贴并保存到本机");}catch(error){flash(error.message||"无法读取 JD 截图");}};
  const openNode=(companyId,date,node=null,options={})=>{if(!companies.length){flash("请先添加一个岗位");return;}const targetCompanyId=companies.some((company)=>company.id===companyId)?companyId:"";setNodeDraft({companyId:targetCompanyId,originalCompanyId:targetCompanyId,date:date||dateKey(new Date()),id:node?.id||"",type:node?.type||"自定义",title:node?.title||"",time:node?.time||"",note:node?.note||"",review:node?.review||null,extra:node?Object.fromEntries(Object.entries(node).filter(([key])=>!["id","date","type","title","time","note","review"].includes(key))):{},syncActionDeadline:Boolean(options.syncActionDeadline)});setModal("node");};
  const openActionEditor=(item)=>{const company=companies.find((value)=>value.id===item.companyId);const node=(company?.timeline||[]).find((value)=>value.id===item.nodeId);if(node)openNode(item.companyId,node.date,node,{syncActionDeadline:item.sources?.includes("explicit")});else openQuickUpdate(item.companyId);};
  const saveProfile=(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);invalidateGenericUndo();setProfile((current)=>({...current,name:String(data.get("name")||"").trim(),title:String(data.get("title")||"").trim(),location:String(data.get("location")||"").trim()}));setDirtyVersion((value)=>value+1);setModal(null);flash("个人资料已保存");};
  const saveCompany=(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);const name=String(data.get("name")||"").trim();const role=String(data.get("role")||"").trim();if(!name||!role)return;const rawAppliedAt=String(data.get("appliedAt")||"").trim();const plannedAppliedAt=expandMonthDay(rawAppliedAt);if(rawAppliedAt&&!plannedAppliedAt){flash("投递时间无效，请按月-日填写");return;}invalidateGenericUndo();const hasApplied=Boolean(plannedAppliedAt&&plannedAppliedAt<=dateKey(new Date()));const logo=logoDraft?.dataUrl||matchLogo(name);const timeline=plannedAppliedAt?[{id:`node-${Date.now()}`,date:plannedAppliedAt,type:"投递",title:"",time:"",note:""}]:[];let status=String(data.get("status")||"待投递");let progress=String(data.get("progress")||"未开始");if(hasApplied&&status==="待投递")status="已投递";if(hasApplied&&progress==="未开始")progress="已投递";const company={id:`position-${Date.now()}`,name,team:String(data.get("team")||name).trim(),role,track:String(data.get("track")||"").trim(),channel:String(data.get("channel")||"").trim(),location:String(data.get("location")||"").trim(),batch:String(data.get("batch")||"").trim(),appliedAt:hasApplied?plannedAppliedAt:"",status,progress,nextAction:String(data.get("nextAction")||"").trim(),nextActionDeadline:String(data.get("nextActionDeadline")||""),priority:normalizePriority(data.get("priority")),jobUrl:String(data.get("jobUrl")||"").trim(),mark:name.slice(0,1),logoUrl:logo,jd:String(data.get("jd")||"").trim(),jdImage:jdImageDraft?.dataUrl||"",notes:String(data.get("notes")||"").trim(),timeline,files:[]};setCompanies(current=>[...current,company]);setDirtyVersion((value)=>value+1);setSelectedId(company.id);setLogoDraft(null);setJdImageDraft(null);setModal(null);flash(hasApplied?"投递记录已添加":"岗位已添加，未来投递时间已加入计划");};
  const saveApplicationSummary=(companyId,values)=>{const company=companies.find((item)=>item.id===companyId);if(!company){flash("找不到要更新的岗位");return false;}const result=updateApplicationRecord(company,values,dateKey(new Date()),`node-${Date.now()}`);if(result.error){flash(result.error);return false;}invalidateGenericUndo();setCompanies((current)=>current.map((item)=>item.id===companyId?result.company:item));setSelectedId(companyId);setDirtyVersion((value)=>value+1);flash(result.hasApplied||!result.plannedAppliedAt?"投递信息已更新，相关页面已同步":"投递信息已更新，未来投递计划已同步");return true;};
  const saveRole=(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);const result=updateApplicationRecord(selected,{name:data.get("name"),role:data.get("role"),team:data.get("team"),track:data.get("track"),channel:data.get("channel"),location:data.get("location"),batch:data.get("batch"),appliedAt:data.get("appliedAt"),status:data.get("status"),progress:data.get("progress"),nextAction:data.get("nextAction"),nextActionDeadline:data.get("nextActionDeadline"),priority:data.get("priority"),jobUrl:data.get("jobUrl"),jd:data.get("jd"),jdImage:jdImageDraft?.dataUrl||"",notes:data.get("notes")},dateKey(new Date()),`node-${Date.now()}`);if(result.error){flash(result.error);return;}invalidateGenericUndo();setCompanies((current)=>current.map((company)=>company.id===selectedId?result.company:company));setDirtyVersion((value)=>value+1);setJdImageDraft(null);setModal(null);flash(result.hasApplied||!result.plannedAppliedAt?"岗位资料已保存":"岗位资料已保存，未来投递时间继续作为计划");};
  const saveQuickUpdate=(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);invalidateGenericUndo();setCompanies(current=>current.map(company=>{if(company.id!==selectedId)return company;const status=preserveUnchangedExplicitValue(company.status,statusLabel(company),data.get("status"));const progress=preserveUnchangedExplicitValue(company.progress,currentProgress(company),data.get("progress"));const next={...company,status,progress,nextAction:String(data.get("nextAction")||"").trim(),nextActionDeadline:String(data.get("nextActionDeadline")||""),priority:normalizePriority(data.get("priority"))};if(status!==company.status||progress!==company.progress)next.lastActivityAt=dateKey(new Date());if(isArchivedApplication(next)&&data.get("clearAction")){next.nextAction="";next.nextActionDeadline="";}return next;}));setDirtyVersion((value)=>value+1);setModal(null);flash("岗位状态与下一步已更新");};
  const completeAction=(companyId)=>{const previous=companies;setCompanies(current=>current.map(company=>company.id===companyId?{...company,nextAction:"",nextActionDeadline:""}:company));setDirtyVersion((value)=>value+1);beginUndo("行动已完成",previous,selectedId);};
  const adoptProgressSuggestion=(companyId,progress)=>{if(!companyId||!progress)return;const company=companies.find((item)=>item.id===companyId);if(!company||company.progress===progress)return;setCompanies((current)=>current.map((item)=>item.id===companyId?{...item,progress}:item));setDirtyVersion((value)=>value+1);beginProgressUndo(`当前进度已更新为“${progress}”`,companyId,company.progress,progress);};
  const deleteRole=()=>{if(!selected)return;const previous=companies;const previousSelected=selectedId;const removedIdentity=companyIdentity(selected.name);const remaining=companies.filter(company=>company.id!==selected.id);const next=remaining.find(company=>companyIdentity(company.name)===removedIdentity)||remaining[0]||null;setCompanies(remaining);setDirtyVersion((value)=>value+1);setSelectedId(next?.id||"");setModal(null);beginUndo("岗位已删除",previous,previousSelected);};
  const saveNode=(event)=>{event.preventDefault();if(!nodeDraft.companyId){flash("请选择要关联的岗位");return;}const data=new FormData(event.currentTarget);const review={...(nodeDraft.review&&typeof nodeDraft.review==="object"?nodeDraft.review:{}),questions:String(data.get("reviewQuestions")||"").trim(),answer:String(data.get("reviewAnswer")||"").trim(),weakness:String(data.get("reviewWeakness")||"").trim(),next:String(data.get("reviewNext")||"").trim()};const reviewHasContent=Object.entries(review).some(([key,value])=>!["questions","answer","weakness","next"].includes(key)||Boolean(value));const node={...(nodeDraft.extra||{}),id:nodeDraft.id||`node-${Date.now()}`,date:nodeDraft.date,type:nodeDraft.type,title:String(data.get("title")||"").trim(),time:String(data.get("time")||"").trim(),note:String(data.get("note")||"").trim(),...(reviewHasContent?{review}: {})};invalidateGenericUndo();setCompanies(current=>{const next=upsertTimelineNode(current,nodeDraft.companyId,nodeDraft.originalCompanyId,node);return nodeDraft.syncActionDeadline?next.map((company)=>company.id===nodeDraft.companyId?{...company,nextActionDeadline:node.date}:company):next;});setDirtyVersion((value)=>value+1);setModal(null);flash("时间节点已保存，首页、甘特图、日历和分析已同步");};
  const deleteNode=()=>{const previous=companies;setCompanies(current=>removeTimelineNode(current,nodeDraft.originalCompanyId||nodeDraft.companyId,nodeDraft.id));setDirtyVersion((value)=>value+1);setModal(null);beginUndo("时间节点已删除",previous,selectedId);};
  const openCareerFile=async(path)=>{try{const response=await fetch("/api/career-ops/file/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({href:path})});if(!response.ok){const value=await response.json();throw new Error(value.error);}flash("已打开本地文件");}catch(error){flash(error.message||"无法打开文件");}};
  const importRoleFiles=async(companyId)=>{if(!companyId){flash("请先选择岗位");return;}try{const response=await fetch("/api/files/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({roleId:companyId})});const value=await response.json();if(!response.ok)throw new Error(value.error);if(value.cancelled)return;const files=Array.isArray(value.files)?value.files:[];invalidateGenericUndo();setCompanies(current=>current.map(company=>company.id===companyId?{...company,files:[...(company.files||[]),...files]}:company));setDirtyVersion((value)=>value+1);flash(`已归档 ${files.length} 个文件`);}catch(error){flash(error.message||"无法添加文件");}};
  const openStoredFile=async(path,reveal=false)=>{try{const response=await fetch("/api/files/open",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path,reveal})});const value=await response.json();if(!response.ok)throw new Error(value.error);flash(reveal?"已在 Finder 中显示":"已打开文件");}catch(error){flash(error.message||"无法打开文件");}};
  const canRestore=dirtyVersion===0&&!persistQueueRef.current.inFlight&&saveState.status!=="saving";
  const requestView=(next,id)=>{if(next===view&&(!id||id===selectedId))return true;if(applicationEditorState.open&&applicationEditorState.dirty&&!window.confirm("当前投递编辑还没有保存，是否放弃修改并切换页面？"))return false;setApplicationEditorState({open:false,dirty:false});if(id)setSelectedId(id);setView(next);return true;};
  const pageProps={companies,intelligence,loopRuns,career,profile,selectedId,selectedCompany:selected,selectCompany,openAdd,openRoleEditor,openQuickUpdate,openActionEditor,completeAction,adoptProgressSuggestion,saveApplicationSummary,onEditorStateChange:setApplicationEditorState,openNotifications:()=>setNotifications(true),navigate:requestView,openNode,openCareerFile,importRoleFiles,openStoredFile,openCareer:()=>requestView("prepare"),storage,saveState,exportData,importData,openDataDirectory,restoreBackup,canRestore};
  return <div className="aw-app">
    <aside className="aw-sidebar">
      <button className="aw-brand" onClick={()=>requestView("home")} aria-label="返回秋招工作台首页"><img src="/offer-penguin.jpg" alt="求 offer 企鹅"/></button>
      <div className="aw-global-search"><SearchField value={query} onChange={setQuery} placeholder="搜索公司、岗位或 JD" inputRef={searchRef} shortcut searchboxProps={{role:"combobox","aria-expanded":Boolean(query),"aria-controls":"aw-global-search-results","aria-autocomplete":"list"}}/>{query&&<div id="aw-global-search-results" className="aw-search-results" role="listbox" aria-label="全局搜索结果">{searchResults.slice(0,8).map((company)=><button type="button" role="option" aria-selected={company.id===selectedId} key={company.id} onClick={()=>{if(requestView("roles",company.id))setQuery("");}}><CompanyLogo company={company} size="sm"/><span><strong>{company.name}</strong><small>{company.role} · {categoryLabel(company.track)}</small></span><ArrowRight/></button>)}{!searchResults.length&&<p>没有找到匹配的岗位</p>}</div>}</div>
      <nav>{NAV.map(([id,label,Icon])=><button key={id} className={view===id?"is-active":""} onClick={()=>requestView(id)}><Icon/><span>{label}</span></button>)}</nav>
      <div className="aw-sidebar-bottom">
        <button className={`aw-save-indicator state-${staleDraft?"error":saveState.status}`} onClick={()=>staleDraft?setConflict("stale"):saveState.status==="error"?setConflict(conflict||"error"):requestView("settings")}><span>{staleDraft||saveState.status === "error" ? <X/> : <Check/>}</span><p><strong>{staleDraft?"有冲突草稿":saveState.status === "saving" ? "正在保存" : saveState.status === "error" ? "保存失败" : "本机已保存"}</strong><small>{storage?.backupCount ?? 0} 份历史备份</small></p><CaretRight/></button>
        <button className={view==="settings"?"is-active":""} onClick={()=>requestView("settings")}><Gear/><span>数据与设置</span></button>
        <button className="aw-profile" onClick={()=>setModal("profile")} aria-label="编辑个人资料"><span>{profileInitial(profile)}</span><p><strong>{profile.name||"设置个人资料"}</strong><small>{profile.title||"填写你的职位方向"}</small></p><CaretRight/></button>
      </div>
    </aside>
    <main className="aw-content">
      {view==="home"&&<HomePage {...pageProps}/>}
      {view==="applications"&&<ApplicationsPage {...pageProps}/>}
      {view==="roles"&&<RolesPage {...pageProps}/>}
      {view==="loop"&&<LoopRunsPage {...pageProps}/>}
      {view==="schedule"&&<SchedulePage {...pageProps}/>}
      {view==="analytics"&&<AnalyticsPage {...pageProps}/>}
      {view==="settings"&&<SettingsPage {...pageProps}/>}
    </main>
    {notice&&<div className="aw-toast" role="status" aria-live="polite"><Check/>{notice}</div>}
    {undoState&&<div className="aw-undo-toast" role="status"><span><CheckCircle/><strong>{undoState.message}</strong><small>10 秒内可恢复</small></span><button type="button" onClick={undoLast}>撤销</button></div>}
    {notifications&&<NotificationDrawer intelligence={intelligence} onClose={()=>setNotifications(false)}/>}
    {conflict&&<Modal title={conflict==="error"?"本机保存暂时失败":"检测到另一份数据"} onClose={()=>setConflict(false)} dismissible={conflict!=="stale"}><div className="aw-conflict-copy"><Bell/><div><h3>{conflict==="error"?"本页修改仍保存在浏览器草稿中":"磁盘数据已受到保护，未保存草稿没有被覆盖"}</h3><p>{conflict==="stale"?"启动时发现一份基于旧磁盘版本的草稿。处理完成前页面保持锁定，避免继续编辑覆盖草稿。你可以先下载，再决定使用磁盘版或继续保存草稿。":conflict==="error"?"可能是本地服务或磁盘短暂不可用。可以下载草稿、重试保存，或读取磁盘版本。":"你可能同时打开了两个秋招工作台标签页。请选择如何处理当前页面的内容。"}</p></div></div><div className="aw-conflict-actions"><button type="button" className="aw-outline-button" onClick={downloadCurrentDraft}><ArrowDown/>下载本页草稿</button><button type="button" className="aw-outline-button" onClick={loadDiskVersion}>使用磁盘最新版本</button><button type="button" className="aw-black-button" onClick={()=>window.confirm("这会把当前草稿作为新版本保存；磁盘当前版本仍可从历史快照恢复。是否继续？")&&retryCurrentDraft()}>继续保存草稿</button></div></Modal>}
    {modal==="add"&&<Modal title="添加投递" onClose={closeAdd}><form className="aw-form aw-tracker-form" onSubmit={saveCompany}>
      <datalist id="batch-options">{BATCH_OPTIONS.map((value)=><option key={value} value={value}/>)}</datalist><datalist id="progress-options">{PROGRESS_OPTIONS.map((value)=><option key={value} value={value}/>)}</datalist>
      <div><label>公司名称<input name="name" autoFocus required/></label><label>岗位名称<input name="role" required/></label></div>
      <div><label>投递赛道<select name="track" defaultValue="互联网">{TRACK_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label><label>投递渠道<select name="channel" defaultValue="官网">{CHANNEL_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label></div>
      <div><label>重视程度<select name="priority" defaultValue="3">{[1,2,3,4,5].map((value)=><option key={value} value={value}>{value} 分</option>)}</select></label><label>职位链接<input name="jobUrl" type="url"/></label></div>
      <details className="aw-form-details"><summary>完善批次、状态、JD 等资料 <CaretDown/></summary><div className="aw-form-details-body">
      <label className="aw-logo-upload"><input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={selectLogo}/><span className="aw-logo-upload__preview">{logoDraft?.dataUrl?<img src={logoDraft.dataUrl} alt="待上传的公司 Logo"/>:<ImageSquare/>}</span><span className="aw-logo-upload__copy"><strong>公司 Logo</strong><small>{logoDraft?.name||"可选，支持 PNG、JPG、WebP，最大 2MB"}</small></span><span className="aw-logo-upload__button"><UploadSimple/>{logoDraft?"更换图片":"上传 Logo"}</span></label>
      <div><label>团队<input name="team"/></label><label>城市<input name="location"/></label></div>
      <div><label>招聘批次<input name="batch" list="batch-options"/></label><label>投递时间（月-日）<input name="appliedAt" inputMode="numeric" pattern="[0-1][0-9]-[0-3][0-9]" placeholder="07-21"/></label></div>
      <div><label>当前状态<select name="status" defaultValue="待投递">{STATUS_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label><label>当前进度<input name="progress" list="progress-options" defaultValue="未开始"/></label></div>
      <div><label>下一步行动<input name="nextAction"/></label><label>行动 DDL<input name="nextActionDeadline" type="date"/></label></div>
      <label>岗位 JD<textarea name="jd" rows="7" onPaste={pasteJdImage}/></label>
      <label className="aw-jd-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectJdImage}/><UploadSimple/><span><strong>上传或直接粘贴 JD 截图</strong><small>{jdImageDraft?.name||"截图会完整保存在本机数据中"}</small></span>{jdImageDraft?.dataUrl&&<img src={jdImageDraft.dataUrl} alt="待保存的 JD 截图"/>}</label>
      <label>备注<textarea name="notes" rows="4"/></label>
      </div></details>
      <footer><button type="button" className="aw-outline-button" onClick={closeAdd}>取消</button><button className="aw-black-button" type="submit"><Plus/>添加投递</button></footer>
    </form></Modal>}
    {modal==="profile"&&<Modal title="个人资料" onClose={()=>setModal(null)}><form className="aw-form" onSubmit={saveProfile}><label>姓名<input name="name" autoFocus defaultValue={profile.name} placeholder="例如：张三"/></label><label>目标方向<input name="title" defaultValue={profile.title} placeholder="例如：AI 产品经理"/></label><label>工作地点<input name="location" defaultValue={profile.location} placeholder="可选"/></label><footer><button type="button" className="aw-outline-button" onClick={()=>setModal(null)}>取消</button><button className="aw-black-button" type="submit"><Check/>保存个人资料</button></footer></form></Modal>}
    {modal==="quick-update"&&selected&&<Modal title={`快速更新 · ${selected.name}`} onClose={()=>setModal(null)}><form key={selected.id} className="aw-form" onSubmit={saveQuickUpdate}><p className="aw-sync-hint"><TrendUp/>状态和进度保持分开；这里仅更新你确认的事实和下一步。</p><div><label>当前状态<select name="status" defaultValue={statusLabel(selected)}>{!STATUS_OPTIONS.includes(statusLabel(selected))&&<option>{statusLabel(selected)}</option>}{STATUS_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label><label>当前进度<input name="progress" list="quick-progress-options" defaultValue={currentProgress(selected)}/><datalist id="quick-progress-options">{PROGRESS_OPTIONS.map((value)=><option key={value} value={value}/>)}</datalist></label></div><div><label>下一步行动<input name="nextAction" autoFocus defaultValue={selected.nextAction}/></label><label>行动 DDL<input name="nextActionDeadline" type="date" defaultValue={selected.nextActionDeadline}/></label></div><label>重视程度<select name="priority" defaultValue={normalizePriority(selected.priority)}>{[1,2,3,4,5].map((value)=><option key={value} value={value}>{value} 分</option>)}</select></label><label className="aw-check-option"><input type="checkbox" name="clearAction" defaultChecked/><span><strong>如果状态已结束，自动清除旧行动和 DDL</strong><small>避免已拒绝或已放弃的岗位继续出现在今日行动中</small></span></label><footer><button type="button" className="aw-outline-button" onClick={()=>setModal(null)}>取消</button><button className="aw-black-button" type="submit"><Check/>保存更新</button></footer></form></Modal>}
    {modal==="role"&&selected&&<Modal title={`${selected.name} · ${selected.role}`} onClose={()=>setModal(null)}><form className="aw-form aw-tracker-form" onSubmit={saveRole}>
      <datalist id="batch-options">{BATCH_OPTIONS.map((value)=><option key={value} value={value}/>)}</datalist><datalist id="progress-options">{PROGRESS_OPTIONS.map((value)=><option key={value} value={value}/>)}</datalist>
      <div><label>公司名称<input name="name" defaultValue={selected.name} required/></label><label>岗位名称<input name="role" defaultValue={selected.role} required/></label></div>
      <div><label>投递赛道<select name="track" defaultValue={selected.track||""}><option value="">未分类</option>{TRACK_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label><label>投递渠道<select name="channel" defaultValue={selected.channel||""}><option value="">未分类</option>{CHANNEL_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label></div>
      <div><label>团队<input name="team" defaultValue={selected.team}/></label><label>城市<input name="location" defaultValue={selected.location}/></label></div>
      <div><label>招聘批次<input name="batch" list="batch-options" defaultValue={selected.batch}/></label><label>投递时间（月-日）<input name="appliedAt" inputMode="numeric" pattern="[0-1][0-9]-[0-3][0-9]" defaultValue={monthDayInput(applicationInputDate(selected))} placeholder="07-21"/></label></div>
      <div><label>当前状态<select name="status" defaultValue={statusLabel(selected)}>{!STATUS_OPTIONS.includes(statusLabel(selected))&&<option>{statusLabel(selected)}</option>}{STATUS_OPTIONS.map((value)=><option key={value}>{value}</option>)}</select></label><label>当前进度<input name="progress" list="progress-options" defaultValue={currentProgress(selected)}/></label></div>
      <div><label>下一步行动<input name="nextAction" defaultValue={selected.nextAction}/></label><label>行动 DDL<input name="nextActionDeadline" type="date" defaultValue={selected.nextActionDeadline}/></label></div>
      <div><label>重视程度<select name="priority" defaultValue={normalizePriority(selected.priority)}>{[1,2,3,4,5].map((value)=><option key={value} value={value}>{value} 分</option>)}</select></label><label>职位链接<input name="jobUrl" type="url" defaultValue={selected.jobUrl}/></label></div>
      <label>详细 JD<textarea name="jd" rows="11" defaultValue={selected.jd} onPaste={pasteJdImage}/></label>
      <label className="aw-jd-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectJdImage}/><UploadSimple/><span><strong>上传或直接粘贴 JD 截图</strong><small>{jdImageDraft?.name||"未添加截图"}</small></span>{jdImageDraft?.dataUrl&&<img src={jdImageDraft.dataUrl} alt="JD 截图预览"/>}</label>
      {jdImageDraft&&<button type="button" className="aw-remove-jd-image" onClick={()=>setJdImageDraft(null)}><Trash/>移除 JD 截图</button>}
      <label>岗位笔记<textarea name="notes" rows="5" defaultValue={selected.notes}/></label>
      <footer><button type="button" className="aw-danger-button" onClick={()=>setModal("delete-role")}><Trash/>删除岗位</button><div className="aw-form-actions"><button type="button" className="aw-outline-button" onClick={()=>setModal(null)}>取消</button><button className="aw-black-button" type="submit"><Check/>保存资料</button></div></footer>
    </form></Modal>}
    {modal==="delete-role"&&selected&&<Modal title="删除岗位" onClose={()=>setModal(null)}><div className="aw-delete-confirm"><span><Trash/></span><div><h3>确认删除“{selected.role}”？</h3><p>{companyDisplayName(selected.name)} 下的其他岗位会继续保留。当前岗位的 JD、笔记和时间轴会从工作台移除，本地归档文件不会从磁盘删除。</p></div></div><div className="aw-delete-actions"><button type="button" className="aw-outline-button" onClick={()=>setModal("role")}>返回</button><button type="button" className="aw-danger-button is-solid" onClick={deleteRole}><Trash/>确认删除岗位</button></div></Modal>}
    {modal==="node"&&<Modal title={nodeDraft?.id?"编辑时间节点":"新建时间节点"} onClose={()=>setModal(null)}><form className="aw-form" onSubmit={saveNode}><p className="aw-sync-hint"><Check/>只需保存一次，首页、岗位流程、甘特图、日历和数据分析会自动同步。</p><label>关联岗位<select required value={nodeDraft.companyId} disabled={nodeDraft.syncActionDeadline} onChange={e=>setNodeDraft({...nodeDraft,companyId:e.target.value})}><option value="" disabled>请选择岗位</option>{companies.map(company=><option value={company.id} key={company.id}>{company.name} · {company.role}</option>)}</select>{nodeDraft.syncActionDeadline&&<small>此节点关联了该岗位的行动 DDL，改期时不能切换岗位。</small>}</label><div><label>日期<input type="date" required value={nodeDraft.date} onChange={e=>setNodeDraft({...nodeDraft,date:e.target.value})}/></label><label>时间<input type="time" name="time" defaultValue={nodeDraft.time}/></label></div><label>类型<select value={nodeDraft.type} onChange={e=>setNodeDraft({...nodeDraft,type:e.target.value})}>{["投递","简历筛选","笔试","测评","一面","二面","三面","终面","HR 面","Offer","签约/入职","截止日","自定义"].map(type=><option key={type}>{type}</option>)}</select></label><label>标题<input name="title" defaultValue={nodeDraft.title}/></label><label>备注<textarea name="note" defaultValue={nodeDraft.note} rows="3"/></label>{/面/.test(nodeDraft.type)&&<details className="aw-form-details aw-review-form" open={Boolean(nodeDraft.review)}><summary>面试复盘（可选） <CaretDown/></summary><div className="aw-form-details-body"><label>问了什么<textarea name="reviewQuestions" defaultValue={nodeDraft.review?.questions} rows="3"/></label><label>我是怎么回答的<textarea name="reviewAnswer" defaultValue={nodeDraft.review?.answer} rows="3"/></label><label>哪里不够好<textarea name="reviewWeakness" defaultValue={nodeDraft.review?.weakness} rows="3"/></label><label>下次怎么改<textarea name="reviewNext" defaultValue={nodeDraft.review?.next} rows="3"/></label></div></details>}<footer>{nodeDraft.id?<button className="aw-danger-button" type="button" onClick={deleteNode}><Trash/>删除</button>:<span/>}<button className="aw-black-button" type="submit"><Check/>保存并同步</button></footer></form></Modal>}
  </div>;
}
