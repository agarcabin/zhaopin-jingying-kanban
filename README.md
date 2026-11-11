# 创新招聘组 · 综合工作台

一个静态站点，三个入口：

| 入口 | 内容 | 数据来源 |
|---|---|---|
| `#dashboard` 招聘过程看板 | 招聘漏斗、15 项过程指标、部门日报、批次追踪、客户分布、趋势图 | 企业微信在线表格《创新招聘组数据》实时快照 |
| `#tasks` AI 开发进度 | 任务月历 + 项目看板 + 搜索 + 详情 | `data/ai-development.json`（只读快照） |
| `#positions` 岗位信息收集 | 企业招聘采集清单 + 团队数据文档卡片 | `positions.js` 内的文档链接 |

## 数据口径

看板与「26年X月日报」**同一套计算逻辑**（`report_merged.collect`）：

- 发布岗位数 = BOSS 数据表行数；BOSS 帐号按固定规则（柴海良 3、柯汪珽 1、金凯健 1，其余 2）
- 企微添加数 = 客户明细逐条计数，缺日回退看板日表、再回退线上表行数，来源逐日标注
- 邀约 / 到面 / 通过 / 核实入职 = 《普工招聘信息》同一份登记表，按行日期归日
- 核实入职以「是否入职＝是」即计，后续离职不追溯；试岗离职单列
- 收到简历 = 邮箱实收，2026-10-13 起统计，此前显示「—」

## 目录结构

```
index.html              三入口外壳（导航 + 同站 iframe + 加载检测）
embeds/dashboard.html   实时看板（数据由构建脚本注入）
embeds/source.json      数据来源、生成时间、图表库哈希
task-preview.js|css     任务月历与项目看板
positions.js|css        文档卡片
data/ai-development.json 任务快照（只读）
assets/echarts.min.js   ECharts 5.5.0（本地，离线可用）
```

## 更新数据

站点由 `recruit-daily-pipeline` 技能的脚本生成，**不要手工改** `embeds/dashboard.html`
和 `embeds/source.json`，下次构建会被覆盖。

```bash
# 1) 从企微表格拉最新快照
python ~/.workbuddy/skills/recruit-daily-pipeline/scripts/wecom_snapshot.py \
  --date 2026-11-11 --out-dir ~/.workbuddy/skills/recruit-daily-pipeline/outputs/wecom_snapshot

# 2) 重建站点（含看板 + source.json + 静态骨架）
python ~/.workbuddy/skills/recruit-daily-pipeline/scripts/build_workbench.py \
  --site-dir "<本目录>" --snapshot <快照目录> --to 2026-11-11

# 3) 校验后提交
python ~/.workbuddy/skills/recruitment-workbench/scripts/check_site.py "<本目录>"
```

## 本地预览

任务快照走 `fetch`，必须用 HTTP，不能 `file://`：

```bash
python -m http.server 4173 --bind 127.0.0.1
# 打开 http://127.0.0.1:4173/
```

## 部署

GitHub Pages：仓库 Settings → Pages → Source 选 `main` / `(root)`。
站点已含 `.nojekyll`，无需构建步骤，推送即发布。

## 说明

- 任务与资料是只读副本，链接的访问权限由原文档的分享设置决定。
- 候选人姓名保留原文，未脱敏。
- 站点不含任何账号凭据。
