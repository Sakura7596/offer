import { app, BrowserWindow, dialog, protocol, shell } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "offer",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(currentDirectory, "../dist/client");
const intelligenceSchedule = "每天 22:30";
const careerTasks = new Map();
const careerOpsCandidates = [
  process.env.CAREER_OPS_DIR,
  path.join(app.getPath("documents"), "秋招", "career-ops"),
].filter(Boolean);
const codexCandidates = [
  process.env.CODEX_EXECUTABLE,
  "/Applications/ChatGPT.app/Contents/Resources/codex",
  "/Applications/Codex.app/Contents/Resources/codex",
  "/usr/local/bin/codex",
  "/opt/homebrew/bin/codex",
].filter(Boolean);

const careerModes = {
  evaluate: {
    title: "岗位评估",
    prompt: "Run the career-ops auto-pipeline evaluation for the role context below. Generate the evaluation report and tracker entry, but never submit an application.",
  },
  scan: {
    title: "扫描新机会",
    prompt: "Run the career-ops scan mode. Focus on the configured target roles and summarize only newly discovered, live opportunities.",
  },
  pipeline: {
    title: "处理岗位队列",
    prompt: "Run the career-ops pipeline mode for data/pipeline.md. Process pending URLs according to the repository rules.",
  },
  batch: {
    title: "批量评估",
    prompt: "Run the career-ops batch mode for the supplied roles. Preserve the human review gate and do not submit any application.",
  },
  "resume-analyze": {
    title: "分析简历 PDF",
    prompt: [
      "Run a read-only Career Ops resume review. This is a review of the selected PDF itself, not master-resume management, CV generation, role matching, or a request to update candidate data.",
      "Use the extracted selectable text for factual reading and inspect every attached PDF page image for layout, density, page breaks, typography, hierarchy, legibility, and visual defects.",
      "Use the selected PDF as the sole source for claims about what the resume currently says. Career Ops profile files may inform the intended AI-product-manager direction, but cv.md and article-digest.md are not the analysis target and must not override the PDF.",
      "Do not read, edit, synchronize, or create cv.md, article-digest.md, reports, output files, tracker rows, profile files, or any other repository artifact.",
      "Do not compare the resume against every role in the offer workspace. If the offer interface supplies one selected role, treat that role and its JD as the user's explicit target: keep the general-readiness verdict, then add a target-role fit section and role-specific revision priorities. If no role is supplied, evaluate it as a general Chinese campus-recruiting resume for the user's primary AI product manager direction.",
      "Apply the recruiter-side six-second clarity gate, evidence credibility, business-value bullet, ATS parseability, and visual PDF review standards.",
      "Distinguish strong evidence, expression problems, unsupported or ambiguous claims, metric-definition risks, and facts that need human confirmation. Never invent a metric, responsibility, result, skill, or application status.",
      "Return the complete final analysis directly in Simplified Chinese. Lead with the verdict and a clearly labelled general-readiness score, then give a compact score table, strongest evidence, highest-priority issues, PDF layout findings, recommended one-page structure, and the few most important facts to confirm.",
      "Keep the analysis concrete and practice-ready. Do not produce a generic long skills-gap inventory, do not over-index on one optional role, and do not include an implementation log.",
    ].join(" "),
  },
  cover: {
    title: "生成求职信",
    prompt: "Run the career-ops cover mode for the supplied role. Produce a draft for review and do not send it.",
  },
  email: {
    title: "申请邮件草稿",
    prompt: "Run the career-ops email mode for the supplied role. Produce a draft-only subject, body and attachment checklist. Never send, submit or click anything.",
  },
  deep: {
    title: "公司深研",
    prompt: "Run the career-ops deep mode for the supplied company and role. Produce sourced company research and a candidate angle.",
  },
  contacto: {
    title: "寻找关键联系人",
    prompt: "Run the career-ops contacto mode for the supplied company and role. Find relevant contact types and draft outreach. Do not send any message.",
  },
  apply: {
    title: "准备申请",
    prompt: "Run the career-ops apply mode for the supplied role as a preparation-only workflow. Fill or draft answers only where the mode allows it. Never submit, send, or perform the final application action.",
  },
  tracker: {
    title: "整理求职漏斗",
    prompt: "Run the career-ops tracker mode and summarize current statuses, integrity issues and the next useful actions.",
  },
  followup: {
    title: "跟进节奏",
    prompt: "Run the career-ops followup mode. Produce due follow-up drafts, but do not record any draft as sent and do not send anything.",
  },
  patterns: {
    title: "复盘求职漏斗",
    prompt: "Run the career-ops patterns mode. Analyze outcomes with causal humility and surface the most actionable targeting changes.",
  },
  "interview-prep": {
    title: "面试准备包",
    prompt: "Run the career-ops interview-prep mode for the supplied company and role. Build a sourced preparation package without inventing candidate facts.",
  },
  "interview-plan": {
    title: "面试训练计划",
    prompt: "Run the career-ops interview/plan mode for the supplied company and role. Produce a prioritized preparation plan.",
  },
  "interview-practice": {
    title: "模拟面试",
    prompt: "Run the career-ops interview/practice mode for the supplied company and role. Use any supplied answer as the candidate response, give direct evidence-bounded feedback, and finish with exactly one next interview question.",
  },
  "interview-debrief": {
    title: "面试复盘",
    prompt: "Run the career-ops interview/debrief mode using the supplied notes. Separate facts from inference and propose the next preparation priorities.",
  },
  project: {
    title: "作品集评估",
    prompt: "Run the career-ops project mode for the supplied project. Evaluate it as candidate evidence and propose an 80/20 improvement plan.",
  },
  training: {
    title: "课程价值评估",
    prompt: "Run the career-ops training mode for the supplied course or certification. Judge its opportunity cost against the target roles.",
  },
  upskill: {
    title: "能力缺口地图",
    prompt: "Run the career-ops upskill mode. Distinguish verified existing skills from actual gaps and propose a prioritized learning plan.",
  },
  titles: {
    title: "相邻岗位探索",
    prompt: "Run the career-ops titles mode. Suggest adjacent titles without changing any profile or scanner configuration unless the user later confirms.",
  },
  "offer-prep": {
    title: "Offer 阅读准备",
    prompt: "Run the career-ops offer-prep mode for the supplied document context. Respect every legal and extraction gate. This is not legal advice.",
  },
};

const careerModeGuides = {
  evaluate: ["modes/auto-pipeline.md"],
  scan: ["modes/scan.md"],
  pipeline: ["modes/pipeline.md"],
  batch: ["modes/batch.md"],
  "resume-analyze": ["modes/heuristics/recruiter-side.md"],
  cover: ["modes/cover.md"],
  email: ["modes/email.md"],
  deep: ["modes/deep.md"],
  contacto: ["modes/contacto.md"],
  apply: ["modes/apply.md"],
  tracker: ["modes/tracker.md"],
  followup: ["modes/followup.md"],
  patterns: ["modes/patterns.md"],
  "interview-prep": ["modes/interview-prep.md"],
  "interview-plan": ["modes/interview/plan.md"],
  "interview-practice": ["modes/interview/practice.md"],
  "interview-debrief": ["modes/interview/debrief.md"],
  project: ["modes/project.md"],
  training: ["modes/training.md"],
  upskill: ["modes/upskill.md"],
  titles: ["modes/titles.md"],
  "offer-prep": ["modes/offer-prep.md"],
};

const emptyWorkspace = {
  version: 1,
  updatedAt: null,
  companies: [],
};

const emptyIntelligence = {
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
    schedule: intelligenceSchedule,
    status: "not_configured",
  },
};

const emptyLoopRuns = { version: 1, runs: [] };

function dataPaths() {
  const directory = path.join(app.getPath("userData"), "data");
  return {
    directory,
    workspace: path.join(directory, "workspace.json"),
    intelligence: path.join(directory, "intelligence.json"),
    loopRuns: path.join(directory, "loop-runs.json"),
    resume: path.join(directory, "resume.json"),
    files: path.join(directory, "files"),
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeIntelligence(value) {
  if (!value || typeof value !== "object") return emptyIntelligence;
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
      schedule: value.automation?.schedule || intelligenceSchedule,
      status: value.automation?.status === "active" ? "active" : "not_configured",
    },
  };
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
}

function careerOpsPath() {
  return firstExistingPath(careerOpsCandidates);
}

function codexExecutable() {
  return firstExistingPath(codexCandidates);
}

function readText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `${path.basename(executable)} 退出，状态码 ${code}`));
    });
  });
}

function pdfToolPath(name) {
  return firstExistingPath([
    process.env[`${name.toUpperCase()}_EXECUTABLE`],
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ].filter(Boolean));
}

async function prepareResumeAnalysis(sourcePath, task) {
  const source = fileRecord(sourcePath);
  if (!source || path.extname(source.path).toLowerCase() !== ".pdf") {
    throw new Error("请先选择一份可读取的 PDF 简历");
  }

  const pdftotext = pdfToolPath("pdftotext");
  const pdftoppm = pdfToolPath("pdftoppm");
  if (!pdftotext || !pdftoppm) {
    throw new Error("缺少 PDF 逐页分析组件，无法保证同时检查文字与版式");
  }

  const cacheKey = createHash("sha256")
    .update(`${source.path}:${source.updatedAt}:${source.size}`)
    .digest("hex")
    .slice(0, 20);
  const cacheDirectory = path.join(app.getPath("userData"), "cache", "resume-analysis", cacheKey);
  const textPath = path.join(cacheDirectory, "resume.txt");
  const pagePrefix = path.join(cacheDirectory, "page");
  fs.mkdirSync(cacheDirectory, { recursive: true });

  let pageImages = fs.readdirSync(cacheDirectory)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(cacheDirectory, name));

  if (!fs.existsSync(textPath) || !pageImages.length) {
    task.log.push("正在提取 PDF 文字并渲染每一页…");
    await Promise.all([
      runProcess(pdftotext, ["-layout", source.path, textPath]),
      runProcess(pdftoppm, ["-png", "-r", "144", source.path, pagePrefix]),
    ]);
    pageImages = fs.readdirSync(cacheDirectory)
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => path.join(cacheDirectory, name));
  } else {
    task.log.push("正在复用已完成的 PDF 文字与逐页渲染…");
  }

  if (!pageImages.length) throw new Error("PDF 页面渲染失败");
  if (pageImages.length > 8) throw new Error("当前简历超过 8 页，请选择用于投递的精简版 PDF");

  const extractedText = readText(textPath).trim();
  if (!extractedText) throw new Error("PDF 中没有可提取文字，暂不支持扫描件简历分析");

  return {
    fileName: source.name,
    extractedText: extractedText.slice(0, 50000),
    pageImages,
  };
}

function markdownTableRows(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|")))
    .filter((cells) => cells.length >= 6 && !/^#$/i.test(cells[0]) && !/^[-:]+$/.test(cells[0]));
}

function parseApplications(root) {
  const rows = markdownTableRows(readText(path.join(root, "data", "applications.md")));
  return rows.map((cells) => {
    const [number, date, company, role, score, status, pdf, report, ...notes] = cells;
    return {
      number,
      date,
      company,
      role,
      score,
      status,
      pdf: pdf || "",
      report: report || "",
      notes: notes.join(" | "),
    };
  });
}

function applicationKey(company, role) {
  return `${String(company || "").trim().toLowerCase()}\u0000${String(role || "").trim().toLowerCase()}`;
}

function timelineApplication(company) {
  const nodes = [...(company?.timeline || [])]
    .filter((node) => /^\d{4}-\d{2}-\d{2}$/.test(String(node?.date || "")))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!nodes.length) return null;

  const stageForNode = (node) => {
    const text = `${node?.type || ""} ${node?.title || ""}`.trim();
    if (/已入职|入职/.test(text)) return "Hired";
    if (/拒绝|淘汰|未通过/.test(text)) return "Rejected";
    if (/放弃|撤回/.test(text)) return "Discarded";
    if (/Offer/.test(text)) return "Offer";
    if (/(?:一|二|三|四|终|群|HR|业务)?\s*面(?:试)?/.test(text)) return "Interview";
    if (/笔试|测评|回复|沟通/.test(text)) return "Responded";
    if (/投递|网申/.test(text)) return "Applied";
    return null;
  };

  const progress = nodes.map((node) => ({ node, status: stageForNode(node) })).filter((item) => item.status);
  const latest = progress.at(-1);
  if (!latest) return null;

  return {
    date: latest.node.date,
    company: String(company.name || "").trim(),
    role: String(company.role || "").trim(),
    status: latest.status,
    note: "同步自 offer 时间轴",
  };
}

function syncTimelineApplications(workspace) {
  const root = careerOpsPath();
  if (!root || !Array.isArray(workspace?.companies)) return;
  const trackerPath = path.join(root, "data", "applications.md");
  const syncMarker = "同步自 offer 时间轴";
  const existing = parseApplications(root).flatMap((item) => {
    const notes = String(item.notes || "").split("|").map((value) => value.trim()).filter(Boolean);
    if (!notes.includes(syncMarker)) return [item];
    const remainingNotes = notes.filter((value) => value !== syncMarker).join(" | ");
    return remainingNotes ? [{ ...item, notes: remainingNotes }] : [];
  });
  const merged = new Map(existing.map((item) => [applicationKey(item.company, item.role), item]));

  for (const company of workspace.companies) {
    const derived = timelineApplication(company);
    if (!derived?.company || !derived?.role) continue;
    const key = applicationKey(derived.company, derived.role);
    const current = merged.get(key);
    merged.set(key, {
      number: current?.number || "",
      date: derived.date,
      company: derived.company,
      role: derived.role,
      score: current?.score || "",
      status: derived.status,
      pdf: current?.pdf || "",
      report: current?.report || "",
      notes: [current?.notes, derived.note].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(" | "),
    });
  }

  const rows = [...merged.values()]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.company).localeCompare(String(b.company)))
    .map((item, index) => [
      index + 1,
      item.date,
      item.company,
      item.role,
      item.score,
      item.status,
      item.pdf,
      item.report,
      item.notes,
    ].map((cell) => String(cell || "").replaceAll("|", "\\|")).join(" | "));
  const content = [
    "# Applications Tracker",
    "",
    "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
    "|---|------|---------|------|-------|--------|-----|--------|-------|",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
  const temporaryPath = `${trackerPath}.tmp`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, trackerPath);
}

function listFiles(directory, extensions = []) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (!extensions.length || extensions.includes(path.extname(entry.name).toLowerCase())))
      .map((entry) => {
        const filePath = path.join(directory, entry.name);
        const stat = fs.statSync(filePath);
        return {
          name: entry.name,
          path: filePath,
          updatedAt: stat.mtime.toISOString(),
          size: stat.size,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function fileRecord(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return {
      name: path.basename(filePath),
      path: filePath,
      updatedAt: stat.mtime.toISOString(),
      size: stat.size,
    };
  } catch {
    return null;
  }
}

function storedFileRecord(filePath, id = "") {
  const record = fileRecord(filePath);
  if (!record) return null;
  return {
    ...record,
    id: id || `${record.updatedAt}-${record.name}`,
    extension: path.extname(record.name).replace(/^\./, "").toUpperCase() || "FILE",
    importedAt: new Date().toISOString(),
  };
}

function storedFileTarget(root, rawTarget) {
  if (typeof rawTarget !== "string" || !rawTarget.trim()) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realTarget = fs.realpathSync(path.resolve(rawTarget));
    const relative = path.relative(realRoot, realTarget);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return fs.statSync(realTarget).isFile() ? realTarget : null;
  } catch {
    return null;
  }
}

function resolveCareerAsset(root, rawTarget) {
  if (typeof rawTarget !== "string" || !rawTarget.trim()) return null;

  let target = rawTarget.trim().split("#", 1)[0].split("?", 1)[0];
  try {
    if (target.startsWith("file://")) target = new URL(target).pathname;
    target = decodeURIComponent(target);
  } catch {
    return null;
  }

  const allowedExtensions = new Set([".docx", ".html", ".json", ".md", ".pdf", ".txt"]);
  const searchDirectories = [
    root,
    path.join(root, "reports"),
    path.join(root, "data"),
    path.join(root, "jds"),
    path.join(root, "output"),
    path.join(root, "interview-prep"),
  ];
  const candidates = path.isAbsolute(target)
    ? [path.resolve(target)]
    : searchDirectories.map((directory) => path.resolve(directory, target.replace(/^\.\//, "")));
  const realRoot = fs.realpathSync(root);

  for (const candidate of candidates) {
    try {
      const realCandidate = fs.realpathSync(candidate);
      const relative = path.relative(realRoot, realCandidate);
      const isInsideRoot = relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      if (!isInsideRoot || !allowedExtensions.has(path.extname(realCandidate).toLowerCase())) continue;
      if (fs.statSync(realCandidate).isFile()) return realCandidate;
    } catch {
      // Continue through the known Career Ops asset directories.
    }
  }
  return null;
}

function resumeWorkspace() {
  const saved = readJson(dataPaths().resume, {});
  const source = typeof saved.sourcePath === "string" ? fileRecord(saved.sourcePath) : null;
  return {
    source: source ? {
      ...source,
      importedAt: typeof saved.importedAt === "string" ? saved.importedAt : source.updatedAt,
    } : null,
    sourceMissing: Boolean(saved.sourcePath && !source),
    latestAnalysis: saved.latestAnalysis && typeof saved.latestAnalysis.output === "string"
      ? saved.latestAnalysis
      : null,
  };
}

function countPipelineItems(root) {
  const content = readText(path.join(root, "data", "pipeline.md"));
  const matches = content.match(/https?:\/\/\S+/g) || [];
  return new Set(matches.map((value) => value.replace(/[),.;]+$/, ""))).size;
}

function careerSnapshot() {
  const root = careerOpsPath();
  const codex = codexExecutable();
  if (!root) {
    return {
      connected: false,
      codexReady: Boolean(codex),
      path: null,
      version: null,
      missing: ["career-ops"],
      applications: [],
      reports: [],
      outputs: [],
      interviewFiles: [],
      pipelineCount: 0,
    };
  }

  const required = [
    ["config/profile.yml", "候选人档案"],
    ["modes/_profile.md", "岗位画像"],
    ["portals.yml", "岗位来源"],
  ];
  const missing = required.filter(([relativePath]) => !fs.existsSync(path.join(root, relativePath))).map(([, label]) => label);
  const applications = parseApplications(root);
  const reports = listFiles(path.join(root, "reports"), [".md"]).filter((file) => file.name !== ".gitkeep");
  const outputs = listFiles(path.join(root, "output"), [".pdf", ".html", ".docx"]).filter((file) => file.name !== ".gitkeep");
  const interviewFiles = listFiles(path.join(root, "interview-prep"), [".md"])
    .filter((file) => !["README.md", ".gitkeep"].includes(file.name));

  return {
    connected: true,
    codexReady: Boolean(codex),
    path: root,
    codexPath: codex,
    version: readText(path.join(root, "VERSION")).trim().split(/\s+/)[0] || null,
    missing,
    applications,
    reports: reports.slice(0, 24),
    outputs: outputs.slice(0, 24),
    interviewFiles: interviewFiles.slice(0, 24),
    resume: resumeWorkspace(),
    assetCounts: {
      reports: reports.length,
      outputs: outputs.length,
      interviews: interviewFiles.length,
    },
    pipelineCount: countPipelineItems(root),
    taskCounts: {
      running: [...careerTasks.values()].filter((task) => task.status === "running").length,
      completed: [...careerTasks.values()].filter((task) => task.status === "completed").length,
      failed: [...careerTasks.values()].filter((task) => task.status === "failed").length,
    },
  };
}

function taskForClient(task) {
  if (!task) return null;
  const { child, ...safeTask } = task;
  return safeTask;
}

function careerTaskPrompt(mode, payload) {
  const definition = careerModes[mode];
  const guides = careerModeGuides[mode] || [];
  if (mode === "resume-analyze") {
    return [
      "This task must run as a Career Ops workflow inside the connected local career-ops repository.",
      `Before analyzing, read AGENTS.md, modes/_profile.md, modes/_custom.md, and this recruiter review guide: ${guides.join(", ")}.`,
      definition.prompt,
      "Write all user-facing output in Simplified Chinese.",
      "The PDF page images are attached to this request in page order. Inspect every attached page, not only the extracted text.",
      `Selected PDF: ${payload.pdfFileName}`,
      `Attached PDF pages: ${payload.pdfPageCount}`,
      `Extracted selectable PDF text:\n${payload.pdfText}`,
      payload.input && `Optional user context:\n${String(payload.input).slice(0, 8000)}`,
      "Return only the finished reader-facing resume analysis. No repository change summary is needed because this task is strictly read-only.",
    ].filter(Boolean).join("\n\n");
  }

  const role = payload.role && typeof payload.role === "object" ? payload.role : {};
  const context = [
    role.company && `Company: ${role.company}`,
    role.team && `Team: ${role.team}`,
    role.role && `Role: ${role.role}`,
    role.location && `Location: ${role.location}`,
    role.jd && `Job description:\n${String(role.jd).slice(0, 16000)}`,
    Array.isArray(payload.roles) && payload.roles.length && `Target-role universe from the user's current offer workspace:\n${payload.roles
      .slice(0, 40)
      .map((item, index) => {
        const values = [
          `${index + 1}. ${item.company || "Unknown company"}`,
          item.team && `Team: ${item.team}`,
          item.role && `Role: ${item.role}`,
          item.location && `Location: ${item.location}`,
          item.jd && `JD:\n${String(item.jd).slice(0, 6000)}`,
        ].filter(Boolean);
        return values.join("\n");
      })
      .join("\n\n")}`,
    payload.resumeSource && `Resume source explicitly selected by the user in offer:\n${String(payload.resumeSource).slice(0, 4000)}`,
    payload.input && `User input:\n${String(payload.input).slice(0, 16000)}`,
  ].filter(Boolean).join("\n\n");

  return [
    "This task must run as a Career Ops workflow inside the connected local career-ops repository. Do not replace it with a generic standalone prompt or an unrelated service.",
    `Before acting, read AGENTS.md, modes/_profile.md, modes/_custom.md, and these workflow guides: ${guides.join(", ") || "the relevant Career Ops mode guide"}. If a required guide is missing, stop and report the missing file instead of improvising a substitute workflow.`,
    definition.prompt,
    "Write all user-facing output in Simplified Chinese.",
    "Follow AGENTS.md and the career-ops data contract. Use only verified user-layer facts for candidate claims.",
    "Never send a message, submit an application, or record a draft as sent/applied. Keep the user in control of external actions.",
    context || "Use the current career-ops profile and tracker as context.",
    "At the end, summarize what changed on disk, what still needs human review, and the most useful next action.",
  ].join("\n\n");
}

function parseCodexLine(task, line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    if (line.trim()) task.log.push(line.trim());
    return;
  }

  if (value.type === "thread.started" && value.thread_id) task.threadId = value.thread_id;
  if (value.type === "turn.started") task.log.push("Career Ops 正在逐页审阅简历…");
  if (value.type === "item.started" && value.item?.type === "command_execution") {
    task.log.push("正在核对 PDF 文字、版式和招聘方阅读风险…");
  }
  if (value.type === "item.completed" && value.item?.type === "agent_message" && value.item?.text) {
    task.output = value.item.text;
  }
  if (value.type === "item.completed" && value.item?.type === "reasoning" && value.item?.text) {
    task.log.push(value.item.text);
  }
  if (value.type === "error" && value.message) task.log.push(value.message);
  if (task.log.length > 80) task.log = task.log.slice(-80);
}

function persistResumeAnalysis(task) {
  if (task.mode !== "resume-analyze" || task.status !== "completed" || !task.output) return;
  const current = readJson(dataPaths().resume, {});
  writeJson(dataPaths().resume, {
    ...current,
    latestAnalysis: {
      id: task.id,
      title: task.title,
      output: task.output,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      sourceName: current.sourcePath ? path.basename(current.sourcePath) : "",
    },
  });
}

function spawnCareerTask(task, { codex, root, prompt, pageImages = [] }) {
  const args = [
    "exec",
    "--json",
    ...(task.mode === "resume-analyze" ? [] : ["--ephemeral"]),
    "--skip-git-repo-check",
    "--sandbox",
    task.mode === "resume-analyze" ? "read-only" : "workspace-write",
    "-C",
    root,
    prompt,
    ...pageImages.flatMap((imagePath) => ["--image", imagePath]),
  ];
  const child = spawn(codex, args, {
    cwd: root,
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  task.child = child;

  let stdoutBuffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    lines.forEach((line) => parseCodexLine(task, line));
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    const text = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line
        && !line.includes("failed to load skill")
        && !line.includes("codex_core::session"))
      .join("\n");
    if (text) task.log.push(text.slice(0, 2000));
    if (task.log.length > 80) task.log = task.log.slice(-80);
  });
  child.on("error", (error) => {
    task.status = "failed";
    task.error = error.message;
    task.completedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    if (stdoutBuffer.trim()) parseCodexLine(task, stdoutBuffer);
    if (task.status === "cancelled") return;
    task.status = code === 0 ? "completed" : "failed";
    task.error = code === 0 ? "" : (task.log.at(-1) || `Codex 退出，状态码 ${code}`);
    task.completedAt = new Date().toISOString();
    task.child = null;
    persistResumeAnalysis(task);
  });
}

function startCareerTask(payload) {
  const mode = String(payload?.mode || "");
  const definition = careerModes[mode];
  if (!definition) throw new Error("未知的 Career Ops 动作");
  const root = careerOpsPath();
  const codex = codexExecutable();
  if (!root) throw new Error("未找到 career-ops");
  if (!codex) throw new Error("未找到 Codex CLI");
  const missingGuides = (careerModeGuides[mode] || [])
    .filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
  if (missingGuides.length) {
    throw new Error(`Career Ops 工作流文件缺失：${missingGuides.join("、")}`);
  }
  if ([...careerTasks.values()].some((task) => task.status === "running")) {
    throw new Error("已有一个 AI 任务正在运行，请等待它完成");
  }

  const id = `career-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const task = {
    id,
    mode,
    engine: "career-ops",
    guides: careerModeGuides[mode] || [],
    title: definition.title,
    status: "running",
    createdAt: new Date().toISOString(),
    completedAt: null,
    output: "",
    log: ["正在连接 Codex 与 career-ops…"],
    error: "",
    threadId: null,
    child: null,
  };
  careerTasks.set(id, task);

  (async () => {
    if (mode === "resume-analyze") {
      const prepared = await prepareResumeAnalysis(payload.resumeSource, task);
      if (task.status === "cancelled") return;
      task.log.push(`PDF 共 ${prepared.pageImages.length} 页，正在交给 Career Ops 审阅…`);
      const prompt = careerTaskPrompt(mode, {
        ...payload,
        pdfFileName: prepared.fileName,
        pdfPageCount: prepared.pageImages.length,
        pdfText: prepared.extractedText,
      });
      spawnCareerTask(task, {
        codex,
        root,
        prompt,
        pageImages: prepared.pageImages,
      });
      return;
    }
    spawnCareerTask(task, {
      codex,
      root,
      prompt: careerTaskPrompt(mode, payload),
    });
  })().catch((error) => {
    if (task.status === "cancelled") return;
    task.status = "failed";
    task.error = error.message;
    task.completedAt = new Date().toISOString();
  });

  return taskForClient(task);
}

function cancelCareerTask(id) {
  const task = careerTasks.get(id);
  if (!task || task.status !== "running") return false;
  task.status = "cancelled";
  task.completedAt = new Date().toISOString();
  if (task.child) task.child.kill("SIGTERM");
  task.child = null;
  return true;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function ensureCleanDataFiles() {
  const paths = dataPaths();
  fs.mkdirSync(paths.directory, { recursive: true });
  if (!fs.existsSync(paths.workspace)) writeJson(paths.workspace, emptyWorkspace);
  if (!fs.existsSync(paths.intelligence)) writeJson(paths.intelligence, emptyIntelligence);
  if (!fs.existsSync(paths.loopRuns)) writeJson(paths.loopRuns, emptyLoopRuns);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".otf": "font/otf",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webp": "image/webp",
  }[extension] || "application/octet-stream";
}

async function handleAppRequest(request) {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const paths = dataPaths();

  if (pathname === "/api/workspace" && request.method === "GET") {
    return jsonResponse(readJson(paths.workspace, emptyWorkspace));
  }

  if (pathname === "/api/workspace" && request.method === "PUT") {
    try {
      const value = await request.json();
      if (!Array.isArray(value.companies)) return jsonResponse({ error: "Invalid workspace" }, 400);
      writeJson(paths.workspace, value);
      syncTimelineApplications(value);
      return jsonResponse(careerSnapshot());
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
  }

  if (pathname === "/api/intelligence" && request.method === "GET") {
    return jsonResponse(normalizeIntelligence(readJson(paths.intelligence, emptyIntelligence)));
  }

  if (pathname === "/api/loop-runs" && request.method === "GET") {
    const value = readJson(paths.loopRuns, emptyLoopRuns);
    return jsonResponse({ version: 1, runs: Array.isArray(value?.runs) ? value.runs : [] });
  }

  if (pathname === "/api/career-ops/snapshot" && request.method === "GET") {
    return jsonResponse(careerSnapshot());
  }

  if (pathname === "/api/files/import" && request.method === "POST") {
    try {
      const payload = await request.json();
      const roleId = String(payload.roleId || "").trim();
      if (!roleId) return jsonResponse({ error: "请先选择岗位" }, 400);
      const options = {
        title: "选择要归档到岗位的文件",
        buttonLabel: "添加到 offer",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "求职文件", extensions: ["pdf", "doc", "docx", "md", "txt", "html", "png", "jpg", "jpeg", "xlsx", "pptx"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      };
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const result = focusedWindow
        ? await dialog.showOpenDialog(focusedWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths.length) return jsonResponse({ cancelled: true, files: [] });
      const roleDirectory = path.join(paths.files, roleId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "unassigned");
      fs.mkdirSync(roleDirectory, { recursive: true });
      const imported = result.filePaths.flatMap((sourcePath, index) => {
        try {
          const source = fileRecord(sourcePath);
          if (!source) return [];
          const parsed = path.parse(source.name);
          let target = path.join(roleDirectory, source.name);
          let suffix = 2;
          while (fs.existsSync(target)) {
            target = path.join(roleDirectory, `${parsed.name}-${suffix}${parsed.ext}`);
            suffix += 1;
          }
          fs.copyFileSync(source.path, target);
          const record = storedFileRecord(target, `${Date.now()}-${index}`);
          return record ? [record] : [];
        } catch {
          return [];
        }
      });
      return imported.length
        ? jsonResponse({ imported: true, files: imported })
        : jsonResponse({ error: "没有可归档的文件" }, 400);
    } catch (error) {
      return jsonResponse({ error: error.message || "无法添加文件" }, 400);
    }
  }

  if (pathname === "/api/files/open" && request.method === "POST") {
    try {
      const payload = await request.json();
      const target = storedFileTarget(paths.files, payload.path);
      if (!target) return jsonResponse({ error: "文件不存在或已被移动" }, 404);
      if (payload.reveal) {
        shell.showItemInFolder(target);
        return jsonResponse({ revealed: true });
      }
      const result = await shell.openPath(target);
      return result ? jsonResponse({ error: result }, 500) : jsonResponse({ opened: true });
    } catch (error) {
      return jsonResponse({ error: error.message || "无法打开文件" }, 400);
    }
  }

  if (pathname === "/api/career-ops/resume/import" && request.method === "POST") {
    const root = careerOpsPath();
    if (!root) return jsonResponse({ error: "未找到 career-ops" }, 404);
    try {
      const options = {
        title: "选择要分析的 PDF 简历",
        buttonLabel: "选择 PDF",
        properties: ["openFile"],
        filters: [
          { name: "PDF 简历", extensions: ["pdf"] },
        ],
      };
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const result = focusedWindow
        ? await dialog.showOpenDialog(focusedWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return jsonResponse({ cancelled: true, resume: resumeWorkspace() });
      const sourcePath = path.resolve(result.filePaths[0]);
      const source = fileRecord(sourcePath);
      if (!source || path.extname(source.path).toLowerCase() !== ".pdf") {
        return jsonResponse({ error: "请选择一份 PDF 简历" }, 400);
      }
      writeJson(dataPaths().resume, {
        sourcePath,
        importedAt: new Date().toISOString(),
        latestAnalysis: null,
      });
      return jsonResponse({ imported: true, resume: resumeWorkspace() });
    } catch (error) {
      return jsonResponse({ error: error.message || "无法导入简历" }, 400);
    }
  }

  if (pathname === "/api/career-ops/resume/open" && request.method === "POST") {
    const root = careerOpsPath();
    if (!root) return jsonResponse({ error: "未找到 career-ops" }, 404);
    try {
      const payload = await request.json();
      const resume = resumeWorkspace();
      const targets = {
        source: resume.source?.path,
      };
      const target = targets[payload.asset];
      if (!target || !fileRecord(target)) return jsonResponse({ error: "文件尚未生成或已经移动" }, 404);
      if (payload.reveal) {
        shell.showItemInFolder(target);
        return jsonResponse({ revealed: true });
      }
      const result = await shell.openPath(target);
      return result ? jsonResponse({ error: result }, 500) : jsonResponse({ opened: true });
    } catch (error) {
      return jsonResponse({ error: error.message || "无法打开文件" }, 400);
    }
  }

  if (pathname === "/api/career-ops/tasks" && request.method === "GET") {
    return jsonResponse([...careerTasks.values()]
      .map(taskForClient)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20));
  }

  if (pathname.startsWith("/api/career-ops/tasks/") && request.method === "GET") {
    const id = pathname.split("/").at(-1);
    const task = taskForClient(careerTasks.get(id));
    return task ? jsonResponse(task) : jsonResponse({ error: "Task not found" }, 404);
  }

  if (pathname.startsWith("/api/career-ops/tasks/") && request.method === "DELETE") {
    const id = pathname.split("/").at(-1);
    return cancelCareerTask(id)
      ? jsonResponse({ cancelled: true })
      : jsonResponse({ error: "Task is not running" }, 409);
  }

  if (pathname === "/api/career-ops/run" && request.method === "POST") {
    try {
      const payload = await request.json();
      return jsonResponse(startCareerTask(payload), 202);
    } catch (error) {
      return jsonResponse({ error: error.message || "无法启动任务" }, 400);
    }
  }

  if (pathname === "/api/career-ops/open" && request.method === "POST") {
    const root = careerOpsPath();
    if (!root) return jsonResponse({ error: "未找到 career-ops" }, 404);
    try {
      const payload = await request.json();
      const locations = {
        root,
        reports: path.join(root, "reports"),
        outputs: path.join(root, "output"),
        interviews: path.join(root, "interview-prep"),
        tracker: path.join(root, "data", "applications.md"),
      };
      const target = locations[payload.target];
      if (!target || !target.startsWith(root)) return jsonResponse({ error: "Invalid target" }, 400);
      const result = await shell.openPath(target);
      return result ? jsonResponse({ error: result }, 500) : jsonResponse({ opened: true });
    } catch (error) {
      return jsonResponse({ error: error.message || "无法打开位置" }, 400);
    }
  }

  if (pathname === "/api/career-ops/file/open" && request.method === "POST") {
    const root = careerOpsPath();
    if (!root) return jsonResponse({ error: "未找到 career-ops" }, 404);
    try {
      const payload = await request.json();
      const target = resolveCareerAsset(root, payload.href);
      if (!target) return jsonResponse({ error: "没有找到对应的 Career Ops 本地文件" }, 404);
      const result = await shell.openPath(target);
      return result
        ? jsonResponse({ error: result }, 500)
        : jsonResponse({ opened: true, name: path.basename(target) });
    } catch (error) {
      return jsonResponse({ error: error.message || "无法打开 Career Ops 文件" }, 400);
    }
  }

  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const targetPath = path.resolve(webRoot, relativePath);
  if (!targetPath.startsWith(`${webRoot}${path.sep}`) && targetPath !== webRoot) {
    return new Response("Forbidden", { status: 403 });
  }

  const existingPath = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
    ? targetPath
    : path.join(webRoot, "index.html");
  return new Response(fs.readFileSync(existingPath), {
    headers: { "Content-Type": contentTypeForPath(existingPath) },
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: "offer",
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("offer://")) {
      event.preventDefault();
      if (url.startsWith("https://")) shell.openExternal(url);
    }
  });
  window.loadURL("offer://app/index.html");
}

app.whenReady().then(() => {
  ensureCleanDataFiles();
  protocol.handle("offer", handleAppRequest);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
