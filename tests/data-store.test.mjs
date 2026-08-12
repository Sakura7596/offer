import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EMPTY_WORKSPACE,
  listWorkspaceBackups,
  readWorkspaceWithRecovery,
  restoreWorkspaceBackup,
  storageInfo,
  validateWorkspace,
  writeJsonAtomic,
} from "../scripts/data-store.mjs";

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "offer-data-store-"));
}

test("atomic writes persist valid JSON and retain bounded backups", () => {
  const directory = temporaryDirectory();
  const workspacePath = path.join(directory, "workspace.json");
  const backupDirectory = path.join(directory, "backups");
  for (let index = 0; index < 4; index += 1) {
    writeJsonAtomic(workspacePath, { ...EMPTY_WORKSPACE, companies: [{ id: String(index) }] }, { backupDirectory, keepBackups: 2 });
  }
  assert.equal(JSON.parse(fs.readFileSync(workspacePath, "utf8")).companies[0].id, "3");
  assert.equal(storageInfo(directory).backupCount, 2);
  const retained = fs.readdirSync(backupDirectory).sort().map((name) => JSON.parse(fs.readFileSync(path.join(backupDirectory, name), "utf8")).companies[0].id);
  assert.deepEqual(retained, ["1", "2"]);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("a corrupt workspace recovers from the latest valid backup", () => {
  const directory = temporaryDirectory();
  const workspacePath = path.join(directory, "workspace.json");
  const backupDirectory = path.join(directory, "backups");
  writeJsonAtomic(workspacePath, { ...EMPTY_WORKSPACE, companies: [{ id: "safe" }] }, { backupDirectory });
  fs.writeFileSync(workspacePath, "{broken", "utf8");
  const recovered = readWorkspaceWithRecovery(workspacePath, backupDirectory);
  assert.equal(recovered.value.companies[0].id, "safe");
  assert.match(recovered.recoveredFrom, /^workspace-/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("missing data returns a fresh empty workspace", () => {
  const directory = temporaryDirectory();
  const recovered = readWorkspaceWithRecovery(path.join(directory, "missing.json"), path.join(directory, "backups"));
  assert.deepEqual(recovered.value.companies, []);
  assert.equal(recovered.recoveredFrom, null);
  assert.equal(recovered.fresh, true);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("corrupt data without a valid backup fails closed", () => {
  const directory = temporaryDirectory();
  const workspacePath = path.join(directory, "workspace.json");
  fs.writeFileSync(workspacePath, "{broken", "utf8");
  assert.throws(() => readWorkspaceWithRecovery(workspacePath, path.join(directory, "backups")), /没有可用备份/);
  assert.equal(fs.readFileSync(workspacePath, "utf8"), "{broken");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("workspace validation rejects malformed input", () => {
  assert.throws(() => validateWorkspace({}), /companies/);
  assert.throws(() => validateWorkspace({ companies: [null] }), /岗位记录/);
  assert.throws(() => validateWorkspace({ companies: [{ id: 1 }] }), /岗位 id/);
  assert.throws(() => validateWorkspace({ companies: [{ id: "1", name: 2 }] }), /公司和岗位名称/);
  assert.throws(() => validateWorkspace({ companies: [{ id: "1", role: [] }] }), /公司和岗位名称/);
  assert.throws(() => validateWorkspace({ companies: [{ id: "1", timeline: {} }] }), /timeline/);
  assert.throws(() => validateWorkspace({ companies: [{ id: "1", timeline: [null] }] }), /时间节点/);
  assert.throws(() => validateWorkspace({ companies: [{ id: "1", timeline: [{ title: {} }] }] }), /时间节点文字/);
  assert.equal(validateWorkspace({ companies: [] }).companies.length, 0);
});

test("backup listing reports metadata, validity, and newest files first", () => {
  const directory = temporaryDirectory();
  const backupDirectory = path.join(directory, "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const olderName = "workspace-2026-08-10T10-00-00-000Z.json";
  const newerName = "workspace-2026-08-11T10-00-00-000Z.json";
  fs.writeFileSync(path.join(backupDirectory, olderName), JSON.stringify({ ...EMPTY_WORKSPACE, updatedAt: "old", companies: [{ id: "1" }, { id: "2" }] }), "utf8");
  fs.writeFileSync(path.join(backupDirectory, newerName), "{broken", "utf8");
  fs.mkdirSync(path.join(backupDirectory, "workspace-2026-08-12T10-00-00-000Z.json"));
  fs.writeFileSync(path.join(backupDirectory, "notes.json"), "{}", "utf8");
  fs.utimesSync(path.join(backupDirectory, olderName), new Date("2026-08-10T10:00:00Z"), new Date("2026-08-10T10:00:00Z"));
  fs.utimesSync(path.join(backupDirectory, newerName), new Date("2026-08-11T10:00:00Z"), new Date("2026-08-11T10:00:00Z"));

  const backups = listWorkspaceBackups(backupDirectory);
  assert.deepEqual(backups.map(({ name }) => name), [newerName, olderName]);
  assert.deepEqual(backups[0], {
    name: newerName,
    createdAt: "2026-08-11T10:00:00.000Z",
    size: 7,
    recordCount: null,
    revision: null,
    valid: false,
  });
  assert.equal(backups[1].valid, true);
  assert.equal(backups[1].recordCount, 2);
  assert.equal(backups[1].revision, "old");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("backup listing returns an empty list before the first snapshot exists", () => {
  const directory = temporaryDirectory();
  assert.deepEqual(listWorkspaceBackups(path.join(directory, "backups")), []);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("restoring a valid backup preserves the current workspace as a new snapshot", () => {
  const directory = temporaryDirectory();
  const workspacePath = path.join(directory, "workspace.json");
  const backupDirectory = path.join(directory, "backups");
  const current = { ...EMPTY_WORKSPACE, updatedAt: "current-revision", companies: [{ id: "current" }] };
  const selectedName = "workspace-2026-08-10T10-00-00-000Z.json";
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.writeFileSync(workspacePath, JSON.stringify(current), "utf8");
  fs.writeFileSync(path.join(backupDirectory, selectedName), JSON.stringify({ ...EMPTY_WORKSPACE, updatedAt: "old-revision", companies: [{ id: "restored" }] }), "utf8");

  const restored = restoreWorkspaceBackup(workspacePath, backupDirectory, selectedName, {
    baseUpdatedAt: "current-revision",
    now: new Date("2026-08-12T12:00:00.000Z"),
  });

  assert.equal(restored.revision, "2026-08-12T12:00:00.000Z");
  assert.equal(restored.restoredFrom, selectedName);
  assert.equal(JSON.parse(fs.readFileSync(workspacePath, "utf8")).companies[0].id, "restored");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backupDirectory, restored.backup), "utf8")), current);
  restored.workspace.companies[0].id = "mutated-after-restore";
  assert.equal(JSON.parse(fs.readFileSync(workspacePath, "utf8")).companies[0].id, "restored");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("backup restore rejects stale revisions, unsafe names, and invalid snapshots", () => {
  const directory = temporaryDirectory();
  const workspacePath = path.join(directory, "workspace.json");
  const backupDirectory = path.join(directory, "backups");
  const current = { ...EMPTY_WORKSPACE, updatedAt: "current-revision", companies: [{ id: "current" }] };
  const corruptName = "workspace-corrupt.json";
  const malformedName = "workspace-malformed.json";
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.writeFileSync(workspacePath, JSON.stringify(current), "utf8");
  fs.writeFileSync(path.join(backupDirectory, corruptName), "{broken", "utf8");
  fs.writeFileSync(path.join(backupDirectory, malformedName), JSON.stringify({ updatedAt: "old" }), "utf8");
  const entriesBefore = fs.readdirSync(backupDirectory).sort();

  assert.throws(
    () => restoreWorkspaceBackup(workspacePath, backupDirectory, corruptName, { baseUpdatedAt: "stale-revision" }),
    (error) => error.code === "REVISION_CONFLICT" && error.currentRevision === "current-revision",
  );
  assert.throws(
    () => restoreWorkspaceBackup(workspacePath, backupDirectory, "../workspace-corrupt.json", { baseUpdatedAt: "current-revision" }),
    /不存在或文件名无效/,
  );
  assert.throws(
    () => restoreWorkspaceBackup(workspacePath, backupDirectory, corruptName, { baseUpdatedAt: "current-revision" }),
    /已损坏或数据格式无效/,
  );
  assert.throws(
    () => restoreWorkspaceBackup(workspacePath, backupDirectory, malformedName, { baseUpdatedAt: "current-revision" }),
    /已损坏或数据格式无效/,
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(workspacePath, "utf8")), current);
  assert.deepEqual(fs.readdirSync(backupDirectory).sort(), entriesBefore);
  fs.rmSync(directory, { recursive: true, force: true });
});
