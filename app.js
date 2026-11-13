// 招聘经营看板 · 优化版
// 数据来源：正式版《创新招聘组数据》快照（scripts/build-data.mjs 生成 data.json）
// 口径与正式版一致：日报主表 + 邀约登记批次（invite_records）+ 客户分布。

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => (v === null || v === undefined || !Number.isFinite(Number(v))) ? '—' : Number(v).toLocaleString('zh-CN');
const pct = (a, b) => (b > 0 && Number.isFinite(a)) ? (100 * a / b).toFixed(1) + '%' : '—';
const short = d => d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—';
const pretty = d => d ? `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : '—';
const stamp = v => v ? String(v).slice(0, 16).replace('T', ' ').replaceAll('-', '/') : '—';

let data = null;
let PEOPLE = [];
const state = { mode: 'day', day: '', from: '', to: '', preset: 'latest' };
const charts = { client: null, people: null, trend: null };

const METRIC_NOTES = {
  '发布岗位数': '按当日后台记录行计；区间显示最近一个有日报日的报表值，不跨日求和。',
  'BOSS帐号': '按当日后台记录行计；区间显示最近一个有日报日的报表值。',
  '我看过': 'BOSS 后台「我看过候选人」记录，按记录日期统计。',
  '看过我': 'BOSS 后台「看过我的候选人」记录，按记录日期统计。',
  '我打招呼': '平台日上限 100，不作为努力程度排名依据；0 与缺数含义不同。',
  '牛人新招呼': 'BOSS 后台主动打招呼的牛人数，按记录日期统计。',
  '我沟通': 'BOSS 后台沟通记录，按记录日期统计。',
  '企微添加数': '按企微添加日期统计。',
  '收到简历数': '邮箱收到简历，自 rcv_start 起统计；之前为缺失。',
  '收获简历': 'BOSS 后台收获简历，按记录日期统计。',
  '发出邀约': '邀约登记批次按登记日期计（批次口径）。',
  '实际到面': '所选登记批次的当前状态，按登记日期归组。',
  '未到面': '所选登记批次的当前状态，按登记日期归组。',
  '待面试/待定': '到面状态未填写，不等同未来预约。',
  '面试通过': '已到面批次中结果为通过的记录，按登记日期归组。',
  '核实入职': '《普工招聘信息》「是否入职＝是」，按入职日期统计；试岗当天离职已排除。'
};

// ---------- 基础数据 ----------
function allDates() { return Object.keys(data.daily).sort(); }
function curDays() {
  if (state.mode === 'day') return data.daily[state.day] ? [state.day] : [];
  return allDates().filter(d => d >= state.from && d <= state.to);
}
function zeros() { return PEOPLE.map(() => 0); }
function inRangeRecords(extra) {
  return data.invite_records.filter(r =>
    (state.mode === 'day' ? r.d === state.day : (r.d >= state.from && r.d <= state.to)) &&
    (!extra || extra(r)));
}
// 与正式版 metricRow 相同的聚合规则
function metricRow(k, person = null) {
  const ds = curDays();
  if (!ds.length) return null;
  const pi = person ? PEOPLE.indexOf(person) : -1;
  if (k === '发布岗位数' || k === 'BOSS帐号') {
    for (let i = ds.length - 1; i >= 0; i--) {
      if (data.daily[ds[i]].has_report) {
        const v = data.daily[ds[i]].metrics[k] || zeros();
        return pi >= 0 ? v[pi] : v.reduce((a, b) => a + (b || 0), 0);
      }
    }
    return 0;
  }
  if (k === '收到简历数') {
    let any = false; const vals = zeros();
    ds.forEach(d => {
      const v = data.daily[d].metrics[k];
      if (v) { any = true; v.forEach((x, i) => { vals[i] += x || 0; }); }
    });
    if (!any) return null;
    return pi >= 0 ? vals[pi] : vals.reduce((a, b) => a + (b || 0), 0);
  }
  const vals = zeros();
  ds.forEach(d => {
    const v = data.daily[d].metrics[k] || zeros();
    v.forEach((x, i) => { vals[i] += x || 0; });
  });
  if (vals.every(x => !x) && ds.every(d => !data.daily[d].metrics[k])) return null;
  return pi >= 0 ? vals[pi] : vals.reduce((a, b) => a + (b || 0), 0);
}
// 批次统计（口径同正式版 batchStats）
function batchStats(filter = null) {
  const rs = inRangeRecords(filter);
  const b = { n: rs.length, arr: 0, noarr: 0, apend: 0, pass: 0, nopass: 0, ppend: 0, onb: 0, quit: 0, noonb: 0, obAll: 0, rv1: 0, rv1bad: 0, rv3: 0, rv7: 0, rs };
  rs.forEach(r => {
    if (r.a === '到面') b.arr++; else if (r.a === '未到面') b.noarr++; else b.apend++;
    if (r.a === '到面') {
      if (r.ps === '通过') b.pass++; else if (r.ps === '未通过') b.nopass++; else b.ppend++;
    }
    if (r.ob === '入职') b.onb++;
    else if (r.ob === '试岗离职') b.quit++;
    if (r.ps === '通过' && r.ob === '无') b.noonb++;
    if (r.ob !== '无') {
      b.obAll++;
      if (r.rv1) { b.rv1++; if (/放弃|离职/.test(r.rv1)) b.rv1bad++; }
      if (r.rv3) b.rv3++;
      if (r.rv7) b.rv7++;
    }
  });
  return b;
}
// 客户聚合（所选区间 · 可再按人过滤）
function clientsInRange(person = null) {
  const map = new Map();
  for (const r of inRangeRecords(person ? (x => x.p === person) : null)) {
    if (!r.proj) continue;
    if (!map.has(r.proj)) map.set(r.proj, { name: r.proj, n: 0, arr: 0, noarr: 0, apend: 0, pass: 0, nopass: 0, ppend: 0, onb: 0, quit: 0, jobs: new Set(), people: new Set(), rs: [] });
    const c = map.get(r.proj);
    c.n++; c.rs.push(r);
    if (r.a === '到面') c.arr++; else if (r.a === '未到面') c.noarr++; else c.apend++;
    if (r.a === '到面' && r.ps === '通过') c.pass++;
    if (r.ob === '入职') c.onb++;
    else if (r.ob === '试岗离职') c.quit++;
    if (r.pos) c.jobs.add(r.pos);
    c.people.add(r.p);
  }
  return [...map.values()].sort((a, b) => b.onb - a.onb || b.n - a.n || a.name.localeCompare(b.name, 'zh-CN'));
}
// 人员聚合（批次口径，来自邀约记录）
function personBatches(person) {
  return batchStats(r => r.p === person);
}
// 逐日趋势序列
function trendSeries(days) {
  const mk = keyFn => days.map(d => {
    const rs = data.invite_records.filter(r => r.d === d);
    return keyFn(rs);
  });
  const hireByDate = days.map(d => {
    const v = (data.daily[d]?.metrics['核实入职'] || zeros()).reduce((a, b) => a + (b || 0), 0);
    return v;
  });
  return {
    days,
    invite: mk(rs => rs.length),
    arr: mk(rs => rs.filter(r => r.a === '到面').length),
    pass: mk(rs => rs.filter(r => r.ps === '通过').length),
    hire: hireByDate
  };
}
function rangeLabel() {
  if (state.mode === 'day') return pretty(state.day);
  return `${pretty(state.from)} — ${pretty(state.to)}`;
}
function hasAnyData() {
  return curDays().length > 0 || inRangeRecords().length > 0;
}

// ---------- 渲染：头部与筛选 ----------
function setPreset(preset) {
  const latest = data.meta.latest_report;
  if (preset === 'latest') { state.mode = 'day'; state.day = latest; }
  else {
    state.mode = 'range';
    const to = latest;
    let from;
    if (preset === 'week') from = shift(to, -6);
    else if (preset === 'month') from = `${to.slice(0, 7)}-01`;
    else from = data.meta.range.from;
    if (from < data.meta.range.from) from = data.meta.range.from;
    state.from = from; state.to = to;
  }
  state.preset = preset;
  const url = new URL(location.href);
  url.searchParams.set('view', preset);
  if (preset === 'custom') { url.searchParams.set('start', state.from); url.searchParams.set('end', state.to); }
  else { url.searchParams.delete('start'); url.searchParams.delete('end'); }
  history.replaceState(null, '', url);
}
function shift(d, n) {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function renderHeader() {
  $('date-label').textContent = rangeLabel();
  document.querySelectorAll('[data-preset]').forEach(b => {
    const active = b.dataset.preset === state.preset;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('custom-range').hidden = state.preset !== 'custom';
  $('start-date').value = state.mode === 'range' ? state.from : state.day;
  $('end-date').value = state.mode === 'range' ? state.to : state.day;
  const days = curDays();
  const coveredDays = days.filter(d => data.daily[d]?.has_report).length;
  $('coverage-note').innerHTML = state.mode === 'day'
    ? `单日日报 · 团队 ${PEOPLE.length} 人 · 数据截至 <b>${short(data.meta.latest_report)}</b>`
    : `区间覆盖 ${days.length} 天（其中有日报 ${coveredDays} 天）· 团队 ${PEOPLE.length} 人 · 源表生成 ${stamp(data.meta.generated_at)}`;
  $('meta-status').innerHTML = `<span>日报截至 <strong>${esc(short(data.meta.latest_report))}</strong></span><span>生成 ${esc(stamp(data.meta.generated_at))}</span>`;
}

// ---------- 渲染：KPI ----------
function renderKPI(b) {
  const hireMain = metricRow('核实入职'); // 主表口径（按入职日期）
  const cards = [
    { cls: 'metric-card--hire', eyebrow: '入职结果 · 主表口径', label: '核实入职', value: hireMain, note: '按入职日期 · 试岗当天离职已排除', action: 'metric', metric: '核实入职' },
    { cls: 'metric-card--gold', eyebrow: '面试结果 · 批次口径', label: '面试通过', value: b.pass, note: `已反馈通过率 ${pct(b.pass, b.pass + b.nopass)}`, sub: `结果待补 ${b.ppend}`, action: 'stage', stage: 'passed' },
    { cls: '', eyebrow: '面试推进 · 批次口径', label: '实际到面', value: b.arr, note: `登记 ${b.n} 人 · 未到面 ${b.noarr}`, sub: `到面待补 ${b.apend}`, action: 'stage', stage: 'attended' },
    { cls: 'metric-card--steel', eyebrow: '邀约登记 · 批次口径', label: '发出邀约', value: b.n, note: '按登记日期统计', action: 'stage', stage: 'invite' }
  ];
  $('kpi-grid').innerHTML = cards.map(c => `
    <article class="metric-card ${c.cls}">
      <div class="metric-eyebrow">${c.eyebrow}</div>
      <div class="metric-label">${c.label}<button class="metric-action" data-action="${c.action}" data-stage="${c.stage || ''}" data-metric="${c.metric || ''}" aria-label="查看${c.label}明细">↗</button></div>
      <button class="metric-value" data-action="${c.action}" data-stage="${c.stage || ''}" data-metric="${c.metric || ''}" aria-label="${c.label} ${num(c.value)}，查看明细">${num(c.value)}<span class="metric-unit">人</span></button>
      <div class="metric-note">${c.note}</div>
      ${c.sub ? `<div class="metric-sub"><b>${c.sub}</b></div>` : ''}
    </article>`).join('');

  const strip = [
    { label: '触达曝光', value: (metricRow('我看过') || 0) + (metricRow('看过我') || 0), note: '我看过 + 看过我', metric: '触达曝光' },
    { label: '互动沟通', value: metricRow('我沟通'), note: 'BOSS 沟通记录', metric: '我沟通' },
    { label: '收获简历', value: metricRow('收获简历'), note: 'BOSS 后台', metric: '收获简历' },
    { label: '企微添加数', value: metricRow('企微添加数'), note: '按添加日期', metric: '企微添加数' }
  ];
  $('process-strip').innerHTML = strip.map(s => `
    <button class="process-item" data-action="metric" data-metric="${s.metric}">
      <span class="process-label">${s.label}</span>
      <strong class="process-value">${num(s.value)}</strong>
      <span class="process-note">${s.note}</span>
    </button>`).join('');
}

function renderCoverage(b) {
  const alerts = [];
  if (b.apend) alerts.push(`到面状态待补 ${b.apend} 条`);
  if (b.ppend) alerts.push(`面试结果待补 ${b.ppend} 条`);
  const gapDays = curDays().filter(d => data.daily[d]?.has_report && data.daily[d].covered < PEOPLE.length);
  if (gapDays.length > 3) {
    alerts.push(`共 ${gapDays.length} 天 BOSS 明细覆盖不全（${short(gapDays[0])} — ${short(gapDays.at(-1))} 之间，明细见各日）`);
  } else if (gapDays.length) {
    alerts.push(`${gapDays.map(d => `${short(d)} 覆盖 ${data.daily[d].covered}/${PEOPLE.length} 人`).join('；')} BOSS 明细覆盖不全`);
  }
  if (alerts.length) {
    $('coverage-alert').hidden = false;
    $('coverage-alert').innerHTML = `<span class="badge badge--amber">需要确认</span><span>${alerts.map(esc).join('；')}。日报中的 0 保留原值，不据此判断是否工作。</span>`;
  } else {
    $('coverage-alert').hidden = true;
    $('coverage-alert').innerHTML = '';
  }
}

// ---------- 渲染：漏斗 ----------
function funnelLayer({ name, v, w, bg, fg, rate, side, stage }) {
  const bar = stage
    ? `<button class="hg-bar" style="width:${w}%;background:${bg};color:${fg}" data-action="stage" data-stage="${stage}" aria-label="查看${name}明细"><span class="bn">${name} ${num(v)}</span>${rate ? `<span class="bp">${rate}</span>` : ''}</button>`
    : `<div class="hg-bar" style="width:${w}%;background:${bg};color:${fg}"><span class="bn">${name} ${num(v)}</span>${rate ? `<span class="bp">${rate}</span>` : ''}</div>`;
  return `<div class="hg-layer${stage === 'hired' ? ' hg-waist' : ''}">${bar}<div class="hg-side">${side}</div></div>`;
}
function renderFunnel(b) {
  const tot = k => metricRow(k) || 0;
  const reach = tot('我看过') + tot('看过我');
  const comm = tot('我沟通');
  const resume = tot('收获简历');
  const wec = tot('企微添加数');
  const hireMain = metricRow('核实入职');
  const layers = [
    { name: '触达曝光', v: reach, w: 100, bg: '#dbe9f8', fg: '#0c447c', rate: null, side: '我看过 + 看过我 · BOSS 平台记录', stage: 'reach' },
    { name: '互动沟通', v: comm, w: 86, bg: '#c5dcf2', fg: '#0c447c', rate: pct(comm, reach), side: '我沟通 · BOSS 记录', stage: 'comm' },
    { name: '收获简历', v: resume, w: 72, bg: '#a9cceb', fg: '#0c447c', rate: pct(resume, comm), side: 'BOSS 后台收获简历', stage: 'resume' },
    { name: '企微添加数', v: wec, w: 60, bg: '#93bde4', fg: '#ffffff', rate: pct(wec, resume), side: '企微添加 · 不分摊到项目', stage: 'wecom' },
    { name: '发出邀约', v: b.n, w: 48, bg: '#85b7e3', fg: '#ffffff', rate: pct(b.n, wec), side: '登记批次 · 跨源仅作量级参考', stage: 'invite' },
    { name: '实际到面', v: b.arr, w: 36, bg: '#5d9fd6', fg: '#ffffff', rate: pct(b.arr, b.n), side: `未到面 <b>${b.noarr}</b> · 到面待补 <b>${b.apend}</b>`, stage: 'attended' },
    { name: '面试通过', v: b.pass, w: 26, bg: '#3a84c4', fg: '#ffffff', rate: pct(b.pass, b.arr), side: `未通过 <b>${b.nopass}</b> · 结果待补 <b>${b.ppend}</b>`, stage: 'passed' }
  ];
  let html = layers.map(funnelLayer).join('');
  html += funnelLayer({
    name: '★入职', v: b.onb, w: 15, bg: '#0f6e56', fg: '#ffffff', rate: pct(b.onb, b.pass),
    side: `同批已入职（含试岗离职 ${b.quit}）· 主表口径核实入职 <b>${num(hireMain)}</b> 人（按入职日期）`, stage: 'hired'
  });
  html += `<div class="hg-gap"><div class="line"></div><div class="gt">入职后留存跟踪 · 回访覆盖同批入职者</div></div>`;
  const rvSide = (v, bad) => {
    let s = `已回访 <b>${v}</b>/入职 ${b.obAll}`;
    if (bad) s += ` · 异常 <b>${b.rv1bad}</b>（试岗放弃）`;
    if (b.obAll - v > 0) s += ` · 待补 <b>${b.obAll - v}</b>`;
    if (b.obAll === 0) s = '所选范围内暂无入职';
    return s;
  };
  html += funnelLayer({ name: '入职1天回访', v: b.rv1, w: 26, bg: '#d6f1e3', fg: '#0a5c44', side: rvSide(b.rv1, true), stage: 'rv1' });
  html += funnelLayer({ name: '3天回访', v: b.rv3, w: 38, bg: '#bfe8d4', fg: '#0a5c44', side: rvSide(b.rv3), stage: 'rv3' });
  html += funnelLayer({ name: '7天回访', v: b.rv7, w: 52, bg: '#a9dfc4', fg: '#0a5c44', side: rvSide(b.rv7), stage: 'rv7' });
  html += funnelLayer({ name: '入职30天', w: 68, side: '待建字段：邀约表新增「入职30天」', shell: true });
  html += funnelLayer({ name: '老带新', w: 84, side: '待建字段：邀约表新增「老带新」', shell: true });
  $('funnel').innerHTML = html;
  const fb = b.pass + b.nopass;
  $('funnel-note').innerHTML = `<b>口径</b>：触达→收获简历→企微→邀约各层来自不同来源（BOSS 后台 / 企微 / 邀约登记），非同一批候选人，各层转化率仅作量级参考；<b>邀约→到面→通过→入职为同一批登记人选的真实追踪，转化率可比</b>。已反馈面试通过率 ${pct(b.pass, fb)}（${b.pass}/${fb}，未反馈不计分母）。点击各层查看人员与候选人明细。`;
}

// ---------- 渲染：图表 ----------
function baseGrid() {
  return { left: 8, right: 24, top: 12, bottom: 8, containLabel: true };
}
function renderClientChart() {
  const el = $('client-chart');
  if (!charts.client) charts.client = echarts.init(el);
  const clients = clientsInRange();
  if (!clients.length) {
    charts.client.clear();
    el.innerHTML = '<div class="empty-state" style="padding-top:120px"><strong>暂无项目记录</strong><p>所选区间的邀约登记没有客户项目数据。</p></div>';
    return;
  }
  const names = clients.map(c => c.name).reverse();
  const other = clients.map(c => Math.max(0, c.n - c.arr - (c.n - c.arr))).reverse(); // 占位
  const segRemainder = clients.map(c => Math.max(0, c.n - c.arr - c.pass + c.arr - c.arr)).reverse();
  const remain = clients.map(c => Math.max(0, c.n - c.arr)).reverse();
  const passRest = clients.map(c => Math.max(0, c.arr - c.pass)).reverse();
  const onb = clients.map(c => c.onb).reverse();
  const passed = clients.map(c => c.pass).reverse();
  const arrived = clients.map(c => c.arr).reverse();
  const height = Math.max(240, clients.length * 30 + 60);
  el.style.height = height + 'px';
  charts.client.resize();
  charts.client.setOption({
    grid: { left: 8, right: 40, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#5a6b81' } },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: p => {
        const c = clients[clients.length - 1 - p.dataIndex];
        return `<b>${esc(c.name)}</b><br/>发出邀约 ${c.n} · 实际到面 ${c.arr}<br/>面试通过 ${c.pass} · 入职 ${c.onb}${c.quit ? ` · 试岗离职 ${c.quit}` : ''}<br/>到面率 ${pct(c.arr, c.n)} · 已反馈通过率 ${pct(c.pass, c.pass + c.nopass)}`;
      }
    },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef1f5' } }, axisLabel: { fontSize: 11, color: '#8a96a6' } },
    yAxis: {
      type: 'category', data: names,
      axisLabel: { fontSize: 12, color: '#172b43', width: 90, overflow: 'truncate' },
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#d4dae3' } }
    },
    series: [
      { name: '到面未通过', type: 'bar', stack: 't', itemStyle: { color: '#9cc3e8' }, data: passRest.map((v, i) => Math.max(0, arrived[i] - passed[i])), barMaxWidth: 16, cursor: 'pointer' },
      { name: '面试通过未入职', type: 'bar', stack: 't', itemStyle: { color: '#3a84c4' }, data: passed.map((v, i) => Math.max(0, v - onb[i])), barMaxWidth: 16, cursor: 'pointer' },
      { name: '核实入职', type: 'bar', stack: 't', itemStyle: { color: '#0f6e56' }, data: onb, barMaxWidth: 16, label: { show: true, position: 'right', fontSize: 11, color: '#0f6e56', fontWeight: 600, formatter: p => `${p.value}/${clients[clients.length - 1 - p.dataIndex].n}`, }, cursor: 'pointer' },
      { name: '未到面/待补', type: 'bar', stack: 't', itemStyle: { color: '#d7dee8' }, data: remain, barMaxWidth: 16, cursor: 'pointer' }
    ]
  }, true);
  charts.client.off('click');
  charts.client.on('click', p => {
    if (p.dataIndex >= 0) showDetail({ type: 'client', client: clients[clients.length - 1 - p.dataIndex].name });
  });
}
function renderPeopleChart() {
  const el = $('people-chart');
  if (!charts.people) charts.people = echarts.init(el);
  const stats = PEOPLE.map(p => ({ p, b: personBatches(p), hireMain: metricRow('核实入职', p) }))
    .sort((a, b) => (b.hireMain || 0) - (a.hireMain || 0) || b.b.arr - a.b.arr);
  const names = stats.map(s => s.p).reverse();
  const hire = stats.map(s => s.hireMain || 0).reverse();
  const pass = stats.map(s => s.b.pass).reverse();
  const arr = stats.map(s => s.b.arr).reverse();
  charts.people.setOption({
    grid: { left: 8, right: 40, top: 30, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#5a6b81' } },
    tooltip: {
      trigger: 'axis', confine: true,
      formatter: ps => {
        const s = stats[stats.length - 1 - ps[0].dataIndex];
        const fb = s.b.pass + s.b.nopass;
        return `<b>${esc(s.p)}</b><br/>核实入职（主表） ${s.hireMain || 0} · 批次入职 ${s.b.onb}<br/>面试通过 ${s.b.pass}${fb ? ` · 已反馈通过率 ${pct(s.b.pass, fb)}` : ''}<br/>实际到面 ${s.b.arr} · 发出邀约 ${s.b.n}<br/>企微添加 ${num(metricRow('企微添加数', s.p))} · 我沟通 ${num(metricRow('我沟通', s.p))}`;
      }
    },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef1f5' } }, axisLabel: { fontSize: 11, color: '#8a96a6' }, minInterval: 1 },
    yAxis: {
      type: 'category', data: names,
      axisLabel: { fontSize: 12, color: '#172b43' },
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#d4dae3' } }
    },
    series: [
      { name: '实际到面', type: 'bar', data: arr, itemStyle: { color: '#9cc3e8', borderRadius: [0, 4, 4, 0] }, barGap: '-100%', barMaxWidth: 12, zIndex: 1, cursor: 'pointer' },
      { name: '面试通过', type: 'bar', data: pass, itemStyle: { color: '#3a84c4', borderRadius: [0, 4, 4, 0] }, barGap: '-100%', barMaxWidth: 8, zIndex: 2, cursor: 'pointer' },
      { name: '核实入职', type: 'bar', data: hire, itemStyle: { color: '#0f6e56', borderRadius: [0, 4, 4, 0] }, barMaxWidth: 12, zIndex: 3, label: { show: true, position: 'right', fontSize: 11, fontWeight: 600, color: '#0f6e56' }, cursor: 'pointer' }
    ]
  }, true);
  charts.people.off('click');
  charts.people.on('click', p => {
    if (p.dataIndex >= 0) showDetail({ type: 'person', person: stats[stats.length - 1 - p.dataIndex].p });
  });
}
function renderTrend() {
  const el = $('trend-chart');
  if (!charts.trend) charts.trend = echarts.init(el);
  let days = curDays();
  if (days.length < 2) {
    const to = state.mode === 'day' ? state.day : state.to;
    days = allDates().filter(d => d <= to).slice(-14);
  }
  const s = trendSeries(days);
  $('trend-note').textContent = days.length
    ? `展示 ${short(days[0])} — ${short(days.at(-1))} 共 ${days.length} 天。邀约/到面/通过按登记批次，入职按入职日期（主表口径）。点击数据点查看当日明细。`
    : '所选区间暂无日报覆盖。';
  charts.trend.setOption({
    grid: baseGrid(),
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 3, textStyle: { fontSize: 11, color: '#5a6b81' } },
    tooltip: {
      trigger: 'axis', confine: true,
      formatter: ps => `<b>${pretty(ps[0].axisValue)}</b><br/>` + ps.map(p => `${p.marker}${p.seriesName} ${p.value ?? 0}`).join('<br/>')
    },
    xAxis: { type: 'category', data: s.days, axisLabel: { fontSize: 11, color: '#8a96a6', formatter: short }, boundaryGap: false, axisLine: { lineStyle: { color: '#d4dae3' } } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eef1f5' } }, axisLabel: { fontSize: 11, color: '#8a96a6' } },
    series: [
      { name: '发出邀约', type: 'line', data: s.invite, smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: '#3a84c4' }, itemStyle: { color: '#3a84c4' } },
      { name: '实际到面', type: 'line', data: s.arr, smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: '#5d9fd6' }, itemStyle: { color: '#5d9fd6' } },
      { name: '面试通过', type: 'line', data: s.pass, smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: '#d9a441' }, itemStyle: { color: '#d9a441' } },
      { name: '核实入职', type: 'line', data: s.hire, smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: '#0f6e56' }, itemStyle: { color: '#0f6e56' }, areaStyle: { color: 'rgba(15,110,86,.08)' } }
    ]
  }, true);
  charts.trend.off('click');
  charts.trend.on('click', p => {
    if (p.componentType === 'series') showDetail({ type: 'day', date: p.axisValue });
  });
}

// ---------- 渲染：待核事项 ----------
function renderAttention(b) {
  const items = [];
  if (b.apend) items.push(['到面状态待补', `${b.apend} 条登记为「待面试/待定」`, '不等同未来预约，需要业务员确认实际是否到面。', 'attended']);
  if (b.ppend) items.push(['面试结果待补', `${b.ppend} 条已到面但结果未填`, '尚未记录通过或不通过，影响已反馈通过率的分母。', 'passed']);
  if (b.noonb) items.push(['通过未入职', `${b.noonb} 条面试通过但暂无入职记录`, '可能仍在安排入职，也可能已放弃，需要跟进确认。', 'passed']);
  if (b.quit) items.push(['试岗离职', `${b.quit} 条试岗当天离职`, '不计入核实入职，单独列出。', 'hired']);
  if (b.obAll && b.obAll - b.rv1 > 0) items.push(['1天回访待补', `${b.obAll - b.rv1} 条入职未登记 1 天回访`, '回访覆盖同批入职者，缺失计入待补。', 'rv1']);
  const n = items.length;
  $('attention').innerHTML = `<details><summary><span>数据待核对</span><span class="badge ${n ? 'badge--amber' : 'badge--blue'}">${n ? `${n} 类待确认事项` : '查看口径说明'}</span><span class="subtle">${esc(rangeLabel())}</span></summary><div class="attention-content">${items.length ? `<ul class="detail-list">${items.map(([t, d, note, stage]) => `<li><b>${t}：${esc(d)}</b><span>${esc(note)} <button class="text-link" data-action="stage" data-stage="${stage}">查看明细 ↗</button></span></li>`).join('')}</ul>` : '<p class="source-note">所选区间未发现到面状态或面试结果待补项。记录是否完整仍以实际填报为准。</p>'}</div></details>`;
}

// ---------- 弹窗 ----------
function openDialog() {
  const dialog = $('detail-dialog');
  if (!dialog.open) {
    state.opener = document.activeElement;
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
  }
}
function closeDialog() {
  const dialog = $('detail-dialog');
  if (dialog.open) dialog.close();
}
function setDetail(kicker, title, subtitle, body) {
  $('detail-kicker').textContent = kicker;
  $('detail-title').textContent = title;
  $('detail-subtitle').textContent = subtitle;
  $('detail-body').innerHTML = body;
  openDialog();
}
function stat(labelText, value, note = '') {
  return `<div class="detail-stat"><span class="stat-label">${esc(labelText)}</span><strong class="stat-value">${num(value)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
}
function simpleTable(headers, rows) {
  return `<div class="detail-table-wrap"><table class="detail-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((x, i) => `<${i === 0 ? 'th scope="row"' : 'td'}>${x}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function personLink(name) {
  return `<button class="text-link" data-action="person" data-person="${esc(name)}">${esc(name)} ↗</button>`;
}
function clientLink(name) {
  return `<button class="text-link" data-action="client" data-client="${esc(name)}">${esc(name)} ↗</button>`;
}
function statusBlock(title, parts, sum) {
  const content = parts.map(p => `<span class="legend-item"><span class="dot" style="background:${p.color}"></span>${p.label}<strong>${num(p.value)}</strong></span>`).join('');
  const track = sum ? parts.filter(p => p.value > 0).map(p => `<span class="status-segment" style="width:${p.value / sum * 100}%;background:${p.color}"></span>`).join('') : '<span class="status-segment status-segment--empty" style="width:100%"></span>';
  return `<div class="status-row"><div class="status-title"><strong>${title}</strong><span class="muted">共 ${num(sum)} 人</span></div><div class="status-track" aria-hidden="true">${track}</div><div class="legend">${content}</div></div>`;
}
function recordsTable(rs, opts = {}) {
  if (!rs.length) return '<p class="source-note">所选范围内暂无候选人记录。</p>';
  return `<div class="detail-table-wrap"><table class="detail-table"><thead><tr>${['登记日', '候选人', '岗位', '项目', '专员', '到面状态', '面试结果', '入职', '实际面试日'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rs.map(r => `<tr><th scope="row">${short(r.d)}</th><td>${esc(r.cand)}</td><td>${esc(r.pos)}</td><td>${opts.noClientLink ? esc(r.proj) : clientLink(r.proj)}</td><td>${personLink(r.p)}</td><td>${r.a === '到面' ? '<span class="badge badge--teal">到面</span>' : r.a === '未到面' ? '<span class="badge badge--gray">未到面</span>' : '<span class="badge badge--amber">待补</span>'}</td><td>${r.ps === '通过' ? '<span class="badge badge--teal">通过</span>' : r.ps === '未通过' ? '<span class="badge badge--gray">未通过</span>' : '<span class="badge badge--amber">待补</span>'}</td><td>${r.ob === '入职' ? '<span class="badge badge--teal">入职</span>' : r.ob === '试岗离职' ? '<span class="badge badge--amber">试岗离职</span>' : '—'}</td><td>${r.iv ? short(r.iv) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function statusBadge(r) { return r; }

function showDetail(d) {
  const subtitle = rangeLabel();
  if (d.type === 'metric') {
    const k = d.metric;
    const person = d.person || null;
    const v = metricRow(k, person);
    const title = person ? `${person} · ${k}` : k;
    const kicker = person ? '人员 · 指标详情' : '指标详情';
    let body = `<div class="detail-grid">${stat(k, v, METRIC_NOTES[k] || '')}</div>`;
    if (!person) {
      body += `<h3>人员构成</h3>${simpleTable(['招聘专员', '数量'], PEOPLE.map(p => [personLink(p), num(metricRow(k, p))]))}`;
    }
    const days = curDays();
    if (days.length > 1) {
      body += `<h3>按日查看</h3>${simpleTable(['日期', '数量'], days.map(dd => [pretty(dd), num(metricRow(k) === null ? null : (data.daily[dd].metrics[k] || zeros()).reduce((a, b) => a + (b || 0), 0))]))}`;
    }
    body += `<div class="info-callout"><strong>统计口径</strong><p>${esc(METRIC_NOTES[k] || '')}</p></div>`;
    setDetail(kicker, title, subtitle, body);
  } else if (d.type === 'stage') {
    renderStage(d.stage, subtitle);
  } else if (d.type === 'person') {
    renderPerson(d.person, subtitle);
  } else if (d.type === 'client') {
    renderClient(d.client, subtitle);
  } else if (d.type === 'day') {
    renderDay(d.date);
  } else if (d.type === 'methodology') {
    renderMethodology();
  }
}

function renderStage(stage, subtitle) {
  const b = batchStats();
  const meta = {
    invite: { title: '发出邀约', kicker: '批次详情' },
    attended: { title: '实际到面', kicker: '批次详情' },
    passed: { title: '面试通过', kicker: '批次详情' },
    hired: { title: '入职', kicker: '批次详情' },
    reach: { title: '触达曝光', kicker: '平台指标' },
    comm: { title: '互动沟通', kicker: '平台指标' },
    resume: { title: '收获简历', kicker: '平台指标' },
    wecom: { title: '企微添加数', kicker: '平台指标' },
    rv1: { title: '入职 1 天回访', kicker: '留存跟踪' },
    rv3: { title: '入职 3 天回访', kicker: '留存跟踪' },
    rv7: { title: '入职 7 天回访', kicker: '留存跟踪' }
  }[stage] || { title: stage, kicker: '详情' };

  if (['reach', 'comm', 'resume', 'wecom'].includes(stage)) {
    const key = { reach: null, comm: '我沟通', resume: '收获简历', wecom: '企微添加数' }[stage];
    if (stage === 'reach') {
      let body = `<div class="detail-grid">${stat('触达曝光', (metricRow('我看过') || 0) + (metricRow('看过我') || 0), '我看过 + 看过我')}</div>`;
      body += `<h3>人员构成</h3>${simpleTable(['招聘专员', '我看过', '看过我', '合计'], PEOPLE.map(p => [personLink(p), num(metricRow('我看过', p)), num(metricRow('看过我', p)), num((metricRow('我看过', p) || 0) + (metricRow('看过我', p) || 0))]))}`;
      setDetail(meta.kicker, meta.title, subtitle, body);
      return;
    }
    showDetail({ type: 'metric', metric: key });
    return;
  }

  if (stage === 'rv1' || stage === 'rv3' || stage === 'rv7') {
    const key = stage;
    const rs = inRangeRecords(r => r.ob !== '无' && r[key]);
    let body = `<div class="detail-grid">${stat(meta.title, rs.length, `入职 ${b.obAll} 人中已回访`)}${stat('入职总数（批次）', b.obAll, '含试岗离职')}</div>`;
    if (b.obAll - rs.length > 0) body += `<div class="info-callout"><strong>待补</strong><p>另有 ${b.obAll - rs.length} 条入职尚未登记该节点回访。</p></div>`;
    body += `<h3>回访明细</h3>${simpleTable(['候选人', '项目', '专员', '入职状态', '1天', '3天', '7天'], inRangeRecords(r => r.ob !== '无').map(r => [esc(r.cand), clientLink(r.proj), personLink(r.p), r.ob === '入职' ? '入职' : '试岗离职', esc(r.rv1 || '待补'), esc(r.rv3 || '待补'), esc(r.rv7 || '待补')]))}`;
    setDetail(meta.kicker, meta.title, subtitle, body);
    return;
  }

  // 批次阶段：invite / attended / passed / hired
  const filter = { invite: null, attended: r => r.a === '到面', passed: r => r.a === '到面' && r.ps === '通过', hired: r => r.ob === '入职' }[stage];
  const rs = inRangeRecords(filter || undefined);
  let body = '';
  if (stage === 'invite') {
    body += `<div class="detail-grid">${stat('发出邀约', b.n, '按登记日期')}${stat('已到面', b.arr)}${stat('未到面', b.noarr)}${stat('到面待补', b.apend)}</div>`;
    body += statusBlock('邀约后的到面状态', [
      { label: '已到面', value: b.arr, color: '#3a84c4' },
      { label: '未到面', value: b.noarr, color: '#d7dee8' },
      { label: '状态待补', value: b.apend, color: '#d9a441' }
    ], b.n);
  } else if (stage === 'attended') {
    body += `<div class="detail-grid">${stat('实际到面', b.arr, '同一登记批次')}${stat('面试通过', b.pass)}${stat('未通过', b.nopass)}${stat('结果待补', b.ppend)}</div>`;
    body += statusBlock('已到面的面试结果', [
      { label: '通过', value: b.pass, color: '#0f6e56' },
      { label: '未通过', value: b.nopass, color: '#d7dee8' },
      { label: '结果待补', value: b.ppend, color: '#d9a441' }
    ], b.arr);
    const fb = b.pass + b.nopass;
    body += `<div class="info-callout"><strong>已反馈面试通过率</strong><p>${fb ? `${b.pass} ÷ ${fb} ＝ ${pct(b.pass, fb)}。分母仅含已到面且结果明确为通过/未通过的记录。` : '暂无已反馈样本。'}</p></div>`;
  } else if (stage === 'passed') {
    body += `<div class="detail-grid">${stat('面试通过', b.pass)}${stat('其中已入职', b.pass - Math.max(0, b.noonb) > 0 ? b.pass - b.noonb : b.pass - b.noonb)}${stat('通过未入职', b.noonb)}${stat('结果待补', b.ppend)}</div>`;
    body += `<div class="info-callout"><strong>口径说明</strong><p>通过按登记批次的最新状态；入职按批次当前记录。通过后尚未登记入职的 ${b.noonb} 条需要跟进确认。</p></div>`;
  } else if (stage === 'hired') {
    const hireMain = metricRow('核实入职');
    body += `<div class="detail-grid">${stat('批次入职', b.onb, '同批登记已入职')}${stat('试岗离职', b.quit, '不计入核实入职')}${stat('核实入职（主表）', hireMain, '按入职日期统计')}</div>`;
    body += `<div class="info-callout"><strong>两种口径的区别</strong><p>批次入职：所选区间「登记的人」截至本次更新已入职的人数，后续入职可发生在区间结束之后；主表口径核实入职：按「入职日期」落在所选区间的人数。两者日期含义不同，不能直接相除。</p></div>`;
    body += `<h3>回访覆盖</h3>${simpleTable(['回访节点', '已回访', '待补', '异常'], [['1天', b.rv1, b.obAll - b.rv1, b.rv1bad], ['3天', b.rv3, b.obAll - b.rv3, '—'], ['7天', b.rv7, b.obAll - b.rv7, '—']].map(row => row.map(x => num(x))))}`;
  }
  body += `<h3>人员构成</h3>${simpleTable(['招聘专员', '人数'], PEOPLE.map(p => {
    const pb = personBatches(p);
    const v = { invite: pb.n, attended: pb.arr, passed: pb.pass, hired: pb.onb }[stage];
    return [personLink(p), num(v)];
  }).filter(row => row[1] !== '0').concat([]))}`;
  if (stage !== 'invite') body = body.replace('<h3>候选人明细</h3>', '');
  body += `<h3>候选人明细</h3>${recordsTable(rs)}`;
  setDetail(meta.kicker, meta.title, subtitle, body);
}

function renderPerson(person, subtitle) {
  if (!PEOPLE.includes(person)) return;
  const pb = personBatches(person);
  const fb = pb.pass + pb.nopass;
  const clients = clientsInRange(person);
  let body = `<div class="detail-grid">
    ${stat('核实入职（主表）', metricRow('核实入职', person), '按入职日期')}
    ${stat('批次入职', pb.onb, '同批登记已入职')}
    ${stat('面试通过', pb.pass, fb ? `已反馈通过率 ${pct(pb.pass, fb)}` : '')}
    ${stat('实际到面', pb.arr, `邀约 ${pb.n}`)}
    ${stat('我沟通', metricRow('我沟通', person))}
    ${stat('企微添加', metricRow('企微添加数', person))}
  </div>`;
  body += statusBlock('邀约推进', [
    { label: '已到面', value: pb.arr, color: '#3a84c4' },
    { label: '未到面', value: pb.noarr, color: '#d7dee8' },
    { label: '待补', value: pb.apend, color: '#d9a441' }
  ], pb.n);
  if (pb.apend || pb.ppend) body += `<div class="info-callout"><strong>需要确认</strong><p>${pb.apend ? `到面状态待补 ${pb.apend} 条；` : ''}${pb.ppend ? `面试结果待补 ${pb.ppend} 条。` : ''}</p></div>`;
  body += `<h3>参与项目</h3>${clients.length ? simpleTable(['项目', '邀约', '到面', '通过', '入职', '岗位'], clients.map(c => [clientLink(c.name), c.n, c.arr, c.pass, c.onb, esc([...c.jobs].slice(0, 3).join('、'))])) : '<p class="source-note">所选区间该人员没有邀约登记记录。</p>'}`;
  body += `<h3>完整日报指标</h3>${simpleTable(['指标', '数量', '说明'], Object.keys(METRIC_NOTES).map(k => [esc(k), num(metricRow(k, person)), esc(METRIC_NOTES[k])]))}`;
  body += `<h3>候选人明细</h3>${recordsTable(inRangeRecords(r => r.p === person), { noClientLink: false })}`;
  setDetail('人员业绩', person, subtitle, body);
}

function renderClient(client, subtitle) {
  const c = clientsInRange().find(x => x.name === client);
  if (!c) { setDetail('项目详情', client, subtitle, '<p class="source-note">该项目在当前所选区间没有邀约登记记录。</p>'); return; }
  const fb = c.pass + c.nopass;
  let body = `<div class="detail-grid">
    ${stat('发出邀约', c.n, '登记批次')}
    ${stat('实际到面', c.arr, `到面率 ${pct(c.arr, c.n)}`)}
    ${stat('面试通过', c.pass, fb ? `已反馈通过率 ${pct(c.pass, fb)}` : '')}
    ${stat('入职', c.onb, c.quit ? `试岗离职 ${c.quit}` : '')}
  </div>`;
  body += statusBlock('邀约推进', [
    { label: '已到面', value: c.arr, color: '#3a84c4' },
    { label: '未到面', value: c.noarr, color: '#d7dee8' },
    { label: '待补', value: c.apend, color: '#d9a441' }
  ], c.n);
  body += `<h3>参与人员</h3>${simpleTable(['招聘专员', '邀约', '到面', '通过', '入职'], [...c.people].map(p => {
    const pc = clientsInRange(p).find(x => x.name === client) || { n: 0, arr: 0, pass: 0, onb: 0 };
    return [personLink(p), pc.n, pc.arr, pc.pass, pc.onb];
  }))}`;
  body += `<h3>涉及岗位</h3><div class="job-tags">${[...c.jobs].map(j => `<span class="badge badge--blue">${esc(j)}</span>`).join('') || '<span class="muted">无</span>'}</div>`;
  body += `<h3>候选人明细</h3>${recordsTable(c.rs)}`;
  body += `<div class="info-callout"><strong>口径说明</strong><p>该项目指标全部来自邀约登记批次（按登记日期）。企微添加无可靠项目字段，不分摊到项目；平台沟通与简历为个人过程量，不在项目维度拆分。</p></div>`;
  setDetail('项目详情', client, subtitle, body);
}

function renderDay(date) {
  const day = data.daily[date];
  if (!day) { setDetail('当日明细', pretty(date), '', '<p class="source-note">该日期没有日报数据。</p>'); return; }
  const rs = data.invite_records.filter(r => r.d === date);
  const arr = rs.filter(r => r.a === '到面').length;
  const pass = rs.filter(r => r.ps === '通过').length;
  const hireMain = (day.metrics['核实入职'] || zeros()).reduce((a, b) => a + (b || 0), 0);
  let body = `<div class="detail-grid">
    ${stat('发出邀约', rs.length, '当日登记')}
    ${stat('实际到面', arr)}
    ${stat('面试通过', pass)}
    ${stat('核实入职', hireMain, '按入职日期')}
    ${stat('我沟通', (day.metrics['我沟通'] || zeros()).reduce((a, b) => a + (b || 0), 0))}
    ${stat('企微添加', (day.metrics['企微添加数'] || zeros()).reduce((a, b) => a + (b || 0), 0))}
  </div>`;
  if (day.has_report && day.covered < PEOPLE.length) {
    body += `<div class="info-callout"><strong>来源覆盖提示</strong><p>当日 BOSS 明细覆盖 ${day.covered}/${PEOPLE.length} 人，未覆盖人员的平台指标可能偏低。</p></div>`;
  }
  body += `<h3>人员日报</h3>${simpleTable(['招聘专员', '我沟通', '企微添加', '发出邀约', '实际到面', '面试通过', '核实入职'], PEOPLE.map((p, i) => {
    const get = k => (day.metrics[k] || zeros())[i];
    const pb = personBatches(p);
    const dayRs = data.invite_records.filter(r => r.d === date && r.p === p);
    return [personLink(p), num(get('我沟通')), num(get('企微添加数')), dayRs.length, dayRs.filter(r => r.a === '到面').length, dayRs.filter(r => r.ps === '通过').length, num(get('核实入职'))];
  }))}`;
  body += day.positions?.length ? `<h3>当日岗位</h3><div class="job-tags">${day.positions.map(j => `<span class="badge badge--blue">${esc(j)}</span>`).join('')}</div>` : '';
  body += `<h3>当日登记的候选人</h3>${recordsTable(rs)}`;
  setDetail('当日明细', pretty(date), `覆盖 ${day.covered}/${PEOPLE.length} 人 · ${day.has_report ? '有日报' : '无正式日报'}`, body);
}

function renderMethodology() {
  let body = `<div class="info-callout"><strong>一份看板，两类业务日期</strong><p>到面、通过、邀约按邀约表的「登记日期」统计，状态使用当前源文件的最新记录；核实入职按「入职日期」统计。两者不能直接相除为同批次转化率。</p></div>`;
  body += `<h3>指标定义</h3>${simpleTable(['指标', '说明'], Object.keys(METRIC_NOTES).map(k => [esc(k), esc(METRIC_NOTES[k])]))}`;
  body += `<h3>本版数据范围</h3><ul class="detail-list">
    <li><b>日报：${data.meta.range.from} 至 ${data.meta.range.to}</b><span>源表生成于 ${stamp(data.meta.generated_at)}，团队 ${PEOPLE.length} 人。</span></li>
    <li><b>漏斗上半场为量级参考</b><span>触达、沟通、简历、企微来自不同来源，非同一批候选人。</span></li>
    <li><b>候选人明细来自邀约登记批次</b><span>包含姓名、岗位、项目、到面/结果/入职状态与回访节点。</span></li>
    <li><b>更新方式</b><span>正式版快照更新后，运行 scripts/build-data.mjs 重新生成本站 data.json。</span></li>
  </ul>`;
  body += `<h3>来源</h3><p>${esc(data.meta.sourceWorkbook || '企业微信在线表格《创新招聘组数据》')}</p>`;
  setDetail('统计口径', '指标与数据说明', `日报截至 ${pretty(data.meta.latest_report)}`, body);
}

// ---------- 总渲染 ----------
function render() {
  const b = batchStats();
  renderHeader();
  renderKPI(b);
  renderCoverage(b);
  renderFunnel(b);
  renderClientChart();
  renderPeopleChart();
  renderTrend();
  renderAttention(b);
  $('source-footer').innerHTML = `<span>来源：企业微信在线表格《创新招聘组数据》快照（与正式版看板同源）</span><span>源表生成 ${stamp(data.meta.generated_at)}</span><span>共 ${data.invite_records.length} 条邀约记录 · ${PEOPLE.length} 名招聘专员</span>`;
}

// ---------- 交互 ----------
function action(target) {
  const a = target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'person') showDetail({ type: 'person', person: a.dataset.person });
  else if (act === 'client') showDetail({ type: 'client', client: a.dataset.client });
  else if (act === 'metric') showDetail({ type: 'metric', metric: a.dataset.metric });
  else if (act === 'stage') showDetail({ type: 'stage', stage: a.dataset.stage });
  else if (act === 'methodology') showDetail({ type: 'methodology' });
}
function bind() {
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.preset === 'custom') { $('custom-range').hidden = false; $('start-date').focus(); return; }
    setPreset(b.dataset.preset);
    render();
  }));
  $('apply-range').addEventListener('click', () => {
    const s = $('start-date').value, e = $('end-date').value;
    if (!s || !e || s > e) { $('range-error').textContent = '请选择有效日期，开始日期不能晚于结束日期。'; return; }
    $('range-error').textContent = '';
    state.mode = 'range'; state.from = s; state.to = e; state.preset = 'custom';
    const url = new URL(location.href);
    url.searchParams.set('view', 'custom');
    url.searchParams.set('start', s); url.searchParams.set('end', e);
    history.replaceState(null, '', url);
    render();
  });
  $('open-methodology').addEventListener('click', () => showDetail({ type: 'methodology' }));
  document.addEventListener('click', e => action(e.target));
  $('close-detail').addEventListener('click', closeDialog);
  $('detail-dialog').addEventListener('click', e => { if (e.target === $('detail-dialog')) closeDialog(); });
  $('detail-dialog').addEventListener('close', () => { document.documentElement.style.overflow = ''; state.opener?.focus?.(); });
  let timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { Object.values(charts).forEach(c => c && c.resize()); }, 150);
  });
}

async function init() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('数据文件暂不可用');
    data = await res.json();
    if (!data.meta?.people?.length || !data.daily) throw new Error('数据文件不完整');
    PEOPLE = data.meta.people;
    const query = new URLSearchParams(location.search);
    const view = query.get('view');
    const start = query.get('start'), end = query.get('end');
    if (view === 'custom' && start && end && start <= end) {
      state.mode = 'range'; state.from = start; state.to = end; state.preset = 'custom';
    } else if (['latest', 'week', 'month', 'all'].includes(view)) {
      setPreset(view);
    } else {
      setPreset('latest');
    }
    $('load-state').hidden = true;
    $('app-shell').hidden = false;
    bind();
    render();
  } catch (error) {
    $('load-state').hidden = false;
    $('app-shell').hidden = true;
    $('load-state').innerHTML = `<div class="empty-state"><strong>看板暂时无法加载</strong><p>请稍后刷新页面。已发布的数据不会因此被修改。</p><button class="btn btn-primary" onclick="location.reload()">重新加载</button></div>`;
    console.error('Dashboard initialization failed', error);
  }
}
init();
