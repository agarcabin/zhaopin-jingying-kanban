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
const state = { mode: 'range', day: '', from: '', to: '', preset: 'all' };
const charts = { client: null, people: null, trend: null, ai: null, proj: null };

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
    { name: '触达曝光', v: reach, w: 100, bg: '#e6eaee', fg: '#33526b', rate: null, side: '我看过 + 看过我 · BOSS 平台记录', stage: 'reach' },
    { name: '互动沟通', v: comm, w: 86, bg: '#ced8e0', fg: '#33526b', rate: pct(comm, reach), side: '我沟通 · BOSS 记录', stage: 'comm' },
    { name: '收获简历', v: resume, w: 72, bg: '#b2c1cd', fg: '#33526b', rate: pct(resume, comm), side: 'BOSS 后台收获简历', stage: 'resume' },
    { name: '企微添加数', v: wec, w: 60, bg: '#8ba4b6', fg: '#ffffff', rate: pct(wec, resume), side: '企微添加 · 不分摊到项目', stage: 'wecom' },
    { name: '发出邀约', v: b.n, w: 48, bg: '#6d8ea8', fg: '#ffffff', rate: pct(b.n, wec), side: '登记批次 · 跨源仅作量级参考', stage: 'invite' },
    { name: '实际到面', v: b.arr, w: 36, bg: '#4f7391', fg: '#ffffff', rate: pct(b.arr, b.n), side: `未到面 <b>${b.noarr}</b> · 到面待补 <b>${b.apend}</b>`, stage: 'attended' },
    { name: '面试通过', v: b.pass, w: 26, bg: '#33526b', fg: '#ffffff', rate: pct(b.pass, b.arr), side: `未通过 <b>${b.nopass}</b> · 结果待补 <b>${b.ppend}</b>`, stage: 'passed' }
  ];
  let html = layers.map(funnelLayer).join('');
  html += funnelLayer({
    name: '★入职', v: b.onb, w: 15, bg: '#b03a2e', fg: '#ffffff', rate: pct(b.onb, b.pass),
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
  html += funnelLayer({ name: '入职1天回访', v: b.rv1, w: 26, bg: '#e3eaf0', fg: '#41576b', side: rvSide(b.rv1, true), stage: 'rv1' });
  html += funnelLayer({ name: '3天回访', v: b.rv3, w: 38, bg: '#d3dee7', fg: '#41576b', side: rvSide(b.rv3), stage: 'rv3' });
  html += funnelLayer({ name: '7天回访', v: b.rv7, w: 52, bg: '#c0d0dd', fg: '#33526b', side: rvSide(b.rv7), stage: 'rv7' });
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
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#6e6a5c' } },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: p => {
        const c = clients[clients.length - 1 - p.dataIndex];
        return `<b>${esc(c.name)}</b><br/>发出邀约 ${c.n} · 实际到面 ${c.arr}<br/>面试通过 ${c.pass} · 入职 ${c.onb}${c.quit ? ` · 试岗离职 ${c.quit}` : ''}<br/>到面率 ${pct(c.arr, c.n)} · 已反馈通过率 ${pct(c.pass, c.pass + c.nopass)}`;
      }
    },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eae5d6' } }, axisLabel: { fontSize: 11, color: '#99937f' } },
    yAxis: {
      type: 'category', data: names,
      axisLabel: { fontSize: 12, color: '#211d15', width: 90, overflow: 'truncate' },
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#c9c2ae' } }
    },
    series: [
      { name: '到面未通过', type: 'bar', stack: 't', itemStyle: { color: '#8ba4b6' }, data: passRest.map((v, i) => Math.max(0, arrived[i] - passed[i])), barMaxWidth: 16, cursor: 'pointer' },
      { name: '面试通过未入职', type: 'bar', stack: 't', itemStyle: { color: '#33526b' }, data: passed.map((v, i) => Math.max(0, v - onb[i])), barMaxWidth: 16, cursor: 'pointer' },
      { name: '核实入职', type: 'bar', stack: 't', itemStyle: { color: '#b03a2e' }, data: onb, barMaxWidth: 16, label: { show: true, position: 'right', fontSize: 11, color: '#b03a2e', fontWeight: 600, formatter: p => `${p.value}/${clients[clients.length - 1 - p.dataIndex].n}`, }, cursor: 'pointer' },
      { name: '未到面/待补', type: 'bar', stack: 't', itemStyle: { color: '#dbe1e7' }, data: remain, barMaxWidth: 16, cursor: 'pointer' }
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
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#6e6a5c' } },
    tooltip: {
      trigger: 'axis', confine: true,
      formatter: ps => {
        const s = stats[stats.length - 1 - ps[0].dataIndex];
        const fb = s.b.pass + s.b.nopass;
        return `<b>${esc(s.p)}</b><br/>核实入职（主表） ${s.hireMain || 0} · 批次入职 ${s.b.onb}<br/>面试通过 ${s.b.pass}${fb ? ` · 已反馈通过率 ${pct(s.b.pass, fb)}` : ''}<br/>实际到面 ${s.b.arr} · 发出邀约 ${s.b.n}<br/>企微添加 ${num(metricRow('企微添加数', s.p))} · 我沟通 ${num(metricRow('我沟通', s.p))}`;
      }
    },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eae5d6' } }, axisLabel: { fontSize: 11, color: '#99937f' }, minInterval: 1 },
    yAxis: {
      type: 'category', data: names,
      axisLabel: { fontSize: 12, color: '#211d15' },
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#c9c2ae' } }
    },
    series: [
      { name: '实际到面', type: 'bar', data: arr, itemStyle: { color: '#8ba4b6', borderRadius: [0, 4, 4, 0] }, barGap: '-100%', barMaxWidth: 12, zIndex: 1, cursor: 'pointer' },
      { name: '面试通过', type: 'bar', data: pass, itemStyle: { color: '#33526b', borderRadius: [0, 4, 4, 0] }, barGap: '-100%', barMaxWidth: 8, zIndex: 2, cursor: 'pointer' },
      { name: '核实入职', type: 'bar', data: hire, itemStyle: { color: '#b03a2e', borderRadius: [0, 4, 4, 0] }, barMaxWidth: 12, zIndex: 3, label: { show: true, position: 'right', fontSize: 11, fontWeight: 600, color: '#b03a2e' }, cursor: 'pointer' }
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
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 3, textStyle: { fontSize: 11, color: '#6e6a5c' } },
    tooltip: {
      trigger: 'axis', confine: true,
      formatter: ps => `<b>${pretty(ps[0].axisValue)}</b><br/>` + ps.map(p => `${p.marker}${p.seriesName} ${p.value ?? 0}`).join('<br/>')
    },
    xAxis: { type: 'category', data: s.days, axisLabel: { fontSize: 11, color: '#99937f', formatter: short }, boundaryGap: false, axisLine: { lineStyle: { color: '#c9c2ae' } } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eae5d6' } }, axisLabel: { fontSize: 11, color: '#99937f' } },
    series: [
      { name: '发出邀约', type: 'line', data: s.invite, smooth: false, symbolSize: 5, lineStyle: { width: 1.5, color: '#9db0bf' }, itemStyle: { color: '#9db0bf' } },
      { name: '实际到面', type: 'line', data: s.arr, smooth: true, symbolSize: 6, lineStyle: { width: 2, color: '#6d8ea8' }, itemStyle: { color: '#6d8ea8' } },
      { name: '面试通过', type: 'line', data: s.pass, smooth: true, symbolSize: 6, lineStyle: { width: 2, color: '#a97b2f' }, itemStyle: { color: '#a97b2f' } },
      { name: '核实入职', type: 'line', data: s.hire, smooth: true, symbolSize: 6, lineStyle: { width: 2.5, color: '#b03a2e' }, itemStyle: { color: '#b03a2e' }, areaStyle: { color: 'rgba(176,58,46,.08)' } }
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
      { label: '已到面', value: b.arr, color: '#6d8ea8' },
      { label: '未到面', value: b.noarr, color: '#dbe1e7' },
      { label: '状态待补', value: b.apend, color: '#c09a4e' }
    ], b.n);
  } else if (stage === 'attended') {
    body += `<div class="detail-grid">${stat('实际到面', b.arr, '同一登记批次')}${stat('面试通过', b.pass)}${stat('未通过', b.nopass)}${stat('结果待补', b.ppend)}</div>`;
    body += statusBlock('已到面的面试结果', [
      { label: '通过', value: b.pass, color: '#b03a2e' },
      { label: '未通过', value: b.nopass, color: '#dbe1e7' },
      { label: '结果待补', value: b.ppend, color: '#c09a4e' }
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
    { label: '已到面', value: pb.arr, color: '#6d8ea8' },
    { label: '未到面', value: pb.noarr, color: '#dbe1e7' },
    { label: '待补', value: pb.apend, color: '#c09a4e' }
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
    { label: '已到面', value: c.arr, color: '#6d8ea8' },
    { label: '未到面', value: c.noarr, color: '#dbe1e7' },
    { label: '待补', value: c.apend, color: '#c09a4e' }
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
  else if (act === 'ai-task') aiTaskDetail(+a.dataset.pi, +a.dataset.ti);
  else if (act === 'ai-proj') aiProjectDetail(+a.dataset.pi);
  else if (act === 'proj') projDetail(+a.dataset.i);
}
// ---------- 页面切换（招聘 / AI开发 / 项目） ----------
const PAGES = ['recruit', 'ai', 'project'];
function currentPage() {
  const p = new URLSearchParams(location.search).get('page');
  return PAGES.includes(p) ? p : 'recruit';
}
function switchPage(page, updateUrl = true) {
  if (!PAGES.includes(page)) page = 'recruit';
  document.querySelectorAll('.page').forEach(el => { el.hidden = (el.id !== 'page-' + page); });
  document.querySelectorAll('.page-nav-link').forEach(a => {
    const active = a.dataset.page === page;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('page', page);
    history.replaceState(null, '', url);
  }
  Object.values(charts).forEach(c => c && c.resize());
  window.scrollTo({ top: 0 });
}

function bind() {
  document.querySelectorAll('.page-nav-link').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    switchPage(a.dataset.page);
  }));
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
  const aiSearch = $('ai-search-input');
  if (aiSearch) aiSearch.addEventListener('input', () => { aiQuery = aiSearch.value.trim().toLowerCase(); renderAiBoard(); });
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


// ---------- AI 开发看板（滴答清单「AI 开发进度」快照） ----------
let aiData = null, aiQuery = '';
const kv = (l, v) => `<div class="detail-stat"><span class="stat-label">${esc(l)}</span><strong class="stat-value" style="font-size:16px">${esc(v)}</strong></div>`;
const AI_PRIORITY = { 5: { name: '高优先级', color: '#b03a2e' }, 3: { name: '中优先级', color: '#c09a4e' }, 1: { name: '低优先级', color: '#6d8ea8' }, 0: { name: '无优先级', color: '#8d97a5' } };
const aiPri = t => AI_PRIORITY[t.priority || 0] || AI_PRIORITY[0];
const aiDone = t => t.status === 2;
const dKey = v => v ? String(v).slice(0, 10) : '';

function aiStats() {
  let total = 0, done = 0, high = 0;
  aiData.projects.forEach(p => p.tasks.forEach(t => {
    total++; if (aiDone(t)) done++; if (t.priority === 5 && !aiDone(t)) high++;
  }));
  return { total, done, undone: total - done, high };
}
function aiTaskText(t) {
  return [t.title, t.content, t.desc, ...(t.items || []).map(i => i.title)].filter(Boolean).join(' ');
}
function aiTaskMatches(project, task, seen = new Set()) {
  if (seen.has(task.id)) return false; seen.add(task.id);
  const hay = aiTaskText(task).toLowerCase();
  if (!aiQuery || hay.includes(aiQuery)) return true;
  return project.tasks.some(c => c.parentId === task.id && aiTaskMatches(project, c, seen));
}
function aiChildren(project, task) { return project.tasks.filter(t => t.parentId === task.id); }

function renderAI() {
  if (!aiData) return;
  const st = aiStats();
  $('ai-snapshot').textContent = '滴答清单快照 · ' + stamp(aiData.capturedAt);
  const kpis = [
    { eyebrow: '存量', label: '开发项目数', value: aiData.projects.length, note: '「AI 开发进度」文件夹', cls: '' },
    { eyebrow: '过程', label: '未完成任务', value: st.undone, note: '待推进 / 待验收', cls: '' },
    { eyebrow: '结果', label: '已完成任务', value: st.done, note: '含子任务与检查项', cls: 'metric-card--steel' },
    { eyebrow: '风险', label: '高优先级待办', value: st.high, note: '高优先级且未完成', cls: 'metric-card--gold' }
  ];
  $('ai-kpi').innerHTML = kpis.map(c => `<div class="metric-card ${c.cls}">
    <div class="metric-eyebrow">${c.eyebrow}</div>
    <div class="metric-label">${esc(c.label)}</div>
    <span class="metric-value">${num(c.value)}</span>
    <div class="metric-sub"><span>${esc(c.note)}</span></div></div>`).join('');
  $('ai-process').innerHTML = aiData.projects.map(p => {
    const total = p.tasks.length, done = p.tasks.filter(aiDone).length;
    return `<div class="process-item"><span class="process-label">${esc(p.name)}</span><span class="process-value">${total}</span><span class="process-note">未完成 ${total - done} · 已完成 ${done}</span></div>`;
  }).join('');
  renderAiChart();
  renderAiBoard();
}
function renderAiChart() {
  const el = $('ai-chart');
  if (!charts.ai) charts.ai = echarts.init(el);
  const names = aiData.projects.map(p => p.name);
  const undone = aiData.projects.map(p => p.tasks.filter(t => !aiDone(t)).length);
  const done = aiData.projects.map(p => p.tasks.filter(aiDone).length);
  charts.ai.setOption({
    grid: { left: 8, right: 40, top: 30, bottom: 0, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#6e6a5c' } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eae5d6' } }, axisLabel: { fontSize: 11, color: '#99937f' }, minInterval: 1 },
    yAxis: { type: 'category', data: names, inverse: true, axisLabel: { fontSize: 12, color: '#211d15', width: 120, overflow: 'truncate' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#c9c2ae' } } },
    series: [
      { name: '未完成', type: 'bar', stack: 't', itemStyle: { color: '#8ba4b6' }, data: undone, barMaxWidth: 16, cursor: 'pointer' },
      { name: '已完成', type: 'bar', stack: 't', itemStyle: { color: '#33526b' }, data: done, barMaxWidth: 16, label: { show: true, position: 'right', fontSize: 11, color: '#33526b', fontWeight: 600, formatter: p => p.value + undone[p.dataIndex] ? (done[p.dataIndex] + undone[p.dataIndex]) : '' }, cursor: 'pointer' }
    ]
  });
  charts.ai.off('click');
  charts.ai.on('click', e => { if (e.componentType === 'series') aiProjectDetail(e.dataIndex); });
}
function aiTaskRow(project, task, depth = 0) {
  const p = aiPri(task);
  const completed = aiDone(task);
  const kids = aiChildren(project, task);
  const schedule = task.startDate || task.dueDate ? `${dKey(task.startDate || task.dueDate)}${task.startDate && task.dueDate && task.startDate !== task.dueDate ? ' — ' + dKey(task.dueDate) : ''}` : '';
  const items = task.items?.length ? task.items.filter(i => i.status !== 0).length + '/' + task.items.length + ' 检查项' : '';
  const desc = task.content || task.desc || (task.items?.[0]?.title ? '· ' + task.items[0].title : '');
  const ti = project.tasks.indexOf(task);
  return `<div class="ai-task-row ${completed ? 'is-done' : ''}" style="--depth:${depth}">
    <button type="button" class="ai-task-open" data-action="ai-task" data-pi="${aiData.projects.indexOf(project)}" data-ti="${ti}" aria-label="查看任务：${esc(task.title)}">
      <span class="ai-dot" style="background:${p.color}" title="${p.name}"></span>
      <span class="ai-task-copy">
        <span class="ai-task-title">${esc(task.title)}</span>
        ${completed ? `<span class="ai-task-status">已完成${dKey(task.completedTime) ? ' · ' + dKey(task.completedTime) : ''}</span>` : `<span class="ai-task-status ai-task-status--live">${p.name}</span>`}
        ${desc ? `<span class="ai-task-description">${esc(desc)}</span>` : ''}
        ${schedule ? `<span class="ai-task-date">${schedule}</span>` : ''}
        ${items ? `<span class="ai-task-items">☷ ${items}</span>` : ''}
      </span>
    </button>
    ${kids.length ? `<div class="ai-children">${kids.map(k => aiTaskRow(project, k, depth + 1)).join('')}</div>` : ''}
  </div>`;
}
function renderAiBoard() {
  const html = aiData.projects.map((p, pi) => {
    const roots = p.tasks.filter(t => !t.parentId);
    const matched = roots.filter(t => aiTaskMatches(p, t));
    const total = p.tasks.length, done = p.tasks.filter(aiDone).length;
    if (aiQuery && !matched.length) return '';
    return `<div class="ai-project-card surface">
      <div class="ai-project-head">
        <h3>${esc(p.name)}</h3>
        <span class="ai-project-meta">${aiQuery ? `匹配 ${p.tasks.filter(t => aiTaskMatches(p, t)).length} 项 · ` : ''}未完成 ${total - done} · 已完成 ${done} / ${total}</span>
      </div>
      ${matched.length ? matched.map(t => aiTaskRow(p, t)).join('') : '<p class="source-note" style="padding:8px 14px 12px">该项目暂无任务。</p>'}
    </div>`;
  }).join('');
  $('ai-board').innerHTML = html || '<p class="source-note" style="padding:16px 4px">没有匹配的任务，请更换关键词。</p>';
}
function aiTaskDetail(pi, ti) {
  const p = aiData.projects[pi]; const t = p.tasks[ti];
  const pri = aiPri(t);
  const kids = aiChildren(p, t);
  setDetail('滴答清单 · 任务详情', t.title, `${p.name} · ${pri.name}`, `
    <div class="detail-grid">${kv('状态', aiDone(t) ? '已完成' : '进行中')}${kv('优先级', pri.name)}${kv('子任务', String(kids.length))}${kv('检查项', String(t.items?.length || 0))}${kv('开始日期', dKey(t.startDate) || '—')}${kv('截止日期', dKey(t.dueDate) || '—')}${aiDone(t) ? kv('完成时间', dKey(t.completedTime) || '—') : ''}</div>
    ${(t.content || t.desc) ? `<h3>任务描述</h3><p class="source-note">${esc(t.content || t.desc)}</p>` : ''}
    ${t.items?.length ? `<h3>检查项</h3>${simpleTable(['检查项', '状态'], t.items.map(i => [i.title, i.status === 2 ? '已完成' : i.status === 1 ? '进行中' : '未开始']))}` : ''}
    ${kids.length ? `<h3>子任务</h3>${simpleTable(['任务', '状态'], kids.map(k => [esc(k.title), aiDone(k) ? '已完成' : '进行中']))}` : ''}
    <p class="source-note" style="margin-top:14px">此页面为滴答清单任务快照，任务状态以滴答清单为准。</p>`);
}
function aiProjectDetail(pi) {
  const p = aiData.projects[pi];
  const done = p.tasks.filter(aiDone).length;
  setDetail('滴答清单 · 项目详情', p.name, '「AI 开发进度」文件夹快照', `
    <div class="detail-grid">${kv('任务总数', String(p.tasks.length))}${kv('未完成', String(p.tasks.length - done))}${kv('已完成', String(done))}${kv('高优先级待办', String(p.tasks.filter(t => t.priority === 5 && !aiDone(t)).length))}</div>
    ${renderAiProjectTasks(p)}`);
}
function renderAiProjectTasks(p) {
  const roots = p.tasks.filter(t => !t.parentId);
  if (!roots.length) return '<p class="source-note">该项目暂无任务。</p>';
  return `<h3>任务清单</h3><div class="detail-table-wrap"><table class="detail-table"><thead><tr><th>任务</th><th>优先级</th><th>状态</th><th>排期</th></tr></thead><tbody>${roots.map(t => {
    const pri = aiPri(t);
    const sched = t.startDate || t.dueDate ? dKey(t.startDate || t.dueDate) : '—';
    return `<tr><th scope="row">${esc(t.title)}${aiChildren(p, t).length ? `（${aiChildren(p, t).length} 子任务）` : ''}</th><td>${pri.name}</td><td>${aiDone(t) ? '已完成' : '进行中'}</td><td>${sched}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

// ---------- 项目看板（企微表格《合作项目情况表》快照） ----------
let projData = null;
function renderProject() {
  if (!projData) return;
  const ps = projData.projects;
  $('proj-snapshot').textContent = '企微表格快照 · ' + stamp(projData.meta.capturedAt);
  const cities = [...new Set(ps.map(p => p.city).filter(Boolean))];
  const main = ps.filter(p => p.recruit === '主招').length;
  const worker = ps.filter(p => p.category.includes('普工')).length;
  const white = ps.filter(p => p.category.includes('白领') || p.category.includes('技工')).length;
  $('proj-kpi').innerHTML = [
    { eyebrow: '存量', label: '正式合作项目', value: ps.length, note: '已确认合作', cls: '' },
    { eyebrow: '重点', label: '主招项目', value: main, note: '主招 / 辅招 / 试招分类', cls: 'metric-card--steel' },
    { eyebrow: '覆盖', label: '覆盖城市', value: cities.length, note: cities.join(' · '), cls: '' },
    { eyebrow: '储备', label: '跟进中项目', value: projData.following.length, note: '尚未正式确认', cls: 'metric-card--gold' }
  ].map(c => `<div class="metric-card ${c.cls}">
    <div class="metric-eyebrow">${c.eyebrow}</div>
    <div class="metric-label">${esc(c.label)}</div>
    <span class="metric-value">${num(c.value)}</span>
    <div class="metric-sub"><span>${esc(c.note)}</span></div></div>`).join('');
  $('proj-process').innerHTML = [
    ['普工项目', worker, '蓝领普工输送'],
    ['白领技工项目', white, '白领与技工岗位'],
    ['计天项目', projData.daily.length, '按天计费合作'],
    ['跟进项目', projData.following.length, '待确认合作']
  ].map(([l, v, n]) => `<div class="process-item"><span class="process-label">${l}</span><span class="process-value">${v}</span><span class="process-note">${n}</span></div>`).join('');
  renderProjChart();
  renderProjSpecial();
  renderProjTable();
}
function renderProjChart() {
  const el = $('proj-chart');
  if (!charts.proj) charts.proj = echarts.init(el);
  const groups = {};
  projData.projects.forEach(p => { const c = p.city || '未标注'; groups[c] = (groups[c] || 0) + 1; });
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  charts.proj.setOption({
    grid: { left: 8, right: 40, top: 10, bottom: 0, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eae5d6' } }, axisLabel: { fontSize: 11, color: '#99937f' }, minInterval: 1 },
    yAxis: { type: 'category', data: entries.map(e => e[0]), inverse: true, axisLabel: { fontSize: 12, color: '#211d15' }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#c9c2ae' } } },
    series: [{ type: 'bar', itemStyle: { color: '#33526b' }, data: entries.map(e => e[1]), barMaxWidth: 18, label: { show: true, position: 'right', fontSize: 11, fontWeight: 600, color: '#33526b' }, cursor: 'pointer' }]
  });
  charts.proj.off('click');
  charts.proj.on('click', e => { if (e.componentType === 'series') projCityDetail(e.name); });
}
function renderProjSpecial() {
  const daily = projData.daily.map(d => `<li><b>${esc(d.name)}</b></li>`).join('');
  const following = projData.following.map(f => `<li><b>${esc(f.name)}</b><span>${esc(f.city || '')}${f.owner ? ' · 负责业务 ' + esc(f.owner) : ''}</span></li>`).join('');
  $('proj-special').innerHTML = `
    <div class="proj-special-block">
      <h3>计天项目 <span class="badge badge--blue">${projData.daily.length} 个</span></h3>
      <ul class="detail-list">${daily || '<li><span>暂无记录</span></li>'}</ul>
    </div>
    <div class="proj-special-block">
      <h3>跟进项目 <span class="badge badge--amber">${projData.following.length} 个</span></h3>
      <ul class="detail-list">${following || '<li><span>暂无记录</span></li>'}</ul>
    </div>
    <p class="source-note">以上信息为快照，最新进展以《合作项目情况表》为准。</p>`;
}
function renderProjTable() {
  const ps = projData.projects;
  $('proj-table').innerHTML = `<div class="detail-table-wrap"><table class="detail-table"><thead><tr>
    <th>岗位类别</th><th>项目名称</th><th>主招</th><th>城市</th><th>负责业务</th><th>确认合作</th><th>费用</th><th>当前需求</th></tr></thead><tbody>
    ${ps.map((p, i) => `<tr class="proj-row" data-action="proj" data-i="${i}">
      <td>${esc(p.category) || '—'}</td><th scope="row">${esc(p.name)}</th>
      <td>${p.recruit ? `<span class="badge ${p.recruit === '主招' ? 'badge--teal' : p.recruit === '辅招' ? 'badge--blue' : 'badge--gray'}">${esc(p.recruit)}</span>` : '—'}</td>
      <td>${esc(p.city) || '—'}</td><td>${esc(p.owner) || '—'}</td><td>${esc(p.date) || '—'}</td>
      <td>${esc(p.fee) || '—'}</td><td>${p.need ? `<span class="badge badge--amber">${esc(p.need)}</span>` : '—'}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="source-note" style="margin-top:8px">点击项目行查看亮点、劣势、费用与合作细节。</p>`;
}
function projDetail(i) {
  const p = projData.projects[i];
  const grid = [
    kv('确认合作日期', p.date || '—'),
    kv('是否开票', p.billing || '—'),
    kv('服务中心', p.center || '—'),
    kv('负责客服', p.service || '—'),
    kv('负责业务', p.owner || '—'),
    kv('城市', p.city || '—')
  ].join('');
  const info = (title, text) => text ? `<h3>${title}</h3><p class="source-note">${esc(text)}</p>` : '';
  setDetail('合作项目 · 详情', p.name, `${p.category} · ${p.city}`, `
    <div class="detail-grid">${grid}</div>
    ${info('费用', p.fee ? p.fee + (p.feeNote ? '（' + p.feeNote + '）' : '') : p.feeNote)}
    ${info('项目亮点', p.highlight)}
    ${info('项目劣势', p.weakness)}
    ${info('当前需求', p.need)}
    ${info('其他备注', p.note)}
    <p class="source-note" style="margin-top:14px">信息为《合作项目情况表》快照，最新进展以源表为准。</p>`);
}
function projCityDetail(city) {
  const ps = projData.projects.filter(p => p.city === city);
  setDetail('合作项目 · 城市分布', city, `共 ${ps.length} 个正式合作项目`, `
    ${simpleTable(['项目名称', '岗位类别', '主招', '负责业务', '费用'], ps.map(p => [esc(p.name), esc(p.category), esc(p.recruit || '—'), esc(p.owner || '—'), esc(p.fee || '—')]))}`);
}

async function init() {
  try {
    const [res, aiRes, projRes] = await Promise.all([
      fetch('./data.json', { cache: 'no-store' }),
      fetch('./ai-data.json', { cache: 'no-store' }).catch(() => null),
      fetch('./project-data.json', { cache: 'no-store' }).catch(() => null)
    ]);
    if (!res.ok) throw new Error('数据文件暂不可用');
    data = await res.json();
    aiData = aiRes && aiRes.ok ? await aiRes.json() : null;
    projData = projRes && projRes.ok ? await projRes.json() : null;
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
      setPreset('all');
    }
    $('load-state').hidden = true;
    $('app-shell').hidden = false;
    bind();
    renderAI();
    renderProject();
    switchPage(currentPage(), false);
    render();
  } catch (error) {
    $('load-state').hidden = false;
    $('app-shell').hidden = true;
    $('load-state').innerHTML = `<div class="empty-state"><strong>看板暂时无法加载</strong><p>请稍后刷新页面。已发布的数据不会因此被修改。</p><button class="btn btn-primary" onclick="location.reload()">重新加载</button></div>`;
    console.error('Dashboard initialization failed', error);
  }
}
init();
