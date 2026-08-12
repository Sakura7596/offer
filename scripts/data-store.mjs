import fs from "node:fs";
import path from "node:path";

export const EMPTY_WORKSPACE = {
  version: 1,
  updatedAt: null,
  profile: { name: "", title: "", location: "" },
  companies: [],
};

export function validateWorkspace(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.companies)) {
    throw new Error("工作区数据格式无效：缺少 companies 数组");
  }
  for (const company of value.companies) {
    if (!company || typeof company !== "object" || Array.isArray(company)) {
      throw new Error("工作区数据格式无效：岗位记录必须是对象");
    }
    if (typeof company.id !== "string") {
      throw new Error("工作区数据格式无效：岗位 id 必须是字符串");
    }
    if ((company.name !== undefined && typeof company.name !== "string") || (company.role !== undefined && typeof company.role !== "string")) {
      throw new Error("工作区数据格式无效：公司和岗位名称必须是字符串");
    }
    if (company.timeline !== undefined && !Array.isArray(company.timeline)) {
      throw new Error("工作区数据格式无效：timeline 必须是数组");
    }
    for (const node of company.timeline || []) {
      if (!node || typeof node !== "object" || Array.isArray(node) || (node.date !== undefined && typeof node.date !== "string")) {
        throw new Error("工作区数据格式无效：时间节点格式无效");
      }
      if (["type", "title", "time", "note"].some((field) => node[field] !== undefined && typeof node[field] !== "string")) {
        throw new Error("工作区数据格式无效：时间节点文字必须是字符串");
      }
    }
  }
  return value;
}

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function nextBackupPath(backupDirectory, backupPrefix) {
  const stem = `${backupPrefix}${safeTimestamp()}`;
  let suffix = 0;
  let candidate;
  do {
    candidate = path.join(backupDirectory, `${stem}${suffix ? `-${suffix}` : ""}.json`);
    suffix += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

function pruneBackups(backupDirectory, prefix, keep) {
  const files = fs.readdirSync(backupDirectory)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(backupDirectory, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  files.slice(keep).forEach(({ name }) => fs.rmSync(path.join(backupDirectory, name), { force: true }));
}

const WORKSPACE_BACKUP_NAME = /^workspace-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

function workspaceBackupPath(backupDirectory, name) {
  if (typeof name !== "string" || !WORKSPACE_BACKUP_NAME.test(name) || path.basename(name) !== name) {
    throw new Error("备份文件名无效");
  }
  return path.join(backupDirectory, name);
}

export function listWorkspaceBackups(backupDirectory) {
  let entries;
  try {
    entries = fs.readdirSync(backupDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && WORKSPACE_BACKUP_NAME.test(entry.name))
    .map((entry) => {
      const filePath = workspaceBackupPath(backupDirectory, entry.name);
      const stat = fs.statSync(filePath);
      try {
        const workspace = validateWorkspace(JSON.parse(fs.readFileSync(filePath, "utf8")));
        return {
          name: entry.name,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
          recordCount: workspace.companies.length,
          revision: workspace.updatedAt || null,
          valid: true,
        };
      } catch {
        return {
          name: entry.name,
          createdAt: stat.mtime.toISOString(),
          size: stat.size,
          recordCount: null,
          revision: null,
          valid: false,
        };
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
}

export function writeJsonAtomic(filePath, value, options = {}) {
  const directory = path.dirname(filePath);
  const backupDirectory = options.backupDirectory || path.join(directory, "backups");
  const backupPrefix = options.backupPrefix || `${path.basename(filePath, ".json")}-`;
  const keepBackups = options.keepBackups ?? 40;
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(backupDirectory, { recursive: true });

  const existed = fs.existsSync(filePath);
  const backupPath = nextBackupPath(backupDirectory, backupPrefix);
  if (existed) fs.copyFileSync(filePath, backupPath);

  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const handle = fs.openSync(temporaryPath, "w");
  try {
    fs.writeFileSync(handle, serialized, "utf8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }

  const previousPath = `${filePath}.${process.pid}.${Date.now()}.previous`;
  try {
    if (existed) fs.renameSync(filePath, previousPath);
    fs.renameSync(temporaryPath, filePath);
    if (existed) fs.rmSync(previousPath, { force: true });
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    if (!fs.existsSync(filePath) && fs.existsSync(previousPath)) fs.renameSync(previousPath, filePath);
    throw error;
  }
  if (!existed) fs.copyFileSync(filePath, backupPath);
  pruneBackups(backupDirectory, backupPrefix, keepBackups);
  return backupPath;
}

export function restoreWorkspaceBackup(workspacePath, backupDirectory, name, options = {}) {
  const current = readWorkspaceWithRecovery(workspacePath, backupDirectory).value;
  const currentRevision = current.updatedAt || null;
  if (options.baseUpdatedAt !== currentRevision) {
    const error = new Error("数据已被另一个页面更新，请刷新后再恢复");
    error.code = "REVISION_CONFLICT";
    error.currentRevision = currentRevision;
    throw error;
  }

  const backup = listWorkspaceBackups(backupDirectory).find((item) => item.name === name);
  if (!backup) throw new Error("备份不存在或文件名无效");
  if (!backup.valid) throw new Error("备份已损坏或数据格式无效");

  const restored = validateWorkspace(JSON.parse(fs.readFileSync(workspaceBackupPath(backupDirectory, name), "utf8")));
  const workspace = structuredClone(restored);
  workspace.updatedAt = (options.now || new Date()).toISOString();
  const backupPath = writeJsonAtomic(workspacePath, workspace, {
    backupDirectory,
    keepBackups: options.keepBackups,
  });
  return {
    workspace,
    revision: workspace.updatedAt,
    restoredFrom: name,
    backup: path.basename(backupPath),
  };
}

export function readWorkspaceWithRecovery(workspacePath, backupDirectory) {
  try {
    return { value: validateWorkspace(JSON.parse(fs.readFileSync(workspacePath, "utf8"))), recoveredFrom: null };
  } catch (readError) {
    try {
      const backups = fs.readdirSync(backupDirectory)
        .filter((name) => name.startsWith("workspace-") && name.endsWith(".json"))
        .map((name) => ({ name, mtimeMs: fs.statSync(path.join(backupDirectory, name)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
      for (const { name } of backups) {
        try {
          const value = validateWorkspace(JSON.parse(fs.readFileSync(path.join(backupDirectory, name), "utf8")));
          return { value, recoveredFrom: name };
        } catch {
          // Try the next retained snapshot.
        }
      }
    } catch {
      // No backup directory yet.
    }
    if (!fs.existsSync(workspacePath) && readError?.code === "ENOENT") {
      return { value: structuredClone(EMPTY_WORKSPACE), recoveredFrom: null, fresh: true };
    }
    throw new Error(`工作区数据无法读取，且没有可用备份：${readError?.message || "未知错误"}`);
  }
}

export function storageInfo(dataDirectory) {
  const backupDirectory = path.join(dataDirectory, "backups");
  let backups = [];
  try {
    backups = fs.readdirSync(backupDirectory).filter((name) => name.startsWith("workspace-") && name.endsWith(".json")).sort().reverse();
  } catch {
    backups = [];
  }
  return {
    dataDirectory,
    backupCount: backups.length,
    latestBackup: backups[0] || null,
  };
}
