import {CORE_METRICS,FULL_METRICS,SNAPSHOT_METRICS,PLATFORM_METRICS,COHORT_METRICS,isoValid,shiftDate,inRange,presetRange,aggregateDaily,aggregateInvites,aggregateHires,sourceCoverage,projectsForPeriod,trendPoints,numericSort,unique,total} from './model.js';

let data;
const state = {start:'',end:'',preset:'latest',full:false,mobileTable:false,sort:'source',projectSort:'hire',trend:'hire',detail:null};
const $ = id => document.getElementById(id);
const num = v => Number.isFinite(v) ? new Intl.NumberFormat('zh-CN').format(v) : '—';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = date => date ? `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}` : '—';
const pretty = date => date ? `${date.slice(0,4)}年${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日` : '—';
const span = (start=state.start,end=state.end) => start === end ? pretty(start) : `${start.slice(0,4)}/${short(start)} — ${start.slice(0,4)===end.slice(0,4)?short(end):end.slice(0,4)+'/'+short(end)}`;
const sourceStamp = value => value ? value.slice(0,16).replace('T',' ').replaceAll('-','/') : '—';
const def = key => data.metricDefinitions.find(m => m.key === key) || {label:key,unit:'',note:''};
const label = key => def(key).label.replace(/^★\s*/, '');
const names = ids => ids.map(id=>data.recruiters.find(r=>r.id===id)?.name || id).join('、');
const sortKey = value => ({hire:'verifiedHires',attended:'attended',communicated:'conversations',resumes:'resumes',wecom:'wecomAdds'}[value] || value);
const empty = text => `<div class="empty-state"><strong>暂无对应记录</strong><p>${esc(text)}</p></div>`;
const metricButton = (key,value,extra='') => `<button class="value-button" data-action="metric" data-metric="${key}" ${extra} aria-label="查看${esc(label(key))}构成">${num(value)}</button>`;
const stat = (labelText,value,note='') => `<div class="detail-stat"><span class="stat-label">${esc(labelText)}</span><strong class="stat-value">${num(value)}</strong>${note?`<small>${esc(note)}</small>`:''}</div>`;

function coverageText(agg,key) {
  const c=agg.coverage[key];
  if(!c?.days) return key==='resumes' ? `${short(data.meta.resumeStart)}起有数据` : '暂无对应记录';
  if(SNAPSHOT_METRICS.has(key)) return `${short(agg.lastDate)}报表值`;
  if(c.days < agg.requestedDays || c.missingCells) return `已覆盖 ${short(c.start)}—${short(c.end)} · ${c.days}天`;
  return '';
}
function dateBasis(key) {
  if(key==='verifiedHires') return '按入职日期统计';
  if(COHORT_METRICS.has(key)) return key==='invitations' ? '按登记日期统计' : '所选登记批次的最新状态';
  if(SNAPSHOT_METRICS.has(key)) return '按末日报表值展示';
  return '按记录日期统计';
}
function selectedPeople() {
  const people=data.recruiters.map(r=>({...r,aggregate:aggregateDaily(data,state.start,state.end,r.id)}));
  if(state.sort==='source') return people.sort((a,b)=>a.order-b.order);
  const key=sortKey(state.sort);
  return people.sort((a,b)=>numericSort(a.aggregate.values,b.aggregate.values,key) || a.order-b.order);
}
function setRange(start,end,preset='custom') {
  if(!isoValid(start)||!isoValid(end)||start>end){$('range-error').textContent='请选择有效日期，开始日期不能晚于结束日期。';return false;}
  state.start=start;state.end=end;state.preset=preset;
  $('range-error').textContent='';$('start-date').value=start;$('end-date').value=end;
  $('custom-range').hidden=preset!=='custom';
  const url=new URL(location.href);url.searchParams.set('view',preset);
  if(preset==='custom'){url.searchParams.set('start',start);url.searchParams.set('end',end);}
  else{url.searchParams.delete('start');url.searchParams.delete('end');}
  history.replaceState(null,'',url);
  render();return true;
}

function renderHeader(agg) {
  $('date-label').textContent=span();
  document.querySelectorAll('[data-preset]').forEach(b=>{const active=b.dataset.preset===state.preset;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',String(active));});
  const actual=agg.dates.length?`${short(agg.dates[0])}—${short(agg.dates.at(-1))}，${agg.dates.length}天`:'无日报记录';
  $('coverage-note').textContent=agg.dates.length===agg.requestedDays?`${agg.dates.length}天日报 · ${data.recruiters.length}位招聘专员`:`所选${agg.requestedDays}天 · 已有日报：${actual}`;
  $('meta-status').innerHTML=`<span>日报截至 <strong>${esc(short(data.meta.periodEnd))}</strong></span><span>源表生成 ${esc(sourceStamp(data.meta.sourceGeneratedAt))}</span>`;
}
function renderOverview(agg) {
  const keys=['verifiedHires','passed','attended','invitations'];
  $('kpi-grid').innerHTML=keys.map((key,i)=>`<article class="metric-card ${i===0?'metric-card--hire':'metric-card--cohort'}"><div class="metric-eyebrow">${i===0?'入职结果':i===1?'面试结果':i===2?'面试推进':'邀约登记'}</div><div class="metric-label">${esc(label(key))}<button class="metric-action" data-action="metric" data-metric="${key}" aria-label="查看${esc(label(key))}详情">↗</button></div><button class="metric-value" data-action="metric" data-metric="${key}" aria-label="${esc(label(key))}${num(agg.values[key])}人，查看构成">${num(agg.values[key])}<span class="metric-unit">人</span></button><div class="metric-note">${dateBasis(key)}</div></article>`).join('');
  $('process-strip').innerHTML=['conversations','wecomAdds','resumes'].map(key=>`<button class="process-item" data-action="metric" data-metric="${key}"><span class="process-label">${esc(label(key))}</span><strong class="process-value">${num(agg.values[key])}</strong><span class="process-note">${key==='resumes' ? coverageText(agg,key)||'邮箱收到简历' : key==='wecomAdds'?'按添加日期':'平台沟通记录'}</span></button>`).join('');
  const incomplete=sourceCoverage(data,state.start,state.end).filter(r=>!r.covered);
  if(!agg.hasData){$('coverage-alert').hidden=false;$('coverage-alert').innerHTML='<span class="badge badge--amber">暂无日报</span><span>这个区间尚无日报记录，请调整日期查看。</span>';}
  else if(incomplete.length){$('coverage-alert').hidden=false;$('coverage-alert').innerHTML=`<span class="badge badge--amber">来源覆盖提示</span><span>${incomplete.map(r=>`${short(r.date)} BOSS原始记录覆盖${r.reportedCount}/${r.expectedCount}人`).join('；')}。日报中的0保留原值，不据此判断是否工作。</span>`;}
  else{$('coverage-alert').hidden=true;$('coverage-alert').innerHTML='';}
}
function renderPeople(agg) {
  const people=selectedPeople();const keys=state.full?FULL_METRICS:CORE_METRICS;
  const table=`<table class="data-table"><thead><tr><th scope="col" class="metric-name">${state.full?'日报指标':'核心指标'}</th><th scope="col" class="total-column">合计</th>${people.map(p=>`<th scope="col"><button class="person-name" data-action="person" data-id="${p.id}">${esc(p.name)}<span class="subtle"> ↗</span></button></th>`).join('')}</tr></thead><tbody>${keys.map(key=>`<tr class="${key==='verifiedHires'?'hire-row':''}"><th scope="row" class="metric-name"><button data-action="metric" data-metric="${key}" class="metric-label-button">${esc(label(key))}</button>${(SNAPSHOT_METRICS.has(key)&&state.start!==state.end)?`<small class="subtle">${short(agg.lastDate)}报表值</small>`:''}${key==='resumes'&&coverageText(agg,key)?`<small class="subtle">${esc(coverageText(agg,key))}</small>`:''}</th><td class="total-column">${metricButton(key,agg.values[key])}</td>${people.map(p=>`<td>${metricButton(key,p.aggregate.values[key],`data-id="${p.id}"`)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('people-table').innerHTML=agg.hasData?table:empty('当前日期没有招聘日报。');
  $('people-table').classList.toggle('mobile-open',state.mobileTable);
  $('people-cards').innerHTML=agg.hasData?people.map(p=>{const v=p.aggregate.values;const coverage=sourceCoverage(data,state.start,state.end,p.id);const absent=coverage.filter(r=>!r.covered);return `<article class="person-card"><div class="person-head"><button class="person-name" data-action="person" data-id="${p.id}"><span class="person-avatar">${esc(p.name.slice(0,1))}</span>${esc(p.name)}<span class="person-action">查看详情 ↗</span></button></div><div class="person-kpis">${[['verifiedHires','核实入职'],['passed','面试通过'],['attended','实际到面']].map(([key,title])=>`<button data-action="metric" data-metric="${key}" data-id="${p.id}"><span class="stat-label">${title}</span><strong class="stat-value ${key==='verifiedHires'?'hire-value':''}">${num(v[key])}</strong></button>`).join('')}</div><div class="person-process"><span>我沟通 <b>${num(v.conversations)}</b></span><span>企微添加 <b>${num(v.wecomAdds)}</b></span><span>收到简历 <b>${num(v.resumes)}</b></span></div>${absent.length?`<p class="person-meta">${absent.map(r=>short(r.date)).join('、')} BOSS明细暂无记录</p>`:''}</article>`;}).join(''):empty('调整日期后查看全员表现。');
  $('toggle-full').textContent=state.full?'收起完整日报':'展开完整日报';$('toggle-full').setAttribute('aria-expanded',String(state.full));$('toggle-full').setAttribute('aria-pressed',String(state.full));
  $('mobile-table-toggle').textContent=state.mobileTable?'收起对比表':'查看完整对比表';$('mobile-table-toggle').setAttribute('aria-expanded',String(state.mobileTable));
  const resumeNote=coverageText(agg,'resumes');
  $('people-note').innerHTML=`<span>到面、通过按登记批次；核实入职按入职日期。</span>${resumeNote?`<span>收到简历：${esc(resumeNote)}。</span>`:''}${state.full?'<span>岗位与账号为末日报表值；账号暂不用于效率排名。</span>':''}`;
}
function statusBlock(title,parts,sum) {
  const content=parts.map(p=>`<div class="legend-item"><span class="dot" style="background:${p.color}"></span><span>${p.label}</span><strong>${num(p.value)}</strong></div>`).join('');
  return `<div class="status-row"><div class="status-title"><strong>${title}</strong><span class="muted">共${num(sum)}人</span></div><div class="status-track" aria-hidden="true">${sum?parts.filter(p=>p.value>0).map(p=>`<span class="status-segment" style="width:${p.value/sum*100}%;background:${p.color}"></span>`).join(''):'<span class="status-segment status-segment--empty" style="width:100%"></span>'}</div><div class="legend">${content}</div></div>`;
}
function renderInterviews(agg) {
  if(!agg.hasData){$('interview-panel').innerHTML=empty('当前区间尚无日报记录。');return;}
  const i=aggregateInvites(data,state.start,state.end);
  const h=aggregateHires(data,state.start,state.end);
  $('interview-panel').innerHTML=`<p class="source-note">${span()}登记批次 · 状态以本次源文件为准</p>${statusBlock('邀约后的到面状态',[{label:'已到面',value:i.attended,color:'#3b7d8f'},{label:'未到面',value:i.noShows,color:'#a8b4c2'},{label:'状态未填',value:i.statusUnknown,color:'#d5a04b'}],i.invitations)}${statusBlock('已到面的面试结果',[{label:'通过',value:i.passed,color:'#2c8b78'},{label:'未通过',value:i.failed,color:'#a8b4c2'},{label:'结果未填',value:i.resultUnknown,color:'#d5a04b'}],i.attended)}<div class="interview-summary"><div><span class="stat-label">已反馈面试通过率</span><strong class="feedback-rate">${i.passRate===null?'—':(i.passRate*100).toFixed(1)+'%'}</strong><span class="source-note">${i.feedbackCount?`${i.passed} / ${i.feedbackCount} · 另有${i.resultUnknown}条结果未填`:'尚无已到面且有反馈的记录'}</span></div><button class="btn btn-quiet" data-action="interview">查看构成 ↗</button></div><p class="source-note">入职另按入职日期统计，本期核实${num(h.verified)}人，不与本期通过数直接计算转化率。</p>`;
}
function renderAttention(agg) {
  const i=aggregateInvites(data,state.start,state.end),h=aggregateHires(data,state.start,state.end);
  const messages=[];
  if(i.statusUnknown)messages.push(`<li><b>${i.statusUnknown}条到面状态未填写</b><span>日报列为“待面试/待定”，不等同未来预约。</span></li>`);
  if(i.resultUnknown)messages.push(`<li><b>${i.resultUnknown}条面试结果未填写</b><span>已确认到面，尚未记录通过或不通过。</span></li>`);
  if(h.verified)messages.push(`<li><b>${h.verified}条核实入职暂无满一天信息</b><span>仅按核实入职展示，不推定持续在职或留存。</span></li>`);
  if(h.trialExcluded)messages.push(`<li><b>${h.trialExcluded}条试岗当天离职已排除</b><span>不计入核实入职。</span></li>`);
  const n=i.statusUnknown+i.resultUnknown;
  $('attention').innerHTML=`<details><summary><span>数据待核对</span><span class="badge ${n?'badge--amber':'badge--blue'}">${n?`${n}条面试状态待补`:'查看口径说明'}</span><span class="subtle">${short(state.start)}${state.start!==state.end?'—'+short(state.end):''}</span></summary><div class="attention-content">${messages.length?`<ul class="detail-list">${messages.join('')}</ul>`:'<p class="source-note">所选登记批次未发现到面状态或面试结果待补项。记录是否完整仍以实际填报为准。</p>'}<button class="btn btn-quiet" data-action="methodology">查看全部指标口径 ↗</button></div></details>`;
}
function projectCell(p,key) {
  if(p[key]===null)return '—';
  const source = ['invitations','attended','passed','noShows','statusUnknown','failed','resultUnknown'].includes(key)?'invites':['verifiedHires','reported','trialExcluded'].includes(key)?'hires':key==='resumes'?'resumes':'boss';
  if(!p.sourcePresence[source])return '<span class="muted">无记录</span>';
  return num(p[key]);
}
function projectStat(p,key,note) {
  return `<div class="detail-stat"><span class="stat-label">${esc(label(key))}</span><strong class="stat-value">${projectCell(p,key)}</strong><small>${esc(note)}</small></div>`;
}
function renderProjects() {
  const projects=projectsForPeriod(data,state.start,state.end);
  if(state.projectSort==='name')projects.sort((a,b)=>a.client.localeCompare(b.client,'zh-CN'));
  else projects.sort((a,b)=>numericSort(a,b,sortKey(state.projectSort)) || a.client.localeCompare(b.client,'zh-CN'));
  if(!projects.length){$('project-list').innerHTML=empty('所选区间的补充明细没有客户项目记录。');return;}
  const keys=['conversations','resumes','invitations','attended','passed','verifiedHires'];
  const table=`<div class="project-table-wrap table-wrap"><table class="data-table project-table"><thead><tr><th>客户 / 项目</th><th>涉及人员</th>${keys.map(k=>`<th>${esc(label(k))}</th>`).join('')}</tr></thead><tbody>${projects.map(p=>`<tr><th scope="row"><button class="person-name" data-action="project" data-client="${esc(p.client)}">${esc(p.client)} ↗</button></th><td class="project-people">${esc(names(p.recruiterIds))}</td>${keys.map(k=>`<td><button class="value-button" data-action="project" data-client="${esc(p.client)}">${projectCell(p,k)}</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="project-cards">${projects.map(p=>`<article class="project-card"><div class="project-head"><button class="person-name" data-action="project" data-client="${esc(p.client)}">${esc(p.client)} <span class="person-action">项目详情 ↗</span></button><p class="project-members">${esc(names(p.recruiterIds))}</p></div><div class="project-stats">${['verifiedHires','attended','invitations'].map(k=>`<div><span class="stat-label">${label(k)}</span><strong class="stat-value">${projectCell(p,k)}</strong></div>`).join('')}</div><div class="person-process"><span>我沟通 <b>${projectCell(p,'conversations')}</b></span><span>收到简历 <b>${projectCell(p,'resumes')}</b></span></div>${p.resumes>0&&!p.sourcePresence.invites?'<p class="insight-note">邀约表尚无记录，后续进展待核对</p>':''}</article>`).join('')}</div>`;
  $('project-list').innerHTML=table+cards+`<p class="source-note">所选区间有记录的客户 ${projects.length} 个。无记录表示对应明细未收录；企微添加不分摊到项目。简历自${short(data.meta.resumeStart)}起有数据；面试按登记批次，入职按入职日期。</p>`;
}

function chartMarkup(points,key,width) {
  const w=Math.max(280,Math.min(1000,width||720)),height=240,left=36,right=14,top=30,bottom=39;
  const plotW=w-left-right,plotH=height-top-bottom;
  const values=points.map(p=>p.value).filter(Number.isFinite);
  if(!values.length)return empty(key==='resumes'?`所选区间尚无邮箱简历记录，${short(data.meta.resumeStart)}起有数据。`:'所选区间暂无可绘制的数据。');
  const max=Math.max(...values,1);let step=Math.max(1,Math.ceil(max/4));
  if(step>10){const pow=10**Math.floor(Math.log10(step));step=Math.ceil(step/pow)*pow;}
  const topValue=Math.ceil(max/step)*step;
  const band=plotW/points.length,barWidth=Math.max(2,Math.min(42,band*.6));
  const labelEvery=Math.max(1,Math.ceil(points.length/(w<500?6:11)));
  let svg=`<svg class="chart" viewBox="0 0 ${w} ${height}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(label(key))}按日期的记录量，可选择日期查看详情"><title>${esc(label(key))}记录趋势</title><text x="${left}" y="15" fill="#788697" font-size="11">${esc(def(key).unit || '数量')}</text>`;
  for(let n=0;n<=topValue;n+=step){const y=top+plotH*(1-n/topValue);svg+=`<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#e8edf2" stroke-dasharray="3 4"/><text x="${left-8}" y="${y+4}" text-anchor="end" fill="#8a96a6" font-size="11">${num(n)}</text>`;}
  points.forEach((p,i)=>{const x=left+band*(i+.5),value=p.value,y=top+plotH*(1-(value||0)/topValue),fill=p.partial?'#b6c2ce':key==='verifiedHires'?'#328977':'#557994';
    if(value!==null){const h=value>0?Math.max(2,top+plotH-y):2;svg+=`<g data-action="day" data-date="${p.date}" data-metric="${key}" tabindex="0" role="button" aria-label="${short(p.date)} ${esc(label(key))}${num(value)}${p.partial?'，来源覆盖不足':''}，查看明细"><rect x="${x-barWidth/2}" y="${value>0?y:top+plotH-2}" width="${barWidth}" height="${h}" rx="4" fill="${fill}"/><rect x="${x-band/2}" y="${top-4}" width="${band}" height="${plotH+8}" fill="transparent"/><title>${short(p.date)}：${num(value)}${p.partial?'（BOSS来源覆盖不足）':''}</title>${points.length<=12?`<text x="${x}" y="${Math.max(23,y-8)}" text-anchor="middle" font-size="12" fill="#415269">${num(value)}</text>`:''}</g>`;}
    else svg+=`<text x="${x}" y="${top+plotH-8}" text-anchor="middle" font-size="12" fill="#a0aabb">—</text>`;
    if(i%labelEvery===0||i===points.length-1)svg+=`<text x="${x}" y="${height-14}" text-anchor="middle" fill="#788697" font-size="11">${short(p.date)}</text>`;
  });
  return svg+'</svg>';
}
function renderTrend() {
  const key=sortKey(state.trend);
  let from=state.start,to=state.end;
  if(from===to)from=shiftDate(to,-6);
  const points=trendPoints(data,from,to,key);
  $('trend-area').innerHTML=points.length?chartMarkup(points,key,$('trend-area').getBoundingClientRect().width):empty('当前区间暂无日报记录。');
  const context=state.start===state.end?`展示截至${short(to)}的近7日记录。`:`展示所选区间内已有日报覆盖的日期。`;
  $('trend-note').textContent=context+(key==='attended'?' 按登记日期查看当前到面结果，不代表当天实际发生到面。':key==='resumes'?` 邮箱口径，${short(data.meta.resumeStart)}之前为缺失。`:key==='verifiedHires'?' 按网招入职日期统计，试岗当天离职已排除。':key==='wecomAdds'?' 按企微添加日期统计。':' 灰色柱表示BOSS原始记录覆盖不足。')+' 点击柱形查看当日构成。';
}

function simpleTable(headers,rows) {
  return `<div class="detail-table-wrap"><table class="detail-table"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((x,i)=>`<${i===0?'th':'td'}>${x}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function showDetail(detail) {
  state.detail=detail;renderDetail();
  const dialog=$('detail-dialog');if(!dialog.open){state.opener=document.activeElement;dialog.showModal();document.documentElement.style.overflow='hidden';}
}
function renderDetail() {
  const d=state.detail;if(!d)return;
  const team=aggregateDaily(data,state.start,state.end);
  let title='',kicker='',subtitle=span(),body='';
  if(d.type==='person') {
    const person=data.recruiters.find(p=>p.id===d.id);if(!person)return;
    title=person.name;kicker='人员业绩';
    const a=aggregateDaily(data,state.start,state.end,d.id),v=a.values;
    const projects=projectsForPeriod(data,state.start,state.end,d.id);
    const i=aggregateInvites(data,state.start,state.end,{recruiterId:d.id});
    body=`<div class="detail-grid">${stat('核实入职',v.verifiedHires,'按入职日期')}${stat('面试通过',v.passed,'登记批次结果')}${stat('实际到面',v.attended,'登记批次结果')}${stat('发出邀约',v.invitations,'按登记日期')}</div><h3>完整日报</h3>${simpleTable(['指标','数量','说明'],FULL_METRICS.map(k=>[esc(label(k)),num(v[k]),esc(coverageText(a,k)||dateBasis(k))]))}<h3>项目分布</h3>${projects.length?simpleTable(['项目','核实入职','到面','收到简历'],projects.map(p=>[`<button class="text-link" data-action="project" data-client="${esc(p.client)}" data-id="${d.id}">${esc(p.client)} ↗</button>`,projectCell(p,'verifiedHires'),projectCell(p,'attended'),projectCell(p,'resumes')])):empty('本区间补充明细没有该人员的项目记录。')}<div class="info-callout"><strong>面试记录反馈</strong><p>到面状态未填${i.statusUnknown}条；已到面但结果未填${i.resultUnknown}条。${i.feedbackCount?`已反馈通过率${(i.passRate*100).toFixed(1)}%（${i.passed}/${i.feedbackCount}）。`:'尚无可计算已反馈通过率的记录。'}</p></div>`;
  } else if(d.type==='project') {
    const projects=projectsForPeriod(data,state.start,state.end,d.id||null),p=projects.find(p=>p.client===d.client);
    title=d.client;kicker=d.id?`${names([d.id])} · 项目详情`:'项目详情';
    if(!p)body=empty('该项目在当前所选区间没有补充明细记录。');
    else {
      const people=p.recruiterIds.map(id=>{const subset=projectsForPeriod(data,state.start,state.end,id).find(x=>x.client===p.client);return {id,p:subset};});
      body=`<p class="source-note">涉及人员：${esc(names(p.recruiterIds))}</p>
      <div class="detail-grid">${projectStat(p,'verifiedHires','按入职日期')}${projectStat(p,'passed','登记批次结果')}${projectStat(p,'attended','登记批次结果')}${projectStat(p,'invitations','按登记日期')}</div>
      <div class="info-callout"><strong>记录范围</strong><p>我沟通：${projectCell(p,'conversations')}；收到简历：${projectCell(p,'resumes')}（${short(data.meta.resumeStart)}起有数据）。各来源按客户汇总，不表示同一批候选人的端到端转化。</p>${!p.sourcePresence.invites?'<p>邀约跟进表在本区间尚无该项目记录，后续进展需要核对。</p>':''}</div>
      <h3>人员构成</h3>${simpleTable(['招聘专员','我沟通','收到简历','到面','核实入职'],people.map(x=>[`<button class="text-link" data-action="person" data-id="${x.id}">${esc(names([x.id]))} ↗</button>`,projectCell(x.p,'conversations'),projectCell(x.p,'resumes'),projectCell(x.p,'attended'),projectCell(x.p,'verifiedHires')]))}
      <h3>来源岗位名称</h3><div class="job-tags">${p.jobs.map(j=>`<span class="badge badge--blue">${esc(j)}</span>`).join('')}</div><p class="source-note">保留各表原名称，尚未把不同岗位写法合并。企微添加无可靠项目字段，不在这里分摊。</p>
      <h3>面试状态</h3>${p.sourcePresence.invites?simpleTable(['状态','数量'],[['已到面',projectCell(p,'attended')],['明确未到面',projectCell(p,'noShows')],['到面状态未填',projectCell(p,'statusUnknown')],['到面后通过',projectCell(p,'passed')],['到面后不通过',projectCell(p,'failed')],['到面后结果未填',projectCell(p,'resultUnknown')]]):'<p class="source-note">所选区间的邀约跟进表暂无该项目记录。</p>'}
      <h3>入职核对</h3>${p.sourcePresence.hires?`<p>上报${p.reported}条，核实${p.verifiedHires}条，试岗当天离职排除${p.trialExcluded}条。满一天和持续在职状态尚无完整信息。</p>`:'<p class="source-note">所选区间的入职提交表暂无该项目记录。</p>'}`;
    }
  } else if(d.type==='metric'||d.type==='day') {
    const key=d.metric,from=d.type==='day'?d.date:state.start,to=d.type==='day'?d.date:state.end;
    const a=aggregateDaily(data,from,to,d.id||null);const person=d.id?data.recruiters.find(r=>r.id===d.id):null;
    title=label(key);kicker=person?`${person.name} · 指标详情`:'指标详情';subtitle=span(from,to);
    body=`<div class="detail-grid">${stat(label(key),a.values[key],dateBasis(key))}</div><div class="info-callout"><strong>统计口径</strong><p>${esc(def(key).note || dateBasis(key))}</p>${coverageText(a,key)?`<p>${esc(coverageText(a,key))}。</p>`:''}</div>`;
    if(!person)body+=`<h3>人员构成</h3>${simpleTable(['招聘专员','数量'],data.recruiters.map(r=>[d.type==='day'?esc(r.name):`<button class="text-link" data-action="person" data-id="${r.id}">${esc(r.name)} ↗</button>`,num(aggregateDaily(data,from,to,r.id).values[key])]))}`;
    const pointRows=trendPoints(data,from,to,key,d.id||null).map(p=>[esc(short(p.date)),num(p.value),p.partial?'BOSS来源覆盖不足':p.value===null?'无数据':COHORT_METRICS.has(key)?'该日登记批次的当前状态':'按记录日期']);
    body+=`<h3>按日期查看</h3>${simpleTable(['日期','数量','说明'],pointRows)}<p class="source-note">来源：招聘日报。岗位数与账号在区间汇总中显示末日值，逐日记录不相加为不同岗位或账号总数。</p>`;
    if(key==='verifiedHires'){const h=aggregateHires(data,from,to,{recruiterId:d.id||null});body+=`<div class="info-callout"><strong>入职明细核对</strong><p>上报${h.reported}条，核实${h.verified}条，试岗当天离职排除${h.trialExcluded}条。客服确认入职不等同持续在职或满一天。</p></div>`;}
    if(['passed','attended','pending','noShows','invitations'].includes(key)){const i=aggregateInvites(data,from,to,{recruiterId:d.id||null});body+=`<h3>同一登记批次的状态</h3>${simpleTable(['状态','数量'],[['发出邀约',num(i.invitations)],['已到面',num(i.attended)],['未到面',num(i.noShows)],['到面状态未填',num(i.statusUnknown)],['已到面通过',num(i.passed)],['已到面不通过',num(i.failed)],['已到面结果未填',num(i.resultUnknown)]] )}`;}
  } else if(d.type==='interview') {
    const i=aggregateInvites(data,state.start,state.end);title='面试进展';kicker='登记批次详情';
    body=`<p class="source-note">${span()}登记的候选人，状态以本次源文件为准。</p><div class="detail-grid">${stat('发出邀约',i.invitations)}${stat('已到面',i.attended)}${stat('已通过',i.passed)}${stat('已反馈样本',i.feedbackCount)}</div>${simpleTable(['状态','数量'],[['未到面',num(i.noShows)],['到面状态未填',num(i.statusUnknown)],['到面后不通过',num(i.failed)],['到面后结果未填',num(i.resultUnknown)]])}<h3>按人员核对</h3>${simpleTable(['招聘专员','到面状态未填','面试结果未填'],data.recruiters.map(r=>{const x=aggregateInvites(data,state.start,state.end,{recruiterId:r.id});return [esc(r.name),num(x.statusUnknown),num(x.resultUnknown)];}))}<div class="info-callout"><strong>已反馈面试通过率</strong><p>${i.feedbackCount?`${i.passed}÷${i.feedbackCount}＝${(i.passRate*100).toFixed(1)}%。`:'暂无已反馈样本。'}分母仅包括已到面且结果明确为通过或不通过的记录。状态未填写的记录不自动当作未到面或面试失败。</p></div>`;
  } else {
    title='指标与数据说明';kicker='统计口径';subtitle=`日报截至${pretty(data.meta.periodEnd)}`;
    body=`<div class="info-callout"><strong>一份日报，两类业务日期</strong><p>到面、通过按邀约表的登记日期统计，状态使用当前源文件的记录。核实入职按网招入职日期统计。两者不能直接相除为同批次转化率。</p></div><h3>指标定义</h3>${simpleTable(['指标','说明'],data.metricDefinitions.map(m=>[esc(m.label),esc(m.note || m.dateBasis)]))}<h3>本版数据范围</h3><ul class="detail-list"><li><b>日报：${data.meta.periodStart}至${data.meta.periodEnd}</b><span>源表生成于${sourceStamp(data.meta.sourceGeneratedAt)}。</span></li><li><b>收到简历从${data.meta.resumeStart}起统计</b><span>前期缺失保留“—”，邮箱记录与BOSS收获简历不相加。</span></li><li><b>岗位、账号保留日报口径</b><span>跨日显示末日值。账号规则存在例外，暂不据此排名或推算利用率。</span></li><li><b>来源没有记录与明确为0分别解释</b><span>人员主表保留日报数字；BOSS来源覆盖不足会单独提示。</span></li><li><b>更新方式</b><span>维护人员提交新版Excel并核对后，更新到同一网址。页面展示已发布版本，未同步的Excel修改不会自动显示。</span></li></ul><h3>来源</h3><p>${esc(data.meta.sourceWorkbook || '创新招聘组数据20261018.xlsx')}</p><p class="source-note">招聘日报为主展示；BOSS数据、收到简历、企微添加、邀约信息跟进表、入职信息提交表为补充。网页只包含汇总，不包含候选人身份、联系方式和原始简历。</p>`;
  }
  $('detail-kicker').textContent=kicker;$('detail-title').textContent=title;$('detail-subtitle').textContent=subtitle;$('detail-body').innerHTML=body;
}

function render() {
  const agg=aggregateDaily(data,state.start,state.end);
  renderHeader(agg);renderOverview(agg);renderPeople(agg);renderInterviews(agg);renderAttention(agg);renderProjects();renderTrend();
  $('source-footer').innerHTML=`<span>来源：招聘日报及5张补充明细</span><span>源表 ${esc(sourceStamp(data.meta.sourceGeneratedAt))}</span><span>网页数据更新 ${esc(sourceStamp(data.meta.websiteUpdatedAt))}</span>`;
  if(state.detail)renderDetail();
}
function action(target) {
  const a=target.closest('[data-action]');if(!a)return;
  if(a.dataset.action==='person')showDetail({type:'person',id:a.dataset.id});
  if(a.dataset.action==='project')showDetail({type:'project',client:a.dataset.client,id:a.dataset.id});
  if(a.dataset.action==='metric')showDetail({type:'metric',metric:a.dataset.metric,id:a.dataset.id});
  if(a.dataset.action==='day')showDetail({type:'day',metric:a.dataset.metric,date:a.dataset.date});
  if(a.dataset.action==='methodology')showDetail({type:'methodology'});
  if(a.dataset.action==='interview')showDetail({type:'interview'});
}
function bind() {
  const navLinks=[...document.querySelectorAll('.primary-nav a')];
  function markNav(hash){navLinks.forEach(link=>{const active=link.hash===hash;link.classList.toggle('is-active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
  navLinks.forEach(link=>link.addEventListener('click',()=>markNav(link.hash)));
  let scrollPending=false;
  window.addEventListener('scroll',()=>{if(scrollPending)return;scrollPending=true;requestAnimationFrame(()=>{const sections=['overview','people','projects'];let current='overview';for(const id of sections){if($(id).getBoundingClientRect().top<180)current=id;}markNav('#'+current);scrollPending=false;});},{passive:true});
  markNav(location.hash||'#overview');
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.preset==='custom'){$('custom-range').hidden=false;$('start-date').focus();return;}const range=presetRange(data,b.dataset.preset);setRange(range.start,range.end,b.dataset.preset);}));
  $('apply-range').addEventListener('click',e=>{e.preventDefault();setRange($('start-date').value,$('end-date').value,'custom');});
  $('sort-metric').addEventListener('change',e=>{state.sort=e.target.value;renderPeople(aggregateDaily(data,state.start,state.end));});
  $('project-sort').addEventListener('change',e=>{state.projectSort=e.target.value;renderProjects();});
  $('trend-metric').addEventListener('change',e=>{state.trend=e.target.value;renderTrend();});
  $('toggle-full').addEventListener('click',()=>{state.full=!state.full;if(matchMedia('(max-width: 767px)').matches)state.mobileTable=true;renderPeople(aggregateDaily(data,state.start,state.end));});
  $('mobile-table-toggle').addEventListener('click',()=>{state.mobileTable=!state.mobileTable;if(state.mobileTable)state.full=true;renderPeople(aggregateDaily(data,state.start,state.end));});
  $('open-methodology').addEventListener('click',()=>showDetail({type:'methodology'}));
  document.addEventListener('click',e=>action(e.target));
  document.addEventListener('keydown',e=>{const target=e.target.closest?.('g[data-action]');if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();action(target);}});
  $('close-detail').addEventListener('click',()=>$('detail-dialog').close());
  $('detail-dialog').addEventListener('click',e=>{if(e.target===$('detail-dialog'))$('detail-dialog').close();});
  $('detail-dialog').addEventListener('close',()=>{state.detail=null;document.documentElement.style.overflow='';state.opener?.focus?.();});
  let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>renderTrend(),120);});
}

async function init() {
  try {
    const res=await fetch('./data.json',{cache:'no-store'});if(!res.ok)throw new Error('数据文件暂不可用');
    const candidate=await res.json();
    if(!Array.isArray(candidate.daily)||!candidate.daily.length||!candidate.meta?.periodEnd)throw new Error('数据文件不完整');
    data=candidate;
    const query=new URLSearchParams(location.search);const view=query.get('view');
    const start=query.get('start'),end=query.get('end');
    if(['latest','week','month','all'].includes(view)){Object.assign(state,presetRange(data,view));state.preset=view;}
    else if(isoValid(start)&&isoValid(end)&&start<=end){state.start=start;state.end=end;state.preset='custom';}
    else{Object.assign(state,presetRange(data,'latest'));state.preset='latest';}
    $('start-date').value=state.start;$('end-date').value=state.end;$('custom-range').hidden=state.preset!=='custom';
    $('sort-metric').value=state.sort;$('project-sort').value=state.projectSort;$('trend-metric').value=state.trend;
    $('load-state').hidden=true;$('app-shell').hidden=false;
    bind();render();
  } catch(error) {
    $('load-state').hidden=false;$('app-shell').hidden=true;
    $('load-state').innerHTML=`<div class="empty-state"><h1>看板暂时无法加载</h1><p>请稍后刷新页面。上次已发布的数据不会因此被修改。</p><button class="btn btn-primary" onclick="location.reload()">重新加载</button></div>`;
    console.error('Dashboard initialization failed',error);
  }
}
init();
