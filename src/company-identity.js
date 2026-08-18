const COMPANY_SUFFIXES = [
  "股份有限公司",
  "有限责任公司",
  "有限公司",
  "信息技术",
  "电子商务",
  "集团",
  "控股",
  "科技",
  "网络",
  "公司",
];

export function normalizeCompanyName(value) {
  let normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[（(](?:中国|china)[)）]/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

  let changed = true;
  while (changed && normalized) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      if (normalized.length > suffix.length && normalized.endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return normalized;
}

export function findCompanyPreset(value, presets) {
  const normalized = normalizeCompanyName(value);
  return presets.find(([, aliases]) =>
    aliases.some((alias) => normalizeCompanyName(alias) === normalized),
  );
}
