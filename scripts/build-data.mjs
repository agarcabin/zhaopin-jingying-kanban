// 从正式版看板仓库提取 __DATA__ 快照，生成本项目使用的 data.json。
// 用法：node scripts/build-data.mjs [正式版仓库路径]
// 默认路径为同级目录 ../recruitment-workspace。只读取正式版文件，不做任何修改。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = resolve(here, '..', process.argv[2] || '../recruitment-workspace');
const html = readFileSync(resolve(siteDir, 'embeds/dashboard.html'), 'utf8');

const marker = '__DATA__ =';
const idx = html.indexOf(marker);
if (idx < 0) throw new Error('未在 dashboard.html 中找到 __DATA__');
const start = html.indexOf('{', idx);

// 括号配平提取 JSON（考虑字符串与转义）
let depth = 0, inStr = false, esc = false, end = -1;
for (let p = start; p < html.length; p++) {
  const c = html[p];
  if (esc) { esc = false; continue; }
  if (c === '\\') { esc = true; continue; }
  if (inStr) { if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === '{') depth++;
  if (c === '}') { depth--; if (depth === 0) { end = p + 1; break; } }
}
if (end < 0) throw new Error('__DATA__ JSON 提取失败');

const raw = JSON.parse(html.slice(start, end));
if (!raw.meta?.people?.length || !raw.daily || !Array.isArray(raw.invite_records)) {
  throw new Error('快照结构不完整，请确认正式版已重建为最新数据');
}

const data = {
  schemaVersion: '2.0.0',
  extractedFrom: resolve(siteDir),
  meta: raw.meta,
  daily: raw.daily,
  invite_records: raw.invite_records,
  clients_stat: raw.clients_stat
};

const out = resolve(here, '..', 'data.json');
writeFileSync(out, JSON.stringify(data));
console.log(`已生成 ${out}`);
console.log(`数据区间 ${raw.meta.range.from} ~ ${raw.meta.range.to} · ${Object.keys(raw.daily).length} 天 · ${raw.meta.people.length} 人 · ${raw.invite_records.length} 条邀约记录`);
