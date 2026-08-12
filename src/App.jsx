import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Briefcase,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  ClipboardText,
  ClockCounterClockwise,
  House,
  MagnifyingGlass,
  NewspaperClipping,
  Plus,
  Sparkle,
  Trash,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import CareerOpsView from "./CareerOps.jsx";

const COMPANY_PRESETS = [
  { id: "alibaba", name: "阿里", aliases: ["阿里", "阿里巴巴", "alibaba", "淘天"], logoUrl: "/logos/preset-alibaba.png", mark: "阿" },
  { id: "tencent", name: "腾讯", aliases: ["腾讯", "tencent", "qq"], logoUrl: "/logos/preset-tencent.png", logoFit: "cover", mark: "腾" },
  { id: "xiaohongshu", name: "小红书", aliases: ["小红书", "xiaohongshu", "rednote"], logoUrl: "/logos/preset-xiaohongshu.png", mark: "红" },
  { id: "pinduoduo", name: "拼多多", aliases: ["拼多多", "pinduoduo", "pdd"], logoUrl: "/logos/preset-pinduoduo.jpg", logoFit: "cover", mark: "拼" },
  { id: "jd", name: "京东", aliases: ["京东", "jingdong", "jd", "jd.com"], logoUrl: "/logos/preset-jd.png", logoFit: "cover", mark: "京" },
  { id: "baidu", name: "百度", aliases: ["百度", "baidu"], logoUrl: "/logos/preset-baidu.png", mark: "百" },
  { id: "deepseek", name: "DeepSeek", aliases: ["deepseek", "深度求索"], logoUrl: "/logos/preset-deepseek.png", mark: "D" },
  { id: "kimi", name: "Kimi", aliases: ["kimi", "月之暗面", "moonshot", "moonshotai"], logoUrl: "/logos/preset-kimi.png", mark: "K" },
  { id: "minimax", name: "MiniMax", aliases: ["minimax", "稀宇", "稀宇科技"], logoUrl: "/logos/preset-minimax.png", logoFit: "cover", mark: "M" },
  { id: "zhipu", name: "智谱", aliases: ["智谱", "智谱ai", "智谱华章", "zhipu", "z.ai", "glm"], logoUrl: "/logos/preset-zhipu.png", logoFit: "cover", backgroundColor: "#2D2D2D", mark: "智" },
  { id: "kuaishou", name: "快手", aliases: ["快手", "kuaishou"], logoUrl: "/logos/preset-kuaishou.png", mark: "快" },
];

const NODE_TYPES = ["投递", "笔试", "一面", "二面", "三面", "HR 面", "Offer", "截止日", "自定义"];
const INTELLIGENCE_SCHEDULE = "每天 22:30";
const NAV_ITEMS = [
  ["overview", "总览", House],
  ["roles", "岗位库", Briefcase],
  ["discovery", "情报台", MagnifyingGlass],
  ["prepare", "准备", ClipboardText],
];

const INITIAL_COMPANIES = [];

const EMPTY_INTELLIGENCE = {
  generatedAt: null,
  opportunities: [],
  roleBriefs: {},
  updates: [],
  applicationSync: {
    checkedAt: null,
    status: "not_configured",
    appliedCount: 0,
    checkedCount: 0,
    records: {},
    changes: [],
  },
  automation: {
    name: "秋招情报 Loop",
    schedule: INTELLIGENCE_SCHEDULE,
    status: "not_configured",
  },
};

const EMPTY_CAREER_SNAPSHOT = {
  connected: false,
  applications: [],
  pipelineCount: 0,
  assetCounts: {
    reports: 0,
    outputs: 0,
    interviews: 0,
  },
};

function normalizeIntelligence(value) {
  if (!value || typeof value !== "object") return EMPTY_INTELLIGENCE;
  const applicationSync = value.applicationSync && typeof value.applicationSync === "object"
    ? value.applicationSync
    : {};
  return {
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : null,
    opportunities: Array.isArray(value.opportunities) ? value.opportunities : [],
    roleBriefs: value.roleBriefs && typeof value.roleBriefs === "object" && !Array.isArray(value.roleBriefs)
      ? value.roleBriefs
      : {},
    updates: Array.isArray(value.updates) ? value.updates : [],
    applicationSync: {
      checkedAt: typeof applicationSync.checkedAt === "string" ? applicationSync.checkedAt : null,
      status: ["complete", "partial", "blocked", "not_configured"].includes(applicationSync.status)
        ? applicationSync.status
        : "not_configured",
      appliedCount: Number.isFinite(applicationSync.appliedCount) ? applicationSync.appliedCount : 0,
      checkedCount: Number.isFinite(applicationSync.checkedCount) ? applicationSync.checkedCount : 0,
      records: applicationSync.records && typeof applicationSync.records === "object" && !Array.isArray(applicationSync.records)
        ? applicationSync.records
        : {},
      changes: Array.isArray(applicationSync.changes) ? applicationSync.changes : [],
    },
    automation: {
      name: value.automation?.name || "秋招情报 Loop",
      schedule: value.automation?.schedule || INTELLIGENCE_SCHEDULE,
      status: value.automation?.status === "active" ? "active" : "not_configured",
    },
  };
}

const INTERNSHIP_PATTERN = /实习|intern(?:ship)?|日常实习|暑期实习|留用实习/i;
const SOCIAL_RECRUITING_PATTERN = /社会招聘|社招/i;
const UNVERIFIED_CAMPUS_PATTERN = /未注明(?:校招|校园|招聘届别)|未确认(?:校招|校园|届别)|无法确认(?:校招|校园|届别)|需.{0,12}核验.{0,12}(?:校招|校园|届别|应届)/i;
const AUTUMN_RECRUITING_PATTERN = /秋招|校园招聘|校招|应届|20(?:2[6-9]|3[0-2])届|管培生|管培项目|产培生|产品培训生|graduate\s*(?:program|programme|trainee)|campus/i;

function isAutumnFullTimeOpportunity(opportunity) {
  if (!opportunity || typeof opportunity !== "object") return false;
  const text = [
    opportunity.title,
    opportunity.role,
    opportunity.summary,
    opportunity.source,
    ...(Array.isArray(opportunity.tags) ? opportunity.tags : []),
  ].filter(Boolean).join(" ");
  const employmentType = String(opportunity.employmentType || "").toLowerCase();
  const recruitingTrack = String(opportunity.recruitingTrack || "").toLowerCase();

  if (INTERNSHIP_PATTERN.test(text) || /intern/.test(employmentType)) return false;
  if (SOCIAL_RECRUITING_PATTERN.test(text) || recruitingTrack === "social") return false;
  if (UNVERIFIED_CAMPUS_PATTERN.test(text)) return false;
  if (employmentType && !["campus_full_time", "full_time", "graduate"].includes(employmentType)) return false;
  if (recruitingTrack && !["autumn", "campus", "graduate"].includes(recruitingTrack)) return false;
  return AUTUMN_RECRUITING_PATTERN.test(text)
    || employmentType === "campus_full_time"
    || recruitingTrack === "autumn"
    || recruitingTrack === "campus";
}

function formatUpdateTime(value) {
  if (!value) return "时间未注明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未注明";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizeCompanyName(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function matchCompanyPreset(value) {
  const normalized = normalizeCompanyName(value);
  if (!normalized) return null;
  return COMPANY_PRESETS.find((preset) => preset.aliases.some((alias) => {
    const normalizedAlias = normalizeCompanyName(alias);
    return normalized === normalizedAlias || normalized.includes(normalizedAlias);
  })) || null;
}

function companyClusterKey(company) {
  const preset = COMPANY_PRESETS.find((item) => item.id === company?.presetId)
    || matchCompanyPreset(company?.name)
    || matchCompanyPreset(company?.team);
  return preset ? `preset:${preset.id}` : `name:${normalizeCompanyName(company?.name)}`;
}

function groupCompanies(companies) {
  const groups = new Map();
  for (const company of companies || []) {
    const key = companyClusterKey(company);
    if (!groups.has(key)) {
      const preset = COMPANY_PRESETS.find((item) => item.id === company?.presetId)
        || matchCompanyPreset(company?.name)
        || matchCompanyPreset(company?.team);
      groups.set(key, {
        key,
        name: preset?.name || company.name,
        positions: [],
      });
    }
    groups.get(key).positions.push(company);
  }
  return [...groups.values()];
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - day + 1);
  return next;
}

function formatMonthDay(value) {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFullDate(value) {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function latestNode(company) {
  return [...(company.timeline || [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1) || null;
}

function latestScheduledNode(company, todayKey) {
  return [...(company.timeline || [])]
    .filter((node) => node.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1) || null;
}

function nodeDisplayName(node) {
  if (!node) return "自定义";
  const title = String(node.title || "").trim();
  return node.type === "自定义" && title ? title : node.type;
}

function xiaohongshuCoverageLabel(coverage) {
  const count = Number(coverage?.xiaohongshuPosts || 0);
  const candidates = Array.isArray(coverage?.xiaohongshuCandidates)
    ? coverage.xiaohongshuCandidates.length
    : 0;
  const providedLinks = Array.isArray(coverage?.xiaohongshuProvidedLinks)
    ? coverage.xiaohongshuProvidedLinks.length
    : 0;
  const status = coverage?.xiaohongshuStatus;
  if (status === "blocked" && providedLinks > 0) {
    return `${providedLinks} 条原帖直链，正文待核验`;
  }
  if (status === "blocked" && candidates > 0) return `已发现 ${candidates} 篇，链接待核验`;
  if (status === "blocked") return "小红书采集受限";
  if (status === "not_run") return "小红书待采集";
  return `${count} 篇小红书经验`;
}

function deriveStatus(company) {
  const node = latestNode(company);
  if (!node) return "待开始";
  if (node.type === "Offer") return "已完成";
  return nodeDisplayName(node);
}

function hasApplicationProgress(company) {
  return (company.timeline || []).some((node) =>
    ["投递", "笔试", "一面", "二面", "三面", "HR 面", "Offer"].includes(node.type)
      || node.syncSource === "official-application-status");
}

function applicationRecordLabel(record) {
  if (record?.accessStatus === "blocked") return "等待登录后重试";
  if (record?.accessStatus === "unavailable") return "官网暂不提供后续状态";
  return record?.officialStatus || record?.normalizedStage || "等待首次核对";
}

function CompanyMark({ company, compact = false }) {
  const preset = COMPANY_PRESETS.find((item) => item.id === company.presetId)
    || matchCompanyPreset(company.name)
    || matchCompanyPreset(company.team);
  const brand = preset ? {
    ...company,
    logoUrl: preset.logoUrl,
    logoFit: preset.logoFit,
    backgroundColor: preset.backgroundColor,
    mark: preset.mark,
  } : company;

  return (
    <span
      className={`company-mark company-mark--${brand.tone || "preset"} ${brand.logoFit === "cover" ? "company-mark--cover" : ""} ${compact ? "company-mark--compact" : ""}`}
      style={brand.backgroundColor ? { backgroundColor: brand.backgroundColor } : undefined}
      aria-hidden="true"
    >
      {brand.logoUrl ? (
        <>
          <img
            src={brand.logoUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling.style.display = "inline";
            }}
          />
          <span className="company-mark__fallback">{brand.mark}</span>
        </>
      ) : brand.mark}
    </span>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const handler = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function CompanyRail({ companies, selectedId, onSelect, onAdd }) {
  const railRef = useRef(null);
  const groups = groupCompanies(companies);
  const selectedGroup = groups.find((group) => group.positions.some((position) => position.id === selectedId));
  return (
    <section className="company-rail-wrap" aria-label="岗位导航">
      <button
        className="rail-arrow"
        onClick={() => railRef.current?.scrollBy({ left: -280, behavior: "smooth" })}
        aria-label="向前查看"
      >
        <CaretLeft />
      </button>
      <div className="company-rail" ref={railRef} role="tablist">
        {groups.map((group) => {
          const selectedPosition = group.positions.find((position) => position.id === selectedId);
          const representative = selectedPosition || group.positions[0];
          const isSelected = Boolean(selectedPosition);
          return (
            <button
              className={`company-tab ${isSelected ? "is-selected" : ""}`}
              key={group.key}
              onClick={() => onSelect(representative.id)}
              role="tab"
              aria-selected={isSelected}
            >
              <CompanyMark company={representative} />
              <span className="company-tab__name">{group.name}</span>
              <small>{group.positions.length > 1 ? `${group.positions.length} 个岗位` : representative.role}</small>
            </button>
          );
        })}
        <button className="company-tab company-tab--add" onClick={onAdd}>
          <span className="company-mark"><Plus /></span>
          <span className="company-tab__name">添加岗位</span>
          <small>新公司或新岗位</small>
        </button>
      </div>
      <button
        className="rail-arrow"
        onClick={() => railRef.current?.scrollBy({ left: 280, behavior: "smooth" })}
        aria-label="向后查看"
      >
        <CaretRight />
      </button>
      {selectedGroup?.positions.length > 1 && (
        <div className="company-cluster-rolebar" aria-label={`${selectedGroup.name}岗位`}>
          <span>{selectedGroup.name}岗位</span>
          {selectedGroup.positions.map((position) => (
            <button
              key={position.id}
              className={position.id === selectedId ? "is-selected" : ""}
              onClick={() => onSelect(position.id)}
            >
              {position.role}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function MiniTimeline({ company, onEdit }) {
  const nodes = [...(company.timeline || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!nodes.length) {
    return (
      <button className="timeline-empty" onClick={onEdit}>
        <CalendarBlank />
        <span><strong>还没有时间节点</strong><small>点击日期，设置投递、面试或结果</small></span>
        <ArrowRight />
      </button>
    );
  }

  return (
    <div className="mini-timeline">
      <span className="mini-timeline__line" />
      {nodes.map((node) => (
        <button key={node.id} onClick={onEdit}>
          <span className="mini-timeline__dot" />
          <strong>{nodeDisplayName(node)}</strong>
          <small>{formatMonthDay(node.date)}{node.time ? ` ${node.time}` : ""}</small>
        </button>
      ))}
      <button className="mini-timeline__add" onClick={onEdit}><Plus /> 添加节点</button>
    </div>
  );
}

function PublicProcessTimeline({ brief, onOpenIntel }) {
  const recordedNodes = Array.isArray(brief?.processTimeline) ? brief.processTimeline : [];
  const inferredNodes = recordedNodes.length ? [] : (brief?.experienceSections || [])
    .filter((section) => /网申|投递|筛选|笔试|测评|群面|一面|二面|三面|HR|终面|Offer/i.test(section.title || ""))
    .map((section) => {
      const sourceIds = [...new Set((section.questions || []).flatMap((question) =>
        (question.answers || []).flatMap((answer) => answer.sourceIds || [])))];
      const title = /Offer/i.test(section.title || "") ? "Offer / 选择" : section.title;
      const priorities = [
        [/网申|投递|筛选/, 10],
        [/笔试|测评/, 20],
        [/群面/, 30],
        [/一面/, 40],
        [/二面/, 50],
        [/三面/, 60],
        [/HR|终面/, 70],
        [/Offer/i, 80],
      ];
      return {
        id: `section-${section.id || title}`,
        order: priorities.find(([pattern]) => pattern.test(title))?.[1] || 90,
        title,
        dateLabel: "正在汇总往届时间区间",
        description: section.summary,
        evidenceType: "experience",
        confidence: "pending",
        sourceIds,
      };
    });
  const nodes = recordedNodes.length ? recordedNodes : inferredNodes;
  const sortedNodes = [...nodes].sort((a, b) => {
    if (Number.isFinite(a.order) && Number.isFinite(b.order)) return a.order - b.order;
    return String(a.date || a.dateStart || a.dateLabel || "").localeCompare(String(b.date || b.dateStart || b.dateLabel || ""));
  });
  const evidenceLabel = (node) => {
    if (node.evidenceType === "official") return "官网日期";
    if (node.evidenceType === "verified_listing") return "招聘方职位页";
    if (node.evidenceType === "experience_consensus") return `${node.sourceIds?.length || 2} 篇经验归纳`;
    if (node.evidenceType === "experience_single") return "单篇候选人记录";
    return "经验整理";
  };
  const confidenceLabel = (confidence) => ({
    high: "高可信",
    medium: "中可信",
    low: "低可信",
    pending: "待补时间证据",
  }[confidence] || "");

  if (!sortedNodes.length) {
    return (
      <button className="timeline-empty public-timeline-empty" onClick={onOpenIntel}>
        <NewspaperClipping />
        <span>
          <strong>还没有公开流程节点</strong>
          <small>下一轮 Loop 会从官网和经验资料整理网申、笔试、面试与 Offer 流程</small>
        </span>
        <ArrowRight />
      </button>
    );
  }

  return (
    <div className="public-process-timeline">
      <span className="public-process-timeline__line" />
      {sortedNodes.map((node, index) => (
        <button key={node.id || `${node.title}-${index}`} onClick={onOpenIntel}>
          <span className={`public-process-timeline__dot public-process-timeline__dot--${node.evidenceType || "experience"}`} />
          <strong>{node.title || node.type || "流程节点"}</strong>
          <small>{node.dateLabel || node.date || node.dateStart || "日期待确认"}</small>
          <em>
            {evidenceLabel(node)}
            {confidenceLabel(node.confidence) && <span>{confidenceLabel(node.confidence)}</span>}
          </em>
        </button>
      ))}
    </div>
  );
}

function SeasonDashboard({
  companies,
  intelligence,
  careerSnapshot,
  unreadProgressChanges,
  selectedIds,
  onToggleCompany,
  weekStart,
  onWeekChange,
  onToday,
  onCell,
  onNavigate,
}) {
  const applications = careerSnapshot?.applications || [];
  const activeApplications = applications.filter((item) => !["Rejected", "Discarded", "SKIP"].includes(item.status));
  const appliedCompanies = companies.filter(hasApplicationProgress);
  const timelineInterviewCount = companies.filter((company) => (company.timeline || []).some((node) =>
    ["一面", "二面", "三面", "HR 面", "Offer"].includes(node.type)
      || /面试|offer/i.test(node.title || ""))).length;
  const interviewCount = Math.max(
    applications.filter((item) => ["Interview", "Offer", "Hired"].includes(item.status)).length,
    timelineInterviewCount,
  );
  const activeApplicationCount = Math.max(activeApplications.length, appliedCompanies.length);
  const applicationRecords = Object.values(intelligence.applicationSync?.records || {});
  const intelligenceCount = Object.keys(intelligence.roleBriefs || {}).length;
  const upcomingNodes = companies
    .map((company) => ({ company, node: latestScheduledNode(company, toDateKey(new Date())) }))
    .filter(({ node }) => node)
    .sort((a, b) => a.node.date.localeCompare(b.node.date))
    .slice(0, 6);
  const missingJd = companies.filter((company) => !company.jd).length;
  const missingTimeline = companies.filter((company) => !(company.timeline || []).length).length;
  const funnelStatuses = [
    ["Evaluated", "待决定"],
    ["Applied", "已投递"],
    ["Responded", "有回复"],
    ["Interview", "面试中"],
    ["Offer", "Offer"],
    ["Hired", "已入职"],
  ];

  return (
    <main className="page season-dashboard">
      <div className="page-heading season-dashboard__heading">
        <div>
          <span className="page-eyebrow">2027 秋招控制台</span>
          <h1>总览</h1>
          <p>在一个页面里看清整体进度、近期日程、情报覆盖和最需要推进的事情。</p>
        </div>
        <span className="summary-count">{companies.length}<small>个在册岗位</small></span>
      </div>

      {unreadProgressChanges.length > 0 && (
        <section className="season-progress-alert" aria-label="官网投递进度更新">
          <span><Bell weight="fill" /></span>
          <div>
            <strong>{unreadProgressChanges.length} 条官网进度更新</strong>
            <p>{unreadProgressChanges[0].title}。{unreadProgressChanges[0].summary}</p>
          </div>
          <button onClick={() => onNavigate("roles", unreadProgressChanges[0].companyId)}>查看岗位 <ArrowRight /></button>
        </section>
      )}

      <section className="season-metrics" aria-label="秋招整体数据">
        <button onClick={() => onNavigate("roles")}>
          <strong>{companies.length}</strong>
          <span>岗位库</span>
          <small>{groupCompanies(companies).length} 家公司</small>
        </button>
        <button onClick={() => onNavigate("roles")}>
          <strong>{activeApplicationCount}</strong>
          <span>活跃申请</span>
          <small>{applications.length ? `${applications.length} 条 Career Ops 记录` : `${appliedCompanies.length} 个时间轴已投递`}</small>
        </button>
        <button onClick={() => onNavigate("prepare")}>
          <strong>{interviewCount}</strong>
          <span>进入面试</span>
          <small>含 Offer 与已入职</small>
        </button>
        <button onClick={() => onNavigate("roles")}>
          <strong>{intelligenceCount}/{companies.length}</strong>
          <span>情报覆盖</span>
          <small>{intelligence.automation?.schedule || INTELLIGENCE_SCHEDULE} 更新</small>
        </button>
        <button onClick={() => onNavigate("discovery")}>
          <strong>{careerSnapshot?.pipelineCount || 0}</strong>
          <span>待处理机会</span>
          <small>来自岗位检索队列</small>
        </button>
      </section>

      {applicationRecords.length > 0 && (
        <section className="season-sync-strip" aria-label="官网进度同步状态">
          <header>
            <div><Bell /><span><strong>官网进度</strong><small>{intelligence.applicationSync?.checkedAt ? `最近核对 ${formatUpdateTime(intelligence.applicationSync.checkedAt)}` : "等待首次核对"}</small></span></div>
            <em>{intelligence.applicationSync?.checkedCount || 0}/{intelligence.applicationSync?.appliedCount || appliedCompanies.length} 已核对</em>
          </header>
          <div>
            {applicationRecords.map((record) => (
              <button key={record.companyId} onClick={() => onNavigate("roles", record.companyId)}>
                <span>{record.company}</span>
                <strong>{record.role}</strong>
                <small>{applicationRecordLabel(record)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="season-dashboard__grid">
        <section className="season-panel season-priorities">
          <header>
            <div>
              <h2>现在最值得做</h2>
              <p>根据当前数据自动汇总，不制造虚假的紧迫感。</p>
            </div>
            <Sparkle />
          </header>
          <div className="season-priority-list">
            {unreadProgressChanges.map((change) => (
              <button key={change.id} onClick={() => onNavigate("roles", change.companyId)}>
                <span><Bell weight="fill" /></span>
                <div><strong>{change.title}</strong><small>{change.summary}</small></div>
                <ArrowRight />
              </button>
            ))}
            {careerSnapshot?.pipelineCount > 0 && (
              <button onClick={() => onNavigate("discovery")}>
                <span><MagnifyingGlass /></span>
                <div><strong>处理 {careerSnapshot.pipelineCount} 条新机会</strong><small>先判断是否值得进入岗位库</small></div>
                <ArrowRight />
              </button>
            )}
            {missingJd > 0 && (
              <button onClick={() => onNavigate("roles")}>
                <span><ClipboardText /></span>
                <div><strong>补全 {missingJd} 个岗位的 JD</strong><small>没有 JD，评估和定制材料都缺少可靠上下文</small></div>
                <ArrowRight />
              </button>
            )}
            {missingTimeline > 0 && (
              <button onClick={() => onNavigate("roles")}>
                <span><CalendarBlank /></span>
                <div><strong>为 {missingTimeline} 个岗位设置下一节点</strong><small>让投递、笔试和面试进度真正可追踪</small></div>
                <ArrowRight />
              </button>
            )}
            {!unreadProgressChanges.length && !careerSnapshot?.pipelineCount && !missingJd && !missingTimeline && (
              <div className="season-priority-empty">
                <Check weight="bold" />
                <span><strong>基础信息已经完整</strong><small>下一步可以把精力放在重点岗位准备上。</small></span>
              </div>
            )}
          </div>
        </section>

        <section className="season-panel season-agenda">
          <header>
            <div>
              <h2>近期节点</h2>
              <p>来自岗位库中的真实投递时间轴。</p>
            </div>
            <CalendarBlank />
          </header>
          <div className="season-agenda-list">
            {upcomingNodes.length ? upcomingNodes.map(({ company, node }) => (
              <button key={`${company.id}-${node.id || node.date}`} onClick={() => onNavigate("roles", company.id)}>
                <time>{formatMonthDay(node.date)}</time>
                <CompanyMark company={company} compact />
                <span><strong>{company.name} · {nodeDisplayName(node)}</strong><small>{company.team} · {company.role}</small></span>
                <ArrowRight />
              </button>
            )) : (
              <div className="season-priority-empty">
                <CalendarBlank />
                <span><strong>还没有未来节点</strong><small>可以直接在下方日历中添加。</small></span>
              </div>
            )}
          </div>
        </section>

        <section className="season-panel season-funnel">
          <header>
            <div>
              <h2>申请漏斗</h2>
              <p>与岗位时间轴实时同步，只统计你明确记录的申请进度。</p>
            </div>
            <Briefcase />
          </header>
          <div className="season-funnel-bars">
            {funnelStatuses.map(([status, label]) => {
              const count = applications.filter((item) => item.status === status).length;
              const width = applications.length ? Math.max(4, (count / applications.length) * 100) : 4;
              return (
                <div key={status}>
                  <span>{label}<small>{count}</small></span>
                  <i><b style={{ width: `${width}%`, opacity: count ? 1 : 0.16 }} /></i>
                </div>
              );
            })}
          </div>
          {!applications.length && <p className="season-panel-empty">还没有记录投递、回复或面试节点，所以这里保持为 0。</p>}
        </section>
      </div>

      <TimelineView
        embedded
        companies={companies}
        selectedIds={selectedIds}
        onToggleCompany={onToggleCompany}
        weekStart={weekStart}
        onWeekChange={onWeekChange}
        onToday={onToday}
        onCell={onCell}
      />
    </main>
  );
}

function Overview({
  companies,
  selected,
  selectedId,
  intelligence,
  onSelect,
  onAdd,
  onAddNode,
  onOpenTimeline,
  onEditJd,
  onOpenItem,
  onOpenCareer,
  onDelete,
}) {
  if (!selected) {
    return (
      <main className="page overview-page">
        <div className="page-heading">
          <div>
            <h1>岗位库</h1>
            <p>从第一个岗位开始，按公司保存档案、进度与公开情报。</p>
          </div>
          <span className="summary-count">0<small>个岗位</small></span>
        </div>
        <CompanyRail companies={[]} selectedId="" onSelect={onSelect} onAdd={onAdd} />
        <section className="first-run">
          <span className="first-run__icon"><Plus /></span>
          <h2>添加第一个岗位</h2>
          <p>选择公司、填写岗位名称，然后在时间轴上直接设置投递和面试节点。</p>
          <button className="primary-button" onClick={onAdd}><Plus /> 添加岗位</button>
        </section>
      </main>
    );
  }

  const companyBrief = intelligence.roleBriefs?.[selected.id];
  const companyGroups = groupCompanies(companies);
  const currentNode = latestNode(selected);
  const nextNode = [...(selected.timeline || [])]
    .filter((node) => parseDateKey(node.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <main className="page overview-page">
      <div className="page-heading">
        <div>
          <h1>岗位库</h1>
          <p>按公司集合岗位档案、真实进度与公开情报，不再分散到两个库。</p>
        </div>
        <span className="summary-count">{companyGroups.length}<small>家公司 · {companies.length} 个岗位</small></span>
      </div>

      <CompanyRail companies={companies} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} />

      <section className="company-focus">
        <header className="company-focus__header">
          <div className="company-focus__identity">
            <CompanyMark company={selected} />
            <div>
              <div className="company-title-line">
                <h2>{selected.name}</h2>
                <span className="status-label">{deriveStatus(selected)}</span>
              </div>
              <p>
                {selected.team}
                <span />
                {selected.role}
                {selected.location && <><span />{selected.location}</>}
              </p>
            </div>
          </div>
          <div className="company-focus__actions">
            <button className="secondary-button career-context-button" onClick={onOpenCareer}><Sparkle /> 岗位评估与准备</button>
            <button className="secondary-button" onClick={onEditJd}><ClipboardText /> {selected.jd ? "编辑 JD" : "粘贴 JD"}</button>
            <button className="primary-button" onClick={onAddNode}><Plus /> 添加节点</button>
            <button className="icon-button bordered delete-company-button" onClick={onDelete} aria-label={`删除${selected.name}`} title="删除公司或岗位"><Trash /></button>
          </div>
        </header>

        <div className="company-status-strip">
          <div>
            <span>当前进度</span>
            <strong>{currentNode ? nodeDisplayName(currentNode) : "待开始"}</strong>
          </div>
          <div>
            <span>下一节点</span>
            <strong>{nextNode ? `${formatMonthDay(nextNode.date)} ${nodeDisplayName(nextNode)}` : "未设置"}</strong>
          </div>
          <div>
            <span>岗位信息</span>
            <strong>{selected.jd ? "JD 已保存" : "等待补充 JD"}</strong>
          </div>
          <div>
            <span>情报更新</span>
            <strong>{companyBrief?.updatedAt ? formatMonthDay(companyBrief.updatedAt.slice(0, 10)) : "等待首次运行"}</strong>
          </div>
        </div>

        <CareerOpsView selectedRole={selected} roles={companies} surface="role" embedded />

        <section className="focus-section">
          <div className="section-heading">
            <div>
              <h3>投递时间轴</h3>
              <p>所有进度都从日期节点自动生成。</p>
            </div>
            <button className="text-button" onClick={onOpenTimeline}>打开时间轴 <ArrowRight /></button>
          </div>
          <MiniTimeline company={selected} onEdit={onAddNode} />
        </section>

        <div className="focus-columns">
          <section className="focus-section focus-section--info">
            <div className="section-heading">
              <div>
                <h3>岗位资料</h3>
                <p>这里保留面试准备需要的最少信息。</p>
              </div>
            </div>
            <button className="info-row" onClick={onEditJd}>
              <span>岗位 JD</span>
              <strong>{selected.jd ? "已保存，点击查看" : "未填写"}</strong>
              <ArrowRight />
            </button>
            <div className="info-row info-row--static">
              <span>个人备注</span>
              <strong>{selected.notes || "未填写"}</strong>
            </div>
          </section>

          <section className="focus-section focus-section--intel role-library-intel-link">
            <div className="section-heading">
              <div>
                <h3>情报概览</h3>
                <p>公开流程、面试经验与原帖来源跟随当前岗位展示。</p>
              </div>
              <span className="loop-state"><Check weight="bold" /> Loop 已连接</span>
            </div>
            {companyBrief ? (
              <div className="intel-preview">
                <strong>{companyBrief.summary}</strong>
                <span>{(companyBrief.sources || []).length} 个已记录来源</span>
              </div>
            ) : (
              <div className="intel-empty">
                <Sparkle />
                <span><strong>等待首次情报更新</strong><small>新增岗位会在下一次运行前自动同步</small></span>
              </div>
            )}
          </section>
        </div>

        <section className="focus-section focus-section--brief">
          <div className="section-heading">
            <div>
              <h3>岗位公开情报</h3>
              <p>公开招聘流程、候选人经验、研究判断和原帖来源都归到当前公司与岗位。</p>
            </div>
            <span className="loop-state"><Check weight="bold" /> {intelligence.automation?.schedule || INTELLIGENCE_SCHEDULE}</span>
          </div>
          {companyBrief ? (
            <div className="overview-brief">
              <div className="overview-brief__summary">
                <span>今日判断</span>
                <strong>{companyBrief.summary}</strong>
                <small>
                  <span>{companyBrief.updatedAt ? `更新于 ${formatUpdateTime(companyBrief.updatedAt)}` : "更新时间未注明"}</span>
                  <i />
                  <span>{(companyBrief.sources || []).length} 个已记录来源</span>
                </small>
              </div>
              <ExperienceGuide brief={companyBrief} />
              <button className="secondary-button brief-sources-button" onClick={() => onOpenItem(companyBrief)}>
                查看全部来源（{(companyBrief.sources || []).length}） <ArrowRight />
              </button>
            </div>
          ) : (
            <div className="reader-empty reader-empty--embedded">
              <NewspaperClipping />
              <h2>还没有这条岗位的情报</h2>
              <p>Codex 会在下一次运行前读取最新岗位和 JD，再把有来源的信息写回这里。</p>
              <span>下一次：{intelligence.automation?.schedule || INTELLIGENCE_SCHEDULE}</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function TimelineView({ companies, selectedIds, onToggleCompany, weekStart, onWeekChange, onToday, onCell, embedded = false }) {
  const days = Array.from({ length: 14 }, (_, index) => addDays(weekStart, index));
  const shown = companies.filter((company) => selectedIds.includes(company.id));
  const todayKey = toDateKey(new Date());
  const Wrapper = embedded ? "section" : "main";

  return (
    <Wrapper className={`${embedded ? "dashboard-timeline" : "page"} timeline-page`}>
      <div className="page-heading page-heading--timeline">
        <div>
          {embedded && <span className="page-eyebrow">统一日程</span>}
          {embedded ? <h2>时间轴</h2> : <h1>时间轴</h1>}
          <p>点击任意一天，直接设置投递、笔试或面试节点。</p>
        </div>
        <div className="date-controls">
          <button className="icon-button bordered" onClick={() => onWeekChange(-14)} aria-label="前两周"><CaretLeft /></button>
          <button className="secondary-button" onClick={onToday}>今天</button>
          <button className="icon-button bordered" onClick={() => onWeekChange(14)} aria-label="后两周"><CaretRight /></button>
        </div>
      </div>

      <section className="project-filter">
        <span>显示岗位</span>
        <div>
          {companies.map((company) => (
            <label key={company.id} className={selectedIds.includes(company.id) ? "is-checked" : ""}>
              <input
                type="checkbox"
                checked={selectedIds.includes(company.id)}
                onChange={() => onToggleCompany(company.id)}
              />
              <CompanyMark company={company} compact />
              <span>{company.team}</span>
              <Check weight="bold" />
            </label>
          ))}
        </div>
      </section>

      <section className="gantt-shell">
        <div className="gantt-scroll">
          <div className="gantt" style={{ "--day-count": days.length }}>
            <div className="gantt-corner">
              <strong>岗位</strong>
              <span>{formatMonthDay(days[0])} - {formatMonthDay(days.at(-1))}</span>
            </div>
            <div className="gantt-dates">
              {days.map((day) => {
                const key = toDateKey(day);
                return (
                  <div className={key === todayKey ? "is-today" : ""} key={key}>
                    <span>{["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}</span>
                    <strong>{day.getDate()}</strong>
                  </div>
                );
              })}
            </div>

            {shown.map((company) => {
              const nodes = [...(company.timeline || [])].sort((a, b) => a.date.localeCompare(b.date));
              const visibleIndexes = nodes
                .map((node) => ({ node, index: days.findIndex((day) => toDateKey(day) === node.date) }))
                .filter((item) => item.index >= 0);
              const first = visibleIndexes[0]?.index;
              const last = visibleIndexes.at(-1)?.index;
              return (
                <div className="gantt-row" key={company.id}>
                  <div className="gantt-project">
                    <CompanyMark company={company} compact />
                    <span><strong>{company.team}</strong><small>{company.role}</small></span>
                    <em>{deriveStatus(company)}</em>
                  </div>
                  <div className="gantt-track">
                    {first !== undefined && (
                      <span
                        className="gantt-line"
                        style={{ "--line-start": first + 1, "--line-span": Math.max(1, last - first + 1) }}
                      />
                    )}
                    {days.map((day, index) => {
                      const date = toDateKey(day);
                      const node = nodes.filter((item) => item.date === date).at(-1);
                      return (
                        <button
                          className={`${date === todayKey ? "is-today" : ""} ${node ? "has-node" : ""}`}
                          key={date}
                          onClick={() => onCell(company.id, date, node || null)}
                          aria-label={`${company.name}${formatFullDate(day)}${node ? nodeDisplayName(node) : "添加节点"}`}
                        >
                          {node ? (
                            <span className="gantt-node">
                              <i />
                              <strong>{nodeDisplayName(node)}</strong>
                              {node.time && <small>{node.time}</small>}
                            </span>
                          ) : <span className="cell-add"><Plus /></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!shown.length && (
              <div className="gantt-empty">
                <CalendarBlank />
                <span><strong>选择至少一个岗位</strong><small>勾选上方岗位后即可开始编辑时间轴</small></span>
              </div>
            )}
          </div>
        </div>
        <footer className="gantt-help">
          <span><i /> 已设置节点</span>
          <span>点击空白日期添加</span>
          <span>点击已有节点编辑</span>
        </footer>
      </section>
    </Wrapper>
  );
}

function DiscoveryView({ companies, selectedId, intelligence, onOpenItem }) {
  const selected = companies.find((company) => company.id === selectedId) || companies[0] || null;
  const opportunityGroups = useMemo(() => {
    const groups = new Map();
    for (const opportunity of (intelligence.opportunities || []).filter(isAutumnFullTimeOpportunity)) {
      const companyName = opportunity.company || "公司未注明";
      if (!groups.has(companyName)) groups.set(companyName, []);
      groups.get(companyName).push(opportunity);
    }
    return [...groups.entries()].map(([companyName, opportunities]) => {
      const preset = matchCompanyPreset(companyName);
      return {
        companyName,
        opportunities,
        brand: preset
          ? { ...preset, tone: "preset" }
          : { name: companyName, team: companyName, mark: companyName.slice(0, 1), tone: "custom" },
      };
    });
  }, [intelligence.opportunities]);
  const lastUpdate = intelligence.generatedAt
    ? new Date(intelligence.generatedAt).toLocaleString("zh-CN", { hour12: false })
    : "等待首次运行";

  return (
    <main className="page intelligence-page">
      <div className="page-heading">
        <div>
          <h1>情报台</h1>
          <p>专注发现、筛选和比较新的秋招机会，确认后再进入岗位库。</p>
        </div>
        <div className="loop-summary">
          <span className="loop-state"><Check weight="bold" /> {intelligence.automation?.schedule || INTELLIGENCE_SCHEDULE}</span>
          <small>最近更新：{lastUpdate}</small>
        </div>
      </div>

      <CareerOpsView selectedRole={selected} roles={companies} surface="discovery" embedded />
      <div className="market-scope">
        <span><Check weight="bold" /> 只显示秋招 / 校招全职</span>
        <small>实习与未确认校招身份的岗位已隐藏</small>
      </div>
      <section className="opportunity-sheet">
        {opportunityGroups.length ? (
          <>
            <header className="opportunity-sheet__header">
              <span>公司</span>
              <span>岗位机会</span>
              <span>地点</span>
              <span>来源</span>
              <span />
            </header>
            {opportunityGroups.map((group) => (
              <section className="opportunity-group" key={group.companyName}>
                <div className="opportunity-brand">
                  <CompanyMark company={group.brand} />
                  <div>
                    <strong>{group.companyName}</strong>
                    <span>{group.opportunities.length} 个机会</span>
                  </div>
                </div>
                <div className="opportunity-rows">
                  {group.opportunities.map((item) => (
                    <button className="opportunity-row" key={item.id} onClick={() => onOpenItem(item)}>
                      <span className="opportunity-row__role">
                        <strong>{item.title || item.role}</strong>
                        <small>{item.summary}</small>
                      </span>
                      <span className="opportunity-row__meta">{item.location || "未注明"}</span>
                      <span className="opportunity-row__meta">{item.source || "来源未注明"}</span>
                      <ArrowRight />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="reader-empty">
            <MagnifyingGlass />
            <h2>暂未找到已确认的秋招机会</h2>
            <p>这里只显示有可靠来源的校招全职岗位；实习和未注明校招身份的岗位不会出现。</p>
            <span>下一次：{intelligence.automation?.schedule || INTELLIGENCE_SCHEDULE}</span>
          </div>
        )}
      </section>
    </main>
  );
}

function SourceReferences({ sourceIds = [], sources = [] }) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const matchedSources = sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
  if (!matchedSources.length) return null;

  return (
    <div className="answer-sources">
      {matchedSources.map((source) => (
        <a href={source.url} target="_blank" rel="noreferrer" key={source.id || source.url}>
          <span>{source.source || "来源"}{source.year ? ` · ${source.year}` : ""}</span>
          {source.title || "查看原帖"}
          <ArrowRight />
        </a>
      ))}
    </div>
  );
}

function LegacyExperienceGuide({ brief }) {
  const signals = brief.signals || [];
  const questions = brief.questions || [];

  return (
    <div className="experience-guide experience-guide--legacy">
      {signals.length > 0 && (
        <section>
          <h3>面试信号</h3>
          <div className="plain-list">
            {signals.map((signal) => <p key={signal}>{signal}</p>)}
          </div>
        </section>
      )}
      {questions.length > 0 && (
        <section>
          <h3>准备问题</h3>
          <div className="plain-list">
            {questions.map((question) => <p key={question}>{question}</p>)}
          </div>
        </section>
      )}
      <p className="experience-upgrade-note">下一轮 Loop 会把经验帖整理成可展开的阶段、问题、答案和原帖来源。</p>
    </div>
  );
}

function DetailedAnswerText({ text }) {
  const sections = String(text || "")
    .split(/\n(?=【[^】]+】)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sections.length <= 1) return <p className="detailed-answer__plain">{text}</p>;

  return (
    <div className="detailed-answer">
      {sections.map((part) => {
        const lines = part.split("\n").map((line) => line.trim()).filter(Boolean);
        const titleMatch = lines[0]?.match(/^【([^】]+)】$/);
        const title = titleMatch?.[1] || "详细解答";
        const body = titleMatch ? lines.slice(1) : lines;
        const numbered = body.length > 0 && body.every((line) => /^\d+\.\s/.test(line));
        const bulleted = body.length > 0 && body.every((line) => /^-\s/.test(line));

        return (
          <section key={`${title}-${part.slice(0, 30)}`}>
            <h4>{title}</h4>
            {numbered ? (
              <ol>{body.map((line) => <li key={line}>{line.replace(/^\d+\.\s/, "")}</li>)}</ol>
            ) : bulleted ? (
              <ul>{body.map((line) => <li key={line}>{line.replace(/^-\s/, "")}</li>)}</ul>
            ) : (
              body.map((line) => <p key={line}>{line}</p>)
            )}
          </section>
        );
      })}
    </div>
  );
}

function ExperienceGuide({ brief }) {
  const sections = Array.isArray(brief.experienceSections) ? brief.experienceSections : [];
  const xiaohongshuCandidates = Array.isArray(brief.researchCoverage?.xiaohongshuCandidates)
    ? brief.researchCoverage.xiaohongshuCandidates
    : [];
  const xiaohongshuProvidedLinks = Array.isArray(brief.researchCoverage?.xiaohongshuProvidedLinks)
    ? brief.researchCoverage.xiaohongshuProvidedLinks
    : [];
  if (!sections.length) return <LegacyExperienceGuide brief={brief} />;

  return (
    <div className="experience-guide">
      <div className="experience-guide__heading">
        <div>
          <h3>面试经验库</h3>
          <p>按阶段展开问题；答案由公开经验帖归纳，并保留原帖链接。</p>
        </div>
        <span>{xiaohongshuCoverageLabel(brief.researchCoverage)}</span>
      </div>

      {xiaohongshuProvidedLinks.length > 0 && (
        <section className="xiaohongshu-discoveries xiaohongshu-discoveries--provided">
          <header>
            <div>
              <strong>用户提供的小红书原帖</strong>
              <small>直链已保存；网络访问恢复后会读取正文并匹配到对应问题</small>
            </div>
            <span>{xiaohongshuProvidedLinks.length} 条</span>
          </header>
          <div>
            {xiaohongshuProvidedLinks.map((item, index) => (
              <article key={item.noteId || item.url}>
                <div>
                  <strong>{item.title || `小红书原帖 ${index + 1}`}</strong>
                  <a href={item.originalUrl || item.url} target="_blank" rel="noreferrer">
                    打开原帖 <ArrowRight />
                  </a>
                </div>
                <small>
                  {[
                    item.noteId ? `笔记 ID ${item.noteId}` : "",
                    item.status === "verified" ? "正文已核验" : "正文待核验",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}

      {xiaohongshuCandidates.length > 0 && (
        <section className="xiaohongshu-discoveries">
          <header>
            <div>
              <strong>小红书发现清单</strong>
              <small>搜索结果已发现，取得原帖链接后会升级为正式来源</small>
            </div>
            <span>{xiaohongshuCandidates.length} 篇</span>
          </header>
          <div>
            {xiaohongshuCandidates.map((item) => (
              <article key={item.id || item.title}>
                <div>
                  <strong>{item.title}</strong>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      打开原帖 <ArrowRight />
                    </a>
                  ) : (
                    <span>待补原帖链接</span>
                  )}
                </div>
                <small>
                  {[item.query, item.visibleDate, item.likes != null ? `${item.likes} 赞` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="experience-sections">
        {sections.map((section, sectionIndex) => (
          <details className="experience-section" key={section.id || section.title} open={sectionIndex === 0}>
            <summary>
              <span className="experience-section__index">{String(sectionIndex + 1).padStart(2, "0")}</span>
              <span className="experience-section__title">
                <strong>{section.title}</strong>
                <small>{section.summary || `${(section.questions || []).length} 个问题`}</small>
              </span>
              <span className="experience-section__count">{(section.questions || []).length} 题</span>
              <CaretDown />
            </summary>

            <div className="experience-questions">
              {(section.questions || []).map((item, questionIndex) => (
                <details className="experience-question" key={item.id || item.question}>
                  <summary>
                    <span>{questionIndex + 1}</span>
                    <strong>{item.question}</strong>
                    <CaretDown />
                  </summary>
                  <div className="experience-answer">
                    {item.synthesis && <p className="experience-answer__synthesis">{item.synthesis}</p>}
                    {(item.answers || []).map((answer, answerIndex) => (
                      <article key={`${item.id || item.question}-answer-${answerIndex}`}>
                        <DetailedAnswerText text={answer.text} />
                        {answer.note && <small>{answer.note}</small>}
                        <SourceReferences sourceIds={answer.sourceIds} sources={brief.sources || []} />
                      </article>
                    ))}
                    {!item.synthesis && !(item.answers || []).length && (
                      <p className="experience-answer__empty">暂未找到可核验的公开回答。</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>

      {(brief.researchCoverage?.limitations || []).length > 0 && (
        <div className="research-limitations">
          <strong>检索说明</strong>
          {(brief.researchCoverage.limitations || []).map((item) => <p key={item}>{item}</p>)}
        </div>
      )}
    </div>
  );
}

export function App() {
  const [companies, setCompanies] = useState(INITIAL_COMPANIES);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState("overview");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [intelligence, setIntelligence] = useState(EMPTY_INTELLIGENCE);
  const [careerSnapshot, setCareerSnapshot] = useState(EMPTY_CAREER_SNAPSHOT);
  const [selectedTimelineIds, setSelectedTimelineIds] = useState([]);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [nodeDraft, setNodeDraft] = useState(null);
  const [intelDetail, setIntelDetail] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationReadAt, setNotificationReadAt] = useState(
    () => window.localStorage.getItem("offer-notifications-read-at") || "",
  );
  const [companyDraft, setCompanyDraft] = useState({ company: "", team: "", role: "", location: "", presetId: "" });
  const searchRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const visibleCompanies = useMemo(
    () => companies.filter((company) => `${company.name}${company.team}${company.role}${company.jd}`.toLowerCase().includes(query.toLowerCase())),
    [companies, query],
  );
  const selected = companies.find((company) => company.id === selectedId) || companies[0];
  const selectedCompanyCluster = selected
    ? companies.filter((company) => companyClusterKey(company) === companyClusterKey(selected))
    : [];
  const selectedPreset = COMPANY_PRESETS.find((preset) => preset.id === companyDraft.presetId) || null;
  const autumnOpportunities = useMemo(
    () => (intelligence.opportunities || []).filter(isAutumnFullTimeOpportunity),
    [intelligence.opportunities],
  );
  const updateItems = useMemo(() => {
    const recorded = Array.isArray(intelligence.updates) ? intelligence.updates : [];
    const progressChanges = Array.isArray(intelligence.applicationSync?.changes)
      ? intelligence.applicationSync.changes.map((change) => ({
        ...change,
        type: change.type || "application",
        createdAt: change.createdAt || change.detectedAt,
      }))
      : [];
    const combined = [...new Map([...recorded, ...progressChanges].map((item) => [item.id || `${item.createdAt}-${item.title}`, item])).values()];
    if (combined.length) {
      return combined
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 100);
    }
    if (!intelligence.generatedAt) return [];
    return [{
      id: `sync-${intelligence.generatedAt}`,
      createdAt: intelligence.generatedAt,
      type: "sync",
      title: "情报 Loop 已完成同步",
      summary: `本次保留 ${autumnOpportunities.length} 个已确认的秋招 / 校招全职机会，并更新了 ${Object.keys(intelligence.roleBriefs || {}).length} 个岗位的准备情报。`,
    }];
  }, [autumnOpportunities.length, intelligence.applicationSync, intelligence.generatedAt, intelligence.roleBriefs, intelligence.updates]);
  const notificationReadTime = notificationReadAt ? new Date(notificationReadAt).getTime() : 0;
  const unreadUpdates = updateItems.filter((item) => {
    const createdAt = new Date(item.createdAt || "").getTime();
    return Number.isFinite(createdAt) && createdAt > notificationReadTime;
  });
  const unreadProgressChanges = unreadUpdates.filter((item) => item.type === "application" || item.type === "progress");

  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const handler = (event) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [notificationOpen]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [workspaceResponse, intelligenceResponse, careerResponse] = await Promise.all([
          fetch("/api/workspace"),
          fetch("/api/intelligence", { cache: "no-store" }),
          fetch("/api/career-ops/snapshot", { cache: "no-store" }),
        ]);
        if (workspaceResponse.ok) {
          const workspace = await workspaceResponse.json();
          if (active && Array.isArray(workspace.companies)) {
            setCompanies(workspace.companies);
            setSelectedId(workspace.companies[0]?.id || "");
            setSelectedTimelineIds(workspace.companies.map((company) => company.id));
          }
        } else {
          throw new Error("workspace unavailable");
        }
        if (intelligenceResponse.ok && active) setIntelligence(normalizeIntelligence(await intelligenceResponse.json()));
        if (careerResponse.ok && active) setCareerSnapshot(await careerResponse.json());
      } catch {
        const local = window.localStorage.getItem("offer-workspace");
        if (local && active) {
          try {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed.companies)) {
              setCompanies(parsed.companies);
              setSelectedId(parsed.companies[0]?.id || "");
              setSelectedTimelineIds(parsed.companies.map((company) => company.id));
            }
          } catch {
            // Keep the safe initial state.
          }
        }
      } finally {
        if (active) setHydrated(true);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      Promise.all([
        fetch("/api/intelligence", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
        fetch("/api/career-ops/snapshot", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
      ])
        .then(([intelligenceValue, careerValue]) => {
          setIntelligence(normalizeIntelligence(intelligenceValue));
          setCareerSnapshot(careerValue);
        })
        .catch(() => {});
    };
    const timer = window.setInterval(refresh, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const payload = { version: 1, updatedAt: new Date().toISOString(), companies };
    window.localStorage.setItem("offer-workspace", JSON.stringify(payload));
    const timer = window.setTimeout(() => {
      fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((snapshot) => setCareerSnapshot(snapshot))
        .catch(() => {});
    }, 240);
    return () => window.clearTimeout(timer);
  }, [companies, hydrated]);

  function showNotice(message) {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3500);
  }

  function chooseCompany(id) {
    setSelectedId(id);
    if (!selectedTimelineIds.includes(id)) setSelectedTimelineIds((current) => [...current, id]);
  }

  function openAddModal() {
    setCompanyDraft({ company: "", team: "", role: "", location: "", presetId: "" });
    setModal("add");
  }

  function addCompany(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("company") || "").trim();
    const team = String(data.get("team") || "").trim();
    const role = String(data.get("role") || "").trim();
    if (!name || !role) return;
    const preset = COMPANY_PRESETS.find((item) => item.id === data.get("preset")) || matchCompanyPreset(name);
    const company = {
      id: `position-${Date.now()}`,
      name,
      team: team || name,
      role,
      location: String(data.get("location") || "").trim(),
      status: "待开始",
      mark: preset?.mark || name.slice(0, 1),
      tone: preset ? "preset" : "custom",
      logoUrl: preset?.logoUrl,
      logoFit: preset?.logoFit,
      presetId: preset?.id || "",
      jd: "",
      notes: "",
      timeline: [],
    };
    setCompanies((current) => [...current, company]);
    setSelectedId(company.id);
    setSelectedTimelineIds((current) => [...current, company.id]);
    setModal(null);
    showNotice(`${company.team}已添加，情报 Loop 会自动同步`);
  }

  function saveJd(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const jd = String(data.get("jd") || "").trim();
    const notes = String(data.get("notes") || "").trim();
    setCompanies((current) => current.map((company) => company.id === selectedId ? { ...company, jd, notes } : company));
    setModal(null);
    showNotice("岗位资料已保存");
  }

  function openTimelineCell(companyId, date, node) {
    setNodeDraft({
      companyId,
      date,
      id: node?.id || "",
      type: node?.type || "一面",
      title: node?.title || "",
      time: node?.time || "",
      note: node?.note || "",
    });
    setModal("node");
  }

  function saveNode(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextNode = {
      id: nodeDraft.id || `node-${Date.now()}`,
      date: nodeDraft.date,
      type: String(data.get("type") || "自定义"),
      title: String(data.get("title") || "").trim(),
      time: String(data.get("time") || "").trim(),
      note: String(data.get("note") || "").trim(),
    };
    setCompanies((current) => current.map((company) => {
      if (company.id !== nodeDraft.companyId) return company;
      const withoutCurrent = (company.timeline || []).filter((node) => node.id !== nextNode.id);
      return { ...company, timeline: [...withoutCurrent, nextNode] };
    }));
    setModal(null);
    showNotice(`${formatMonthDay(nextNode.date)} ${nodeDisplayName(nextNode)}已设置`);
  }

  function deleteNode() {
    if (!nodeDraft?.id) return;
    setCompanies((current) => current.map((company) => company.id === nodeDraft.companyId
      ? { ...company, timeline: (company.timeline || []).filter((node) => node.id !== nodeDraft.id) }
      : company));
    setModal(null);
    showNotice("节点已删除");
  }

  function deleteSelectedPosition() {
    if (!selected) return;
    const remaining = companies.filter((company) => company.id !== selected.id);
    const next = selectedCompanyCluster.find((company) => company.id !== selected.id) || remaining[0] || null;
    setCompanies(remaining);
    setSelectedId(next?.id || "");
    setSelectedTimelineIds((current) => current.filter((companyId) => companyId !== selected.id));
    setModal(null);
    showNotice(`${selected.role}已删除`);
  }

  function deleteSelectedCompanyCluster() {
    if (!selected || !selectedCompanyCluster.length) return;
    const ids = new Set(selectedCompanyCluster.map((company) => company.id));
    const remaining = companies.filter((company) => !ids.has(company.id));
    setCompanies(remaining);
    setSelectedId(remaining[0]?.id || "");
    setSelectedTimelineIds((current) => current.filter((companyId) => !ids.has(companyId)));
    setModal(null);
    showNotice(`${selected.name}及其 ${selectedCompanyCluster.length} 个岗位已删除`);
  }

  function toggleTimelineCompany(id) {
    setSelectedTimelineIds((current) => current.includes(id)
      ? current.filter((companyId) => companyId !== id)
      : [...current, id]);
  }

  function goToTimeline() {
    setView("overview");
    setSelectedTimelineIds((current) => current.includes(selectedId) ? current : [...current, selectedId]);
  }

  function navigateTo(nextView, companyId) {
    if (companyId) chooseCompany(companyId);
    setView(nextView);
  }

  function openNotificationCenter() {
    setNotificationOpen(true);
    const newest = updateItems[0]?.createdAt || intelligence.generatedAt;
    if (newest) {
      setNotificationReadAt(newest);
      window.localStorage.setItem("offer-notifications-read-at", newest);
    }
  }

  const pageContent = view === "overview" ? (
    <SeasonDashboard
      companies={visibleCompanies}
      intelligence={intelligence}
      careerSnapshot={careerSnapshot}
      unreadProgressChanges={unreadProgressChanges}
      selectedIds={selectedTimelineIds}
      onToggleCompany={toggleTimelineCompany}
      weekStart={weekStart}
      onWeekChange={(amount) => setWeekStart((current) => addDays(current, amount))}
      onToday={() => setWeekStart(startOfWeek(new Date()))}
      onCell={openTimelineCell}
      onNavigate={navigateTo}
    />
  ) : view === "discovery" ? (
    <DiscoveryView
      companies={visibleCompanies.length ? visibleCompanies : companies}
      selectedId={selectedId}
      intelligence={intelligence}
      onOpenItem={setIntelDetail}
    />
  ) : view === "prepare" ? (
    <CareerOpsView selectedRole={selected} roles={companies} surface="prepare" />
  ) : (
    <Overview
      companies={visibleCompanies.length ? visibleCompanies : companies}
      selected={selected}
      selectedId={selectedId}
      intelligence={intelligence}
      onSelect={chooseCompany}
      onAdd={openAddModal}
      onAddNode={() => selected && openTimelineCell(selected.id, toDateKey(new Date()), null)}
      onOpenTimeline={goToTimeline}
      onEditJd={() => setModal("jd")}
      onOpenItem={setIntelDetail}
      onOpenCareer={() => setView("prepare")}
      onDelete={() => setModal("delete-company")}
    />
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("overview")} aria-label="返回 offer 总览">
          <img src="/offer-penguin-icon.png" alt="" />
        </button>
        <nav>
          {NAV_ITEMS.map(([id, label, Icon]) => (
            <button className={view === id ? "is-active" : ""} key={id} onClick={() => setView(id)}>
              <Icon /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-loop">
          <span><Sparkle /></span>
          <div>
            <strong>情报 Loop</strong>
            <small>{intelligence.automation?.status === "active" ? intelligence.automation.schedule : "等待配置"}</small>
          </div>
          {intelligence.automation?.status === "active" ? <Check weight="bold" /> : <CaretRight />}
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <label className="search">
            <MagnifyingGlass />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索公司、岗位或 JD"
            />
            <kbd>⌘K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="primary-button" onClick={openAddModal}><Plus /> 添加岗位</button>
            <button
              className={`icon-button notification-button ${unreadUpdates.length ? "has-unread" : ""}`}
              aria-label={unreadUpdates.length ? `${unreadUpdates.length} 条未读更新` : "更新中心"}
              aria-expanded={notificationOpen}
              onClick={openNotificationCenter}
            >
              <Bell />
              {unreadUpdates.length > 0 && <span>{Math.min(unreadUpdates.length, 9)}</span>}
            </button>
            <button className="profile" aria-label="账户"><UserCircle /></button>
          </div>
        </header>

        {pageContent}

        <footer className="statusbar">
          <span><Check weight="bold" /> 本地已保存</span>
          <span className="statusbar__spacer" />
          <span>情报 Loop {intelligence.automation?.schedule || INTELLIGENCE_SCHEDULE}</span>
          <span>{companies.length} 个岗位</span>
        </footer>
      </div>

      {notice && <div className="toast" role="status"><Check weight="bold" /> {notice}</div>}

      {notificationOpen && (
        <>
          <button className="notification-backdrop" aria-label="关闭更新中心" onClick={() => setNotificationOpen(false)} />
          <aside className="notification-drawer" role="dialog" aria-modal="true" aria-label="Loop 更新中心">
            <header>
              <div>
                <span>LOOP UPDATES</span>
                <h2>更新中心</h2>
                <p>每次情报同步后的新增和变化都会保留在这里。</p>
              </div>
              <button className="icon-button bordered" onClick={() => setNotificationOpen(false)} aria-label="关闭更新中心"><X /></button>
            </header>
            <div className="notification-drawer__summary">
              <span><Check weight="bold" /> 每天 22:30 自动同步</span>
              <small>{autumnOpportunities.length} 个秋招全职机会</small>
            </div>
            <div className="notification-feed">
              {updateItems.length ? updateItems.map((item) => (
                <article className="notification-item" key={item.id || `${item.createdAt}-${item.title}`}>
                  <span className={`notification-item__type notification-item__type--${item.type || "sync"}`}>
                    {item.type === "application" || item.type === "progress"
                      ? "进度"
                      : item.type === "opportunity"
                      ? "机会"
                      : item.type === "interview"
                        ? "面经"
                        : item.type === "source"
                          ? "来源"
                          : item.type === "process"
                            ? "流程"
                            : "同步"}
                  </span>
                  <div>
                    <div className="notification-item__heading">
                      <strong>{item.title || "情报已更新"}</strong>
                      <time>{formatUpdateTime(item.createdAt)}</time>
                    </div>
                    {item.company && <small>{item.company}</small>}
                    <p>{item.summary || "本次 Loop 已完成更新。"}</p>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer">查看来源 <ArrowRight /></a>
                    )}
                  </div>
                </article>
              )) : (
                <div className="notification-empty">
                  <Bell />
                  <strong>还没有 Loop 更新</strong>
                  <p>下一次同步完成后，这里会显示新增机会、岗位变化和面经来源。</p>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {modal === "add" && (
        <Modal title="添加岗位" onClose={() => setModal(null)} wide>
          <form className="add-form" onSubmit={addCompany}>
            <fieldset className="company-picker">
              <legend>选择公司</legend>
              <div className="company-picker__grid">
                {COMPANY_PRESETS.map((preset) => (
                  <button
                    className={preset.id === companyDraft.presetId ? "is-selected" : ""}
                    type="button"
                    key={preset.id}
                    onClick={() => setCompanyDraft((current) => ({ ...current, company: preset.name, presetId: preset.id }))}
                    aria-pressed={preset.id === companyDraft.presetId}
                  >
                    <CompanyMark company={{ ...preset, tone: "preset" }} compact />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <input type="hidden" name="preset" value={companyDraft.presetId} />
            <div className="form-grid">
              <label>
                公司名称
                <input
                  name="company"
                  value={companyDraft.company}
                  onChange={(event) => {
                    const company = event.target.value;
                    const preset = matchCompanyPreset(company);
                    setCompanyDraft((current) => ({ ...current, company, presetId: preset?.id || "" }));
                  }}
                  placeholder="输入公司名称"
                  autoFocus
                  required
                />
              </label>
              <label>
                业务团队
                <input name="team" value={companyDraft.team} onChange={(event) => setCompanyDraft((current) => ({ ...current, team: event.target.value }))} placeholder="例如：智能助手团队" />
              </label>
              <label>
                岗位名称
                <input name="role" value={companyDraft.role} onChange={(event) => setCompanyDraft((current) => ({ ...current, role: event.target.value }))} placeholder="输入真实岗位名称" required />
              </label>
              <label>
                地点
                <input name="location" value={companyDraft.location} onChange={(event) => setCompanyDraft((current) => ({ ...current, location: event.target.value }))} placeholder="可留空" />
              </label>
            </div>
            <div className="form-note">
              {selectedPreset ? <CompanyMark company={{ ...selectedPreset, tone: "preset" }} compact /> : <Sparkle />}
              <span>{selectedPreset ? `已匹配 ${selectedPreset.name} 图标` : "新增后会自动进入每天的情报搜索范围"}</span>
            </div>
            <div className="modal__footer">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button>
              <button className="primary-button" type="submit">添加岗位 <ArrowRight /></button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "jd" && (
        <Modal title={`${selected.name} · ${selected.role}`} onClose={() => setModal(null)}>
          <form className="jd-form" onSubmit={saveJd}>
            <label>
              岗位 JD
              <textarea name="jd" defaultValue={selected.jd} placeholder="粘贴真实职位描述" autoFocus />
            </label>
            <label>
              个人备注
              <textarea className="textarea-small" name="notes" defaultValue={selected.notes} placeholder="记录联系人、准备重点或其他信息" />
            </label>
            <div className="form-note"><Sparkle /> 保存后，下一次情报 Loop 会读取最新内容。</div>
            <div className="modal__footer">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button>
              <button className="primary-button" type="submit">保存资料 <ArrowRight /></button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "delete-company" && selected && (
        <Modal title={`删除${selected.name}`} onClose={() => setModal(null)}>
          <div className="delete-company-confirm">
            <span className="delete-company-confirm__icon"><Trash /></span>
            <div>
              <h3>{selectedCompanyCluster.length > 1 ? `这家公司有 ${selectedCompanyCluster.length} 个岗位` : `确认删除“${selected.role}”？`}</h3>
              <p>删除后，岗位资料、个人时间轴和备注会从本地工作台移除，下一次情报 Loop 也不会再继续追踪。</p>
            </div>
          </div>
          {selectedCompanyCluster.length > 1 && (
            <div className="delete-company-positions">
              {selectedCompanyCluster.map((company) => (
                <span key={company.id} className={company.id === selectedId ? "is-current" : ""}>
                  {company.role}{company.id === selectedId ? " · 当前" : ""}
                </span>
              ))}
            </div>
          )}
          <div className="modal__footer modal__footer--split">
            <button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button>
            <div>
              {selectedCompanyCluster.length > 1 && (
                <button type="button" className="danger-button" onClick={deleteSelectedPosition}>只删除当前岗位</button>
              )}
              <button type="button" className="danger-button danger-button--solid" onClick={deleteSelectedCompanyCluster}>
                {selectedCompanyCluster.length > 1 ? `删除整家公司（${selectedCompanyCluster.length} 个岗位）` : "确认删除"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "node" && nodeDraft && (
        <Modal title={`${formatFullDate(nodeDraft.date)} · 设置节点`} onClose={() => setModal(null)}>
          <form className="node-form" onSubmit={saveNode}>
            <label>
              节点类型
              <select name="type" defaultValue={nodeDraft.type}>
                {NODE_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <div className="form-grid">
              <label>
                节点名称
                <input name="title" defaultValue={nodeDraft.title} placeholder="例如：业务一面" />
              </label>
              <label>
                时间
                <input name="time" type="time" defaultValue={nodeDraft.time} />
              </label>
            </div>
            <label>
              备注
              <textarea className="textarea-small" name="note" defaultValue={nodeDraft.note} placeholder="面试官、会议链接、准备重点等" />
            </label>
            <div className="modal__footer modal__footer--split">
              {nodeDraft.id ? <button type="button" className="danger-button" onClick={deleteNode}><Trash /> 删除</button> : <span />}
              <div>
                <button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button>
                <button className="primary-button" type="submit">保存节点 <ArrowRight /></button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {intelDetail && (
        <Modal title={intelDetail.title || intelDetail.role || "完整情报"} onClose={() => setIntelDetail(null)}>
          <article className="intel-detail">
            {intelDetail.company && <span>{intelDetail.company}</span>}
            <p>{intelDetail.summary}</p>
            {(intelDetail.signals || []).map((item) => <p key={item}>{item}</p>)}
            {(intelDetail.questions || []).map((item) => <p key={item}>{item}</p>)}
            {(intelDetail.sources || []).map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title || source.source || source.url} <ArrowRight /></a>
            ))}
            {intelDetail.url && <a href={intelDetail.url} target="_blank" rel="noreferrer">打开来源 <ArrowRight /></a>}
          </article>
        </Modal>
      )}
    </div>
  );
}
