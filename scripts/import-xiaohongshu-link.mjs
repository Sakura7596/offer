import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [positionId, rawUrl] = process.argv.slice(2);
const dataDir =
  process.env.OFFER_DATA_DIR ||
  path.join(os.homedir(), "Library", "Application Support", "offer", "data");
const intelligencePath = path.join(dataDir, "intelligence.json");

if (!positionId || !rawUrl) {
  throw new Error(
    "Usage: node scripts/import-xiaohongshu-link.mjs <position-id> <url>",
  );
}

const parsed = new URL(rawUrl);
if (
  parsed.hostname !== "www.xiaohongshu.com" ||
  !parsed.pathname.startsWith("/explore/")
) {
  throw new Error("Expected a www.xiaohongshu.com/explore link");
}

const noteId = parsed.pathname.split("/").filter(Boolean).at(-1);
if (!noteId) throw new Error("Missing Xiaohongshu note id");

const intelligence = JSON.parse(
  fs.readFileSync(intelligencePath, "utf8"),
);
const brief = intelligence.roleBriefs?.[positionId];
if (!brief) throw new Error(`Unknown position id: ${positionId}`);

const now = new Date().toISOString();
const coverage = (brief.researchCoverage ||= {});
const providedLinks = (coverage.xiaohongshuProvidedLinks ||= []);
let stored = false;

if (!providedLinks.some((item) => item.noteId === noteId)) {
  providedLinks.push({
    noteId,
    url: `${parsed.origin}${parsed.pathname}`,
    originalUrl: rawUrl,
    providedAt: now,
    status: "access_blocked",
    title: null,
    matchedCandidateId: null,
  });
  stored = true;
}

brief.updatedAt = now;
intelligence.generatedAt = now;

const tempPath = path.join(
  path.dirname(intelligencePath),
  `.intelligence-${process.pid}.tmp`,
);
fs.writeFileSync(
  tempPath,
  `${JSON.stringify(intelligence, null, 2)}\n`,
  { mode: 0o600 },
);
JSON.parse(fs.readFileSync(tempPath, "utf8"));
fs.renameSync(tempPath, intelligencePath);

console.log(
  JSON.stringify({
    stored,
    noteId,
    total: providedLinks.length,
  }),
);
