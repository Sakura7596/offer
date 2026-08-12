import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  listWorkspaceBackups,
  readJson,
  readWorkspaceWithRecovery,
  restoreWorkspaceBackup,
  storageInfo,
  validateWorkspace,
  writeJsonAtomic,
} from "./scripts/data-store.mjs";

const defaultLocalDataRoot = process.platform === "win32"
  ? process.env.LOCALAPPDATA
  : process.env.XDG_DATA_HOME || path.join(process.env.HOME || "", ".local", "share");
const developmentDataDirectory = process.env.OFFER_DEV_DATA_DIR
  ? path.resolve(process.env.OFFER_DEV_DATA_DIR)
  : path.resolve(defaultLocalDataRoot || "data", "Offer-AutumnRecruitment", "data");
const workspacePath = path.join(developmentDataDirectory, "workspace.json");
const intelligencePath = path.join(developmentDataDirectory, "intelligence.json");
const loopRunsPath = path.join(developmentDataDirectory, "loop-runs.json");
const resumePath = path.join(developmentDataDirectory, "resume.json");
const backupDirectory = path.join(developmentDataDirectory, "backups");
const assetsDirectory = path.join(developmentDataDirectory, "assets");
const careerOpsPath = process.env.CAREER_OPS_DIR
  ? path.resolve(process.env.CAREER_OPS_DIR)
  : path.join(process.env.USERPROFILE || process.env.HOME || "", "Documents", "秋招", "career-ops");
const readOnlyDevelopmentData = process.env.OFFER_DEV_READ_ONLY === "1";

function listFiles(directory, extensions) {
  try {
    return fs.readdirSync(directory)
      .filter((name) => extensions.includes(path.extname(name).toLowerCase()))
      .map((name) => {
        const filePath = path.join(directory, name);
        const stat = fs.statSync(filePath);
        return { name, path: filePath, updatedAt: stat.mtime.toISOString(), size: stat.size };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function careerSnapshot() {
  const reports = listFiles(path.join(careerOpsPath, "reports"), [".md"]);
  const outputs = listFiles(path.join(careerOpsPath, "output"), [".pdf", ".html", ".docx"]);
  const interviewFiles = listFiles(path.join(careerOpsPath, "interview-prep"), [".md"]);
  const resume = readJson(resumePath, {});
  let source = null;
  try {
    if (resume.sourcePath) {
      const stat = fs.statSync(resume.sourcePath);
      source = { name: path.basename(resume.sourcePath), path: resume.sourcePath, size: stat.size, updatedAt: stat.mtime.toISOString() };
    }
  } catch {
    source = null;
  }
  return {
    connected: fs.existsSync(careerOpsPath),
    codexReady: true,
    missing: [],
    version: null,
    applications: [],
    reports,
    outputs,
    interviewFiles,
    resume: { source, latestAnalysis: resume.latestAnalysis || null },
    assetCounts: { reports: reports.length, outputs: outputs.length, interviews: interviewFiles.length },
    pipelineCount: 0,
  };
}

function offerWorkspaceBridge() {
  function handler(req, res, next) {
    if (req.url === "/api/health" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, apiVersion: 2 }));
      return;
    }
    if (req.url === "/api/workspace/backups" && req.method === "GET") {
      try {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ backups: listWorkspaceBackups(backupDirectory), storage: storageInfo(developmentDataDirectory) }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    if (req.url === "/api/workspace/restore" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          if (readOnlyDevelopmentData) throw new Error("当前工作区为只读模式");
          const { name, baseUpdatedAt } = JSON.parse(body);
          const restored = restoreWorkspaceBackup(workspacePath, backupDirectory, name, { baseUpdatedAt });
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            revision: restored.revision,
            restoredFrom: restored.restoredFrom,
            backup: restored.backup,
            storage: storageInfo(developmentDataDirectory),
          }));
        } catch (error) {
          res.statusCode = error?.code === "REVISION_CONFLICT" ? 409 : 400;
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: error.message, currentRevision: error?.currentRevision }));
        }
      });
      return;
    }
    if (req.url === "/api/workspace/export" && req.method === "GET") {
      try {
        const workspace = readWorkspaceWithRecovery(workspacePath, backupDirectory).value;
        const inlineAsset = (value) => {
          if (!String(value || "").startsWith("/api/assets/")) return value || "";
          const fileName = decodeURIComponent(value.slice("/api/assets/".length));
          if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(fileName)) return "";
          const extension = path.extname(fileName).slice(1);
          const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
          return `data:${mime};base64,${fs.readFileSync(path.join(assetsDirectory, fileName)).toString("base64")}`;
        };
        const portable = {
          ...workspace,
          companies: workspace.companies.map((company) => ({
            ...company,
            logoUrl: inlineAsset(company.logoUrl),
            jdImage: inlineAsset(company.jdImage),
          })),
        };
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="offer-workspace-backup-${new Date().toISOString().slice(0, 10)}.json"`);
        res.end(`${JSON.stringify(portable, null, 2)}\n`);
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    if (req.url === "/api/workspace" && req.method === "GET") {
      try {
        const workspace = readWorkspaceWithRecovery(workspacePath, backupDirectory);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ...workspace.value, storage: { ...storageInfo(developmentDataDirectory), recoveredFrom: workspace.recoveredFrom, fresh: Boolean(workspace.fresh) } }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: error.message, storage: storageInfo(developmentDataDirectory) }));
      }
      return;
    }
    if (req.url === "/api/intelligence" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(readJson(intelligencePath, { generatedAt: null, opportunities: [], roleBriefs: {} })));
      return;
    }
    if (req.url === "/api/loop-runs" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(readJson(loopRunsPath, { version: 1, runs: [] })));
      return;
    }
    if (req.url === "/api/career-ops/snapshot" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(careerSnapshot()));
      return;
    }
    if (req.url === "/api/career-ops/tasks" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end("[]");
      return;
    }
    if (req.url === "/api/workspace" && req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const incoming = validateWorkspace(JSON.parse(body));
          if (readOnlyDevelopmentData) throw new Error("当前工作区为只读模式");
          const current = readWorkspaceWithRecovery(workspacePath, backupDirectory).value;
          const currentRevision = current.updatedAt || null;
          if (incoming.baseUpdatedAt !== currentRevision) {
            res.statusCode = 409;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "数据已被另一个页面更新，请刷新后再继续编辑", currentRevision }));
            return;
          }
          const { baseUpdatedAt: _baseUpdatedAt, ...workspace } = incoming;
          workspace.updatedAt = new Date().toISOString();
          const backupPath = writeJsonAtomic(workspacePath, workspace, { backupDirectory });
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ savedAt: workspace.updatedAt, backup: path.basename(backupPath), storage: storageInfo(developmentDataDirectory) }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }
    if (req.url?.startsWith("/api/assets/") && req.method === "GET") {
      const fileName = decodeURIComponent(req.url.slice("/api/assets/".length));
      if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(fileName)) {
        res.statusCode = 400;
        res.end("Invalid asset path");
        return;
      }
      const assetPath = path.join(assetsDirectory, fileName);
      if (!fs.existsSync(assetPath)) {
        res.statusCode = 404;
        res.end("Asset not found");
        return;
      }
      const extension = path.extname(fileName).slice(1);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Type", extension === "jpg" ? "image/jpeg" : `image/${extension}`);
      fs.createReadStream(assetPath).pipe(res);
      return;
    }
    if (req.url === "/api/assets" && req.method === "POST") {
      let body = "";
      let tooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 8 * 1024 * 1024) tooLarge = true;
      });
      req.on("end", () => {
        try {
          if (tooLarge) throw new Error("图片数据过大");
          const { dataUrl } = JSON.parse(body);
          const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
          if (!match) throw new Error("图片格式无效");
          const buffer = Buffer.from(match[2], "base64");
          if (!buffer.length || buffer.length > 4 * 1024 * 1024) throw new Error("图片不能超过 4MB");
          const extension = match[1] === "jpeg" ? "jpg" : match[1];
          const fileName = `${createHash("sha256").update(buffer).digest("hex")}.${extension}`;
          const assetPath = path.join(assetsDirectory, fileName);
          fs.mkdirSync(assetsDirectory, { recursive: true });
          if (!fs.existsSync(assetPath)) {
            const temporaryPath = `${assetPath}.${process.pid}.tmp`;
            fs.writeFileSync(temporaryPath, buffer);
            fs.renameSync(temporaryPath, assetPath);
          }
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ url: `/api/assets/${fileName}` }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }
    if (req.url === "/api/storage" && req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(storageInfo(developmentDataDirectory)));
      return;
    }
    if (req.url === "/api/storage/open" && req.method === "POST") {
      try {
        fs.mkdirSync(developmentDataDirectory, { recursive: true });
        if (process.platform === "win32") spawn("explorer.exe", [developmentDataDirectory], { detached: true, stdio: "ignore" }).unref();
        else if (process.platform === "darwin") spawn("open", [developmentDataDirectory], { detached: true, stdio: "ignore" }).unref();
        else spawn("xdg-open", [developmentDataDirectory], { detached: true, stdio: "ignore" }).unref();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    next();
  }

  return {
    name: "offer-workspace-bridge",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    watch: {
      ignored: ["**/data/workspace.json", "**/data/intelligence.json", "**/data/loop-runs.json", "**/data/*.tmp", "**/backups/**"],
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), offerWorkspaceBridge()],
});
