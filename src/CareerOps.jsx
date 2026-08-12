import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowClockwise,
  ArrowRight,
  Brain,
  Briefcase,
  Buildings,
  ChartLineUp,
  Check,
  ClipboardText,
  EnvelopeSimple,
  FilePdf,
  FolderOpen,
  GraduationCap,
  ListChecks,
  MagnifyingGlass,
  PaperPlaneTilt,
  Play,
  PresentationChart,
  ShieldCheck,
  Sparkle,
  SpinnerGap,
  Target,
  UserFocus,
  UsersThree,
  X,
} from "@phosphor-icons/react";

const ACTION_GROUPS = [
  {
    id: "decide",
    label: "发现与决策",
    description: "找到值得投入的机会，并把判断落进统一漏斗。",
    actions: [
      { id: "evaluate", label: "评估当前岗位", caption: "匹配度、风险与行动建议", kicker: "判断", tone: "blue", icon: Target, role: true },
      { id: "scan", label: "扫描新机会", caption: "从配置的招聘源发现岗位", kicker: "发现", tone: "amber", icon: MagnifyingGlass },
      { id: "pipeline", label: "处理岗位队列", caption: "处理待评估链接与 JD", kicker: "队列", tone: "mint", icon: ListChecks },
      { id: "batch", label: "批量评估", caption: "一次比较多个候选岗位", kicker: "比较", tone: "violet", icon: PresentationChart, input: "每行粘贴一个岗位链接或一段 JD" },
      { id: "tracker", label: "整理求职漏斗", caption: "检查状态、重复与下一步", kicker: "进度", tone: "sky", icon: ChartLineUp },
    ],
  },
  {
    id: "apply",
    label: "材料与投递",
    description: "每个动作都由 Career Ops 执行，所有内容从已核验事实出发，提交权始终留给你。",
    actions: [
      { id: "cover", label: "求职信草稿", caption: "基于岗位与公司生成初稿", kicker: "叙事", tone: "amber", icon: ClipboardText, role: true },
      { id: "email", label: "申请邮件草稿", caption: "主题、正文与附件清单", kicker: "邮件", tone: "sky", icon: EnvelopeSimple, role: true },
      { id: "apply", label: "准备申请", caption: "预填问题但绝不自动提交", kicker: "关键动作", tone: "blue", icon: PaperPlaneTilt, role: true, guarded: true, featured: true },
      { id: "deep", label: "公司深研", caption: "战略、业务、文化与候选人角度", kicker: "研究", tone: "violet", icon: Buildings, role: true },
      { id: "contacto", label: "寻找关键联系人", caption: "识别值得联系的人并起草消息", kicker: "关系", tone: "violet", icon: UsersThree, role: true },
      { id: "followup", label: "跟进节奏", caption: "找出到期事项并生成草稿", kicker: "节奏", tone: "mint", icon: ArrowClockwise },
    ],
  },
  {
    id: "interview",
    label: "面试与 Offer",
    description: "把准备、练习和复盘连接成一条可积累的能力链。",
    actions: [
      { id: "interview-prep", label: "面试准备包", caption: "公司、岗位、题目与故事库", kicker: "准备", tone: "blue", icon: Briefcase, role: true },
      { id: "interview-plan", label: "训练计划", caption: "按真实轮次排准备优先级", kicker: "计划", tone: "amber", icon: ListChecks, role: true },
      { id: "interview-practice", label: "模拟面试", caption: "逐题练习与直接反馈", kicker: "练习", tone: "violet", icon: UserFocus, role: true, featured: true, input: "可粘贴上一题和你的回答；首次开始可以留空" },
      { id: "interview-debrief", label: "面试复盘", caption: "还原问题、表现与下一轮重点", kicker: "复盘", tone: "coral", icon: Brain, role: true, input: "粘贴真实面试问题、回答、面试官反馈和结果" },
      { id: "offer-prep", label: "Offer 阅读准备", caption: "逐条提取并整理待确认问题", kicker: "核对", tone: "mint", icon: ShieldCheck, input: "输入本地 Offer 文件路径与已知承诺；结果不构成法律意见" },
    ],
  },
  {
    id: "grow",
    label: "定位与成长",
    description: "用真实求职结果校准方向，不用抽象的焦虑代替行动。",
    actions: [
      { id: "upskill", label: "能力缺口地图", caption: "区分已具备能力与真实缺口", kicker: "诊断", tone: "blue", icon: ChartLineUp, role: true },
      { id: "patterns", label: "复盘求职表现", caption: "从漏斗结果寻找稳定模式", kicker: "模式", tone: "violet", icon: PresentationChart },
      { id: "project", label: "作品集评估", caption: "判断项目证据与 80/20 改进项", kicker: "证据", tone: "coral", icon: Sparkle, featured: true, input: "粘贴项目链接、项目说明或需要评估的证据" },
      { id: "training", label: "课程价值评估", caption: "判断课程是否值得投入时间", kicker: "投入", tone: "amber", icon: GraduationCap, input: "粘贴课程或证书链接、价格与预计投入时间" },
      { id: "titles", label: "相邻岗位探索", caption: "拓宽岗位名但不偏离主线", kicker: "方向", tone: "mint", icon: Target },
    ],
  },
];

const RESUME_ANALYZE_ACTION = {
  id: "resume-analyze",
  label: "分析这份 PDF",
  caption: "Career Ops 将直接阅读文字并逐页检查版式",
  kicker: "只读分析",
  tone: "blue",
  icon: ChartLineUp,
  resume: true,
};

const PREPARE_SECTIONS = [
  { id: "resume", label: "简历分析", icon: FilePdf },
  { id: "apply", label: "投递材料", icon: PaperPlaneTilt },
  { id: "interview", label: "面试训练", icon: UserFocus },
  { id: "grow", label: "能力成长", icon: ChartLineUp },
];

const SURFACE_ACTIONS = {
  discovery: new Set(["scan", "pipeline", "batch", "titles"]),
  library: new Set(["deep"]),
  role: new Set(["evaluate", "followup"]),
  prepare: new Set([
    "cover",
    "email",
    "apply",
    "contacto",
    "followup",
    "interview-prep",
    "interview-plan",
    "interview-practice",
    "interview-debrief",
    "offer-prep",
    "upskill",
    "patterns",
    "project",
    "training",
    "titles",
  ]),
};

const SURFACE_COPY = {
  discovery: {
    eyebrow: "机会管理",
    title: "把机会发现变成可判断的候选池",
    description: "扫描、处理和比较新岗位，确认值得投入后再加入岗位库。",
  },
  library: {
    eyebrow: "岗位研究",
    title: "继续深化这条岗位情报",
    description: "在已有来源之上补充公司、业务和候选人视角。",
  },
  role: {
    eyebrow: "岗位推进",
    title: "推进当前岗位",
    description: "只呈现与当前岗位状态直接相关的判断和跟进动作。",
  },
  prepare: {
    eyebrow: "准备中心",
    title: "准备申请、面试与长期能力",
    description: "材料、训练和成长各自成组，不再和岗位发现混在一起。",
  },
};

const SURFACE_GROUP_COPY = {
  discovery: {
    label: "机会检索与筛选",
    description: "新机会先进入候选队列，完成来源核验与比较后再加入岗位库。",
  },
  library: {
    label: "情报深化",
    description: "围绕当前岗位继续补充公司、业务和候选人视角。",
  },
  role: {
    label: "岗位推进",
    description: "评估匹配度，并检查当前岗位是否到了需要跟进的时间。",
  },
};

async function api(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "请求失败");
  return value;
}

function formatTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function TaskStatus({ task }) {
  if (task.status === "running") return <span className="career-task-status is-running"><SpinnerGap /> 正在运行</span>;
  if (task.status === "completed") return <span className="career-task-status is-complete"><Check /> 已完成</span>;
  if (task.status === "cancelled") return <span className="career-task-status">已停止</span>;
  return <span className="career-task-status is-failed">需要处理</span>;
}

function MarkdownResult({ children, onOpenFile }) {
  return (
    <div className="career-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: label, href = "", ...props }) => {
            const isExternal = /^(https?:|mailto:)/i.test(href);
            if (isExternal || href.startsWith("#") || !onOpenFile) {
              return <a {...props} href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>{label}</a>;
            }
            return (
              <button className="career-file-link" type="button" onClick={() => onOpenFile(href)}>
                {label}
              </button>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function formatFileSize(value) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function ResumeAnalysisWorkspace({
  snapshot,
  tasks,
  activeTask,
  onSelectTask,
  onAnalyze,
  onImport,
  onOpenFile,
  onOpenSource,
}) {
  const resume = snapshot.resume || {};
  const resumeTasks = tasks.filter((task) => task.mode === "resume-analyze");
  const isRunning = resumeTasks.some((task) => task.status === "running");
  const sourceLabel = resume.source?.name || "尚未选择 PDF 简历";
  const sourceMeta = resume.source
    ? `${formatTime(resume.source.importedAt)} 选择${resume.source.size ? ` · ${formatFileSize(resume.source.size)}` : ""}`
    : "选择一份用于投递的 PDF，Career Ops 会同时阅读内容和版式";

  return (
    <div className="resume-review-workspace">
      <main className="resume-review-main">
        <section className="resume-review-card">
          <header>
            <span><FilePdf /></span>
            <div>
              <h2>直接分析 PDF 简历</h2>
              <p>只读审阅当前文件，不建立母版、不自动改写事实，也不生成新的简历版本。</p>
            </div>
          </header>

          <div className="resume-source-row">
            <div>
              <span className="resume-source-icon"><ClipboardText /></span>
              <span>
                <strong>{sourceLabel}</strong>
                <small>{resume.sourceMissing ? "原文件已经移动，请重新选择" : sourceMeta}</small>
              </span>
            </div>
            <div>
              {resume.source && <button className="secondary-button" onClick={onOpenSource}>打开 PDF</button>}
              <button className="primary-button" onClick={onImport}><FolderOpen /> {resume.source ? "更换 PDF" : "选择 PDF"}</button>
            </div>
          </div>

          <div className="resume-review-checks">
            <div>
              <span><FilePdf /></span>
              <strong>逐页视觉检查</strong>
              <small>密度、分页、字体、层级与留白</small>
            </div>
            <div>
              <span><ShieldCheck /></span>
              <strong>证据可信度</strong>
              <small>指标口径、个人贡献与因果链</small>
            </div>
            <div>
              <span><Target /></span>
              <strong>招聘方阅读</strong>
              <small>六秒清晰度、ATS 与修改优先级</small>
            </div>
          </div>

          <div className="resume-review-action">
            <div>
              <ShieldCheck />
              <span>
                <strong>分析过程不会修改任何 Career Ops 文件</strong>
                <small>PDF 文字与页面图像只在本机处理，结果直接显示在这里。</small>
              </span>
            </div>
            <button className="primary-button" disabled={!resume.source || isRunning} onClick={onAnalyze}>
              {isRunning ? <SpinnerGap className="spin" /> : <ChartLineUp />}
              {isRunning ? "正在分析" : "分析这份 PDF"}
            </button>
          </div>
        </section>

        {!activeTask && resume.latestAnalysis?.output && (
          <section className="career-result resume-saved-result">
            <header>
              <div>
                <span className="career-task-status is-complete"><Check /> 最近一次结果</span>
                <h2>{resume.latestAnalysis.title || "简历分析"}</h2>
                <p>{formatTime(resume.latestAnalysis.completedAt)} · Career Ops 逐页审阅</p>
              </div>
            </header>
            <div className="career-result-body">
              <MarkdownResult onOpenFile={onOpenFile}>{resume.latestAnalysis.output}</MarkdownResult>
            </div>
          </section>
        )}
      </main>

      <aside className="career-panel career-runs resume-review-runs">
          <header>
            <div><h2>分析记录</h2><p>当前应用会话中的 PDF 审阅</p></div>
            {isRunning && <SpinnerGap className="spin" />}
          </header>
          <div className="career-run-list">
            {resumeTasks.length ? resumeTasks.slice(0, 8).map((task) => (
              <button
                key={task.id}
                className={task.id === activeTask?.id ? "is-active" : ""}
                onClick={() => onSelectTask(task.id)}
              >
                <span><strong>{task.title}</strong><small>Career Ops · {formatTime(task.createdAt)}</small></span>
                <TaskStatus task={task} />
              </button>
            )) : <p className="career-panel-empty">选择 PDF 并开始分析后，运行状态会出现在这里。</p>}
          </div>
      </aside>
    </div>
  );
}

export default function CareerOpsView({ selectedRole, surface = "prepare", embedded = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedAction, setSelectedAction] = useState(null);
  const [input, setInput] = useState("");
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [prepareSection, setPrepareSection] = useState("resume");

  const load = async () => {
    try {
      const [nextSnapshot, nextTasks] = await Promise.all([
        api("/api/career-ops/snapshot"),
        api("/api/career-ops/tasks"),
      ]);
      const normalizedTasks = Array.isArray(nextTasks) ? nextTasks : [];
      setSnapshot(nextSnapshot);
      setTasks(normalizedTasks);
      setActiveTaskId((current) => current || normalizedTasks[0]?.id || null);
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const hasRunningTask = tasks.some((task) => task.status === "running");
    if (!hasRunningTask) return undefined;
    const timer = window.setInterval(load, 1200);
    return () => window.clearInterval(timer);
  }, [tasks]);

  const activeTask = tasks.find((task) => task.id === activeTaskId) || tasks[0] || null;
  const activeResumeTask = (
    tasks.find((task) => task.mode === "resume-analyze" && task.id === activeTaskId)
    || tasks.find((task) => task.mode === "resume-analyze")
    || null
  );
  const displayTask = surface === "prepare" && prepareSection === "resume"
    ? activeResumeTask
    : activeTask;
  const copy = SURFACE_COPY[surface] || SURFACE_COPY.prepare;
  const visibleGroups = useMemo(() => {
    const filteredGroups = ACTION_GROUPS.map((group) => ({
      ...group,
      actions: group.actions.filter((action) => SURFACE_ACTIONS[surface]?.has(action.id)),
    }))
    .filter((group) => group.actions.length)
    .filter((group) => surface !== "prepare" || group.id === prepareSection);
    if (surface === "prepare") return filteredGroups;
    const copyForGroup = SURFACE_GROUP_COPY[surface];
    return [{
      id: surface,
      label: copyForGroup?.label || copy.title,
      description: copyForGroup?.description || copy.description,
      actions: filteredGroups.flatMap((group) => group.actions),
    }];
  }, [copy.description, copy.title, prepareSection, surface]);

  const openAction = (action) => {
    setSelectedAction(action);
    setInput("");
    setError("");
  };

  const runAction = async (actionOverride = null) => {
    const action = actionOverride?.id ? actionOverride : selectedAction;
    if (!action) return;
    if (action.role && !selectedRole) {
      setError("请先在总览中选择一个岗位");
      return;
    }
    try {
      const task = await api("/api/career-ops/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: action.id,
          input,
          resumeSource: action.resume ? snapshot.resume?.source?.path || "" : "",
          roles: [],
          role: selectedRole ? {
            company: selectedRole.name,
            team: selectedRole.team,
            role: selectedRole.role,
            location: selectedRole.location,
            jd: selectedRole.jd,
          } : null,
        }),
      });
      setSelectedAction(null);
      setActiveTaskId(task.id);
      setTasks((current) => [task, ...current]);
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const importResume = async () => {
    try {
      const value = await api("/api/career-ops/resume/import", { method: "POST" });
      if (value.resume) setSnapshot((current) => ({ ...current, resume: value.resume }));
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const openResumeAsset = async (asset, reveal = false) => {
    try {
      await api("/api/career-ops/resume/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, reveal }),
      });
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const cancelTask = async (id) => {
    try {
      await api(`/api/career-ops/tasks/${id}`, { method: "DELETE" });
      await load();
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const openLocation = async (target) => {
    try {
      await api("/api/career-ops/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  const openCareerFile = async (href) => {
    try {
      await api("/api/career-ops/file/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ href }),
      });
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  if (loading) {
    return (
      <section className={`career-page career-loading ${embedded ? "is-embedded" : "page"}`}>
        <SpinnerGap />
        <span>正在连接 Career Ops</span>
      </section>
    );
  }

  if (!snapshot?.connected) {
    return (
      <section className={`career-page ${embedded ? "is-embedded" : "page"}`}>
        <section className="career-disconnected">
          <span><Briefcase /></span>
          <h1>还没有连接 Career Ops</h1>
          <p>offer 会优先寻找“文档/秋招/career-ops”，连接后直接读取它的用户层数据。</p>
          <button className="secondary-button" onClick={load}><ArrowClockwise /> 重新检查</button>
        </section>
      </section>
    );
  }

  return (
    <section className={`career-page career-page--${surface} ${surface === "prepare" ? `career-section-${prepareSection}` : ""} ${embedded ? "is-embedded" : "page"}`}>
      <header className="career-hero">
        <div>
          <span className="career-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>
            {copy.description}
            {selectedRole && surface !== "discovery" && !(surface === "prepare" && prepareSection === "resume")
              ? ` 当前上下文：${selectedRole.name} · ${selectedRole.role}。`
              : ""}
          </p>
        </div>
        <div className="career-connection">
          <span className={snapshot.codexReady && !snapshot.missing.length ? "is-ready" : ""} />
          <div>
            <strong>{snapshot.codexReady ? "Codex 已连接" : "Codex 未连接"}</strong>
            <small>career-ops {snapshot.version ? `v${snapshot.version}` : "本地版"}</small>
          </div>
          <button onClick={load} aria-label="刷新 Career Ops"><ArrowClockwise /></button>
        </div>
      </header>

      {error && <div className="career-alert" role="alert"><ShieldCheck /><span>{error}</span><button onClick={() => setError("")}><X /></button></div>}

      {surface === "prepare" && (
        <div className="career-workspace-tabs" role="tablist" aria-label="准备空间">
          {PREPARE_SECTIONS.map(({ id, label, icon: SectionIcon }) => (
            <button
              role="tab"
              aria-selected={prepareSection === id}
              className={prepareSection === id ? "is-active" : ""}
              key={id}
              onClick={() => setPrepareSection(id)}
            >
              <SectionIcon />
              {label}
            </button>
          ))}
        </div>
      )}

      {surface === "prepare" && prepareSection === "resume" ? (
        <ResumeAnalysisWorkspace
          snapshot={snapshot}
          tasks={tasks}
          activeTask={activeResumeTask}
          onSelectTask={setActiveTaskId}
          onAnalyze={() => runAction(RESUME_ANALYZE_ACTION)}
          onImport={importResume}
          onOpenFile={openCareerFile}
          onOpenSource={() => openResumeAsset("source")}
        />
      ) : <div className="career-layout">
        <div className="career-main">
          {visibleGroups.map((group) => (
            <section className="career-action-group" key={group.id}>
              <header>
                <div>
                  <h2>{group.label}</h2>
                  <p>{group.description}</p>
                </div>
                <span>{String(group.actions.length).padStart(2, "0")}</span>
              </header>
              <div className="career-action-grid">
                {group.actions.map((action) => {
                  const Icon = action.icon;
                  const disabled = action.role && !selectedRole;
                  return (
                    <button
                      className={`career-action-card tone-${action.tone || "blue"} ${action.featured ? "is-featured" : ""} ${action.guarded ? "is-guarded" : ""}`}
                      key={action.id}
                      onClick={() => openAction(action)}
                      disabled={disabled}
                    >
                      <span className="career-action-icon"><Icon /></span>
                      <span className="career-action-copy">
                        <span className="career-action-kicker">{action.kicker}</span>
                        <strong>{action.label}</strong>
                        <small>{disabled ? "先在总览选择岗位" : action.caption}</small>
                      </span>
                      {action.guarded && <em className="career-action-guard"><ShieldCheck /> 人工确认</em>}
                      <ArrowRight />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="career-side">
          {surface === "prepare" && <section className="career-panel career-assets">
            <header>
              <div><h2>求职资产</h2><p>报告、简历与面试材料</p></div>
              <button onClick={() => openLocation("root")}><FolderOpen /></button>
            </header>
            <div className="career-asset-counts">
              <button onClick={() => openLocation("reports")}><strong>{snapshot.assetCounts?.reports ?? snapshot.reports.length}</strong><span>评估报告</span></button>
              <button onClick={() => openLocation("outputs")}><strong>{snapshot.assetCounts?.outputs ?? snapshot.outputs.length}</strong><span>生成材料</span></button>
              <button onClick={() => openLocation("interviews")}><strong>{snapshot.assetCounts?.interviews ?? snapshot.interviewFiles.length}</strong><span>面试档案</span></button>
            </div>
            {snapshot.reports?.length > 0 && (
              <div className="career-report-files">
                <span>最近评估报告</span>
                {snapshot.reports.slice(0, 5).map((report) => (
                  <button key={report.path} onClick={() => openCareerFile(report.path)}>
                    <ClipboardText />
                    <span>
                      <strong>{report.name}</strong>
                      <small>{formatTime(report.updatedAt)}</small>
                    </span>
                    <ArrowRight />
                  </button>
                ))}
              </div>
            )}
          </section>}

          <section className="career-panel career-runs">
            <header>
              <div><h2>运行中心</h2><p>每一步都可见、可停止、可复查</p></div>
              {tasks.some((task) => task.status === "running") && <SpinnerGap className="spin" />}
            </header>
            <div className="career-run-list">
              {tasks.length ? tasks.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  className={task.id === activeTask?.id ? "is-active" : ""}
                  onClick={() => setActiveTaskId(task.id)}
                >
                  <span><strong>{task.title}</strong><small>Career Ops · {formatTime(task.createdAt)}</small></span>
                  <TaskStatus task={task} />
                </button>
              )) : <p className="career-panel-empty">运行记录会保留在当前 offer 会话中。</p>}
            </div>
          </section>
        </aside>
      </div>}

      {displayTask && (
        <section className={`career-result ${displayTask.status === "running" ? "is-running" : ""}`}>
          <header>
            <div>
              <TaskStatus task={displayTask} />
              <h2>{displayTask.title}</h2>
              <p>
                {formatTime(displayTask.createdAt)}
                {displayTask.mode === "resume-analyze" ? " · Career Ops 逐页审阅" : " · 由 Career Ops 执行，Codex 协作"}
              </p>
            </div>
            {displayTask.status === "running" && (
              <button className="secondary-button" onClick={() => cancelTask(displayTask.id)}>停止任务</button>
            )}
          </header>
          <div className="career-result-body">
            {displayTask.output ? (
              <MarkdownResult onOpenFile={openCareerFile}>{displayTask.output}</MarkdownResult>
            ) : displayTask.error ? (
              <p className="career-result-error">{displayTask.error}</p>
            ) : (
              <div className="career-result-progress">
                <span><SpinnerGap /></span>
                <div>
                  <strong>Codex 正在工作</strong>
                  <p>{displayTask.log?.at(-1) || (
                    displayTask.mode === "resume-analyze"
                      ? "正在提取 PDF 文字并渲染页面图像…"
                      : "正在读取候选人档案和岗位上下文…"
                  )}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {selectedAction && (
        <>
          <button className="career-sheet-backdrop" aria-label="关闭动作面板" onClick={() => setSelectedAction(null)} />
          <aside className="career-command-sheet" role="dialog" aria-modal="true" aria-labelledby="career-command-title">
            <header>
              <div>
                <span>CAREER OPS ACTION</span>
                <h2 id="career-command-title">{selectedAction.label}</h2>
                <p>{selectedAction.caption}</p>
              </div>
              <button className="icon-button bordered" onClick={() => setSelectedAction(null)} aria-label="关闭"><X /></button>
            </header>

            <div className="career-command-body">
              {selectedAction.role && selectedRole && (
                <section className="career-context-card">
                  <span><Briefcase /></span>
                  <div>
                    <strong>{selectedRole.name} · {selectedRole.role}</strong>
                    <small>{selectedRole.team}{selectedRole.location ? ` · ${selectedRole.location}` : ""}</small>
                  </div>
                  <em>{selectedRole.jd ? "JD 已就绪" : "JD 未补充"}</em>
                </section>
              )}

              {selectedAction.input && (
                <label className="career-command-input">
                  补充上下文
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={selectedAction.input}
                    autoFocus
                  />
                </label>
              )}

              <section className="career-guardrail">
                <ShieldCheck />
                <div>
                  <strong>你始终拥有最后决定权</strong>
                  <p>offer 只通过本地 Career Ops 运行这些功能，并由 Codex 协作完成。消息只生成草稿，申请只做准备，未经你确认不会发送或提交。</p>
                </div>
              </section>
            </div>

            <footer>
              <button className="secondary-button" onClick={() => setSelectedAction(null)}>取消</button>
              <button
                className="primary-button"
                onClick={() => runAction()}
                disabled={!snapshot.codexReady || tasks.some((task) => task.status === "running")}
              >
                <Play weight="fill" /> 开始运行
              </button>
            </footer>
          </aside>
        </>
      )}
    </section>
  );
}
