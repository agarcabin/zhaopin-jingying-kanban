// 从企微表格《合作项目情况表》「合作项目表」sheet 快照生成「项目池」，
// 注入 project-data.json（project_pools / pool_meta 字段）。
// 用法：node scripts/build-boards.mjs [合作项目表快照路径]（默认 scripts/coop-sheet-snapshot.json）
// 口径（2026-11-19 用户确认）：项目池只展示「现在在做」的项目，
// 即快照中项目状态=进行中的项目；暂停项目不计入。
// 池内账号 = 该项目业务员列中非空的登记值，不再使用 BOSS 底表挂靠口径
// （旧口径会把已停做项目的历史岗位发布记录也算进来，如冯佳豪×天超电器）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const snapshotArg = process.argv[2] && process.argv[2] !== '--boss-legacy'
  ? resolve(process.argv[2])
  : join(here, 'coop-sheet-snapshot.json');
if (!existsSync(snapshotArg)) {
  throw new Error(`找不到合作项目表快照：${snapshotArg}`);
}

const snap = JSON.parse(readFileSync(snapshotArg, 'utf8'));
if (!snap.projects || !Array.isArray(snap.projects)) {
  throw new Error('快照缺少 projects 数组');
}

const nameMap = snap.pool_name_map || {};

// ---------- 生成项目池：只保留进行中项目 ----------
const project_pools = snap.projects
  .filter(p => (p.status || '').trim() === '进行中')
  .map(p => {
    const accounts = Object.entries(p.accounts || {})
      .map(([person, count]) => ({ person, count: Number(count) || 1 }))
      .sort((a, b) => b.count - a.count || a.person.localeCompare(b.person, 'zh'));
    return {
      client: nameMap[p.name] || p.name,
      project: p.name,
      status: p.status,
      city: p.city || '',
      accounts,
      account_count: accounts.length,
    };
  })
  .sort((a, b) => b.account_count - a.account_count || a.client.localeCompare(b.client, 'zh'));

// ---------- 注入 project-data.json ----------
const projPath = resolve(root, 'project-data.json');
const proj = JSON.parse(readFileSync(projPath, 'utf8'));
proj.project_pools = project_pools;
proj.pool_meta = {
  source: snap.meta?.source || '企微表格《合作项目情况表》合作项目表 sheet',
  sheet_url: snap.meta?.sheet_url || '',
  captured_at: snap.meta?.captured_at || '',
  captured_from: snap.meta?.captured_from || '',
  generated_at: new Date().toISOString(),
  note: '项目池=合作项目表中项目状态为「进行中」的项目（暂停不计入）；账号=该项目业务员列的非空登记值。数据来自企微表格《合作项目情况表》合作项目表 sheet。',
};
writeFileSync(projPath, JSON.stringify(proj));

const active = project_pools.length;
const withAccounts = project_pools.filter(p => p.account_count).length;
const totalAccounts = project_pools.reduce((s, p) => s + p.account_count, 0);
console.log(`已生成项目池：进行中 ${active} 个（其中 ${withAccounts} 个有账号在挂，${active - withAccounts} 个暂无账号）· 共 ${totalAccounts} 个账号登记 · 来源 ${snapshotArg}（表格数据 ${snap.meta?.captured_at || '?'})`);
