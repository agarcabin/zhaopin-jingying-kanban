(() => {
  'use strict';
  const panel = document.getElementById('task-panel');
  const priorities = [{value:5,name:'高优先级',color:'high'},{value:3,name:'中优先级',color:'medium'},{value:1,name:'低优先级',color:'low'},{value:0,name:'无优先级',color:'none'}];
  let data, loading=false, query='', collapsed=new Set(), board, count, dialog, detail, searchInput, reload;
  let timeline, monthStart=null;
  const DAY=86400000;
  function dateKey(value) {
    if(!value||!Number.isFinite(new Date(value).getTime()))return null;
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
  }
  function day(value) {const key=dateKey(value);return key?Date.parse(key+'T00:00:00Z'):null;}
  function dayLabel(value) {return new Date(value).toISOString().slice(0,10);}
  function schedule(task) {
    const start=day(task.startDate),end=day(task.dueDate);
    if(start===null&&end===null)return null;
    return {start:start??end,end:Math.max(start??end,end??start)};
  }
  function el(tag,cls,text) {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function color(task) {return priorities.find(p=>p.value===(task.priority||0))?.color||'none';}
  function priorityName(task) {return priorities.find(p=>p.value===(task.priority||0))?.name||'无优先级';}
  function children(project,task) {return project.tasks.filter(t=>t.parentId===task.id);}
  function matches(project,task,seen=new Set()) {
    if(seen.has(task.id))return false;seen.add(task.id);
    const haystack=[task.title,task.content,task.desc,...(task.items||[]).map(i=>i.title)].filter(Boolean).join(' ').toLocaleLowerCase();
    return !query||haystack.includes(query)||children(project,task).some(child=>matches(project,child,seen));
  }
  function descendants(project,task,seen=new Set()) {
    if(seen.has(task.id))return [];seen.add(task.id);
    return [task,...children(project,task).flatMap(child=>descendants(project,child,seen))];
  }
  function taskControl(project,task,nested=false) {
    const completed=task.status===2;
    const row=el('div','dev-task-row'+(completed?' is-completed':''));
    const kids=children(project,task);
    const toggle=el('button','dev-tree-toggle',kids.length?(collapsed.has(task.id)?'›':'⌄'):'');toggle.type='button';
    if(kids.length){toggle.setAttribute('aria-label',`${collapsed.has(task.id)?'展开':'收起'}${task.title}的子任务`);toggle.setAttribute('aria-expanded',String(!collapsed.has(task.id)));toggle.addEventListener('click',()=>{collapsed.has(task.id)?collapsed.delete(task.id):collapsed.add(task.id);renderBoard();board.querySelector(`[data-toggle="${task.id}"]`)?.focus();});toggle.dataset.toggle=task.id;row.append(toggle);}
    const button=el('button','dev-task-open');button.type='button';button.setAttribute('aria-label',`查看任务：${task.title}`);
    const square=el('span',`dev-check ${color(task)}`,completed?'✓':'');square.setAttribute('aria-hidden','true');
    const copy=el('span','dev-task-copy');copy.append(el('span','dev-task-title',task.title));
    if(completed)copy.append(el('span','dev-task-status','已完成'+(dateKey(task.completedTime)?' · '+dateKey(task.completedTime):'')));
    const description=task.content||task.desc||(task.items?.[0]?.title?`· ${task.items[0].title}`:'');
    if(description)copy.append(el('span','dev-task-description',description));
    const dates=schedule(task);if(dates)copy.append(el('span','dev-task-date',`${dayLabel(dates.start)} — ${dayLabel(dates.end)}`));
    if(task.items?.length)copy.append(el('span','dev-task-items',`☷ ${task.items.filter(i=>i.status===1||i.status===2).length}/${task.items.length} 检查项`));
    button.append(square,copy);button.addEventListener('click',()=>openTask(project,task));row.append(button);return row;
  }
  function card(project,task) {
    const card=el('article','dev-card');card.append(taskControl(project,task));
    const kids=children(project,task);
    if(kids.length&&!collapsed.has(task.id)){
      const nested=el('div','dev-children');
      for(const child of kids){const childCard=el('div','dev-child');childCard.append(taskControl(project,child,true));nested.append(childCard);}
      card.append(nested);
    }
    return card;
  }
  function renderBoard() {
    board.replaceChildren();let totalMatches=0;
    for(const project of data.projects){
      const ids=new Set(project.tasks.map(t=>t.id));
      const roots=project.tasks.filter(t=>!t.parentId||!ids.has(t.parentId));
      const visible=roots.filter(t=>matches(project,t));
      if(query&&!visible.length)continue;
      const column=el('section','dev-column');column.setAttribute('aria-label',project.name);
      const header=el('div','dev-column-head');const h3=el('h3','',projectName(project));const dot=el('span','dev-project-dot project-'+data.projects.indexOf(project));dot.setAttribute('aria-hidden','true');h3.prepend(dot);h3.append(el('span','dev-column-count',String(project.tasks.length)));header.append(h3);column.append(header);
      const body=el('div','dev-column-body');
      for(const priority of priorities){
        const tasks=visible.filter(t=>(t.priority||0)===priority.value);
        if(!tasks.length)continue;
        const section=el('details','dev-priority');section.open=true;
        const sum=tasks.reduce((n,t)=>n+descendants(project,t).length,0);
        const heading=el('summary','dev-priority-heading',priority.name);heading.append(el('span','',String(sum)));section.append(heading);
        for(const task of tasks)section.append(card(project,task));body.append(section);
      }
      if(!visible.length)body.append(el('p','dev-column-empty','暂无任务'));
      column.append(body);board.append(column);
      totalMatches+=project.tasks.filter(t=>[t.title,t.content,t.desc,...(t.items||[]).map(i=>i.title)].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)).length;
    }
    if(!board.children.length)board.append(el('div','dev-empty','没有找到匹配的任务，试试其他关键词。'));
    const all=data.projects.reduce((n,p)=>n+p.tasks.length,0);
    const completed=data.projects.reduce((n,p)=>n+p.tasks.filter(t=>t.status===2).length,0);
    count.textContent=query?`找到 ${totalMatches} 项匹配任务`:`${data.projects.length} 个项目 · ${all-completed} 项未完成 · ${completed} 项已完成`;
  }
  function renderView() {
    renderTimeline();renderBoard();
  }
  function calendarWeeks(month) {
    const date=new Date(month),year=date.getUTCFullYear(),index=date.getUTCMonth();
    const offset=(new Date(Date.UTC(year,index,1)).getUTCDay()+6)%7;
    const length=new Date(Date.UTC(year,index+1,0)).getUTCDate();
    const first=Date.UTC(year,index,1)-offset*DAY;
    return Array.from({length:Math.ceil((offset+length)/7)},(_,i)=>first+i*7*DAY);
  }
  function weekSegments(entries,weekStart) {
    const weekEnd=weekStart+6*DAY,lanes=[];
    return entries.filter(e=>e.dates.start<=weekEnd&&e.dates.end>=weekStart)
      .sort((a,b)=>a.dates.start-b.dates.start||b.dates.end-a.dates.end)
      .map(entry=>{
        const start=Math.round((Math.max(entry.dates.start,weekStart)-weekStart)/DAY)+1;
        const end=Math.round((Math.min(entry.dates.end,weekEnd)-weekStart)/DAY)+1;
        let lane=lanes.findIndex(last=>last<start);if(lane<0)lane=lanes.length;lanes[lane]=end;
        return {...entry,start,end,lane,continuesBefore:entry.dates.start<weekStart,continuesAfter:entry.dates.end>weekEnd};
      });
  }
  function projectName(project) {return project.name.replace(/^[^\p{L}\p{N}]+/u,'').trim();}
  function renderTimeline() {
    timeline.replaceChildren();
    const today=day(new Date());
    if(monthStart===null){const now=new Date(today);monthStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1);}
    const current=new Date(monthStart),year=current.getUTCFullYear(),month=current.getUTCMonth();
    const monthEnd=Date.UTC(year,month+1,1)-DAY;
    const entries=data.projects.flatMap((project,index)=>project.tasks.filter(t=>matches(project,t)&&schedule(t)).map(task=>({project,task,dates:schedule(task),index})));
    const inMonth=entries.filter(e=>e.dates.start<=monthEnd&&e.dates.end>=monthStart);
    const controls=el('div','dev-calendar-toolbar');
    const title=el('div','dev-calendar-title');const h2=el('h2','dev-section-title','排期月历');h2.id='dev-timeline-title';
    title.append(h2,el('span','dev-calendar-caption','仅显示已排期任务'));controls.append(title);
    const nav=el('div','dev-range-actions');
    const monthLabel=el('span','dev-month-label',year+' 年 '+(month+1)+' 月');monthLabel.setAttribute('aria-live','polite');
    const button=(text,label,action)=>{const b=el('button','dev-reload',text);b.type='button';b.setAttribute('aria-label',label);b.addEventListener('click',()=>{action();renderTimeline();});return b;};
    nav.append(button('本月','返回本月',()=>{monthStart=null;}),button('‹','上一个月',()=>{monthStart=Date.UTC(year,month-1,1);}),monthLabel,button('›','下一个月',()=>{monthStart=Date.UTC(year,month+1,1);}));
    controls.append(nav);timeline.append(controls);
    const meta=el('div','dev-calendar-meta');
    const summary=el('span','',inMonth.length?'本月 '+inMonth.length+' 项排期':'本月暂无排期');summary.setAttribute('role','status');
    meta.append(summary,el('span','','跨周任务连续展示 · 点击任务查看详情'));timeline.append(meta);
    const calendar=el('div','dev-calendar');calendar.setAttribute('role','region');calendar.setAttribute('aria-label',year+'年'+(month+1)+'月任务日历');
    const weekdays=el('div','dev-weekdays');for(const name of ['周一','周二','周三','周四','周五','周六','周日'])weekdays.append(el('div','',name));calendar.append(weekdays);
    for(const weekStart of calendarWeeks(monthStart)){
      const week=el('div','dev-calendar-week');const days=el('div','dev-calendar-dates');
      for(let i=0;i<7;i++){
        const value=weekStart+i*DAY,date=new Date(value),cell=el('div','dev-calendar-day');
        if(date.getUTCMonth()!==month)cell.classList.add('outside-month');
        if(i>=5)cell.classList.add('weekend');
        const label=el('span','dev-day-number',date.getUTCDate()===1?(date.getUTCMonth()+1)+'月1日':String(date.getUTCDate()));
        label.setAttribute('aria-label',dayLabel(value));
        if(value===today){label.classList.add('today');label.setAttribute('aria-current','date');}
        cell.append(label);days.append(cell);
      }
      week.append(days);
      const segments=weekSegments(entries,weekStart),lanes=el('div','dev-calendar-events');
      const laneCount=segments.length?Math.max(...segments.map(s=>s.lane))+1:0;
      lanes.style.setProperty('--lanes',laneCount);
      for(const segment of segments){
        const {project,task,dates,index}=segment;
        const bar=el('button','dev-calendar-event project-'+index);bar.type='button';
        if(task.status===2)bar.classList.add('is-completed');
        bar.style.gridColumn=segment.start+' / '+(segment.end+1);bar.style.gridRow=String(segment.lane+1);
        if(segment.continuesBefore)bar.classList.add('continues-before');if(segment.continuesAfter)bar.classList.add('continues-after');
        const datesText=dayLabel(dates.start)+' — '+dayLabel(dates.end);
        const title=(task.status===2?'✓ 已完成 · ':'')+(segment.continuesBefore?'‹ ':'')+task.title+(segment.continuesAfter?' ›':'');
        bar.append(el('span','dev-event-name',title),el('span','dev-event-meta',projectName(project)+' · '+datesText));
        bar.title=task.title+' · '+(task.status===2?'已完成':'未完成')+' · '+project.name+' · '+datesText+' · '+priorityName(task);
        bar.setAttribute('aria-label','查看任务：'+bar.title);bar.addEventListener('click',()=>openTask(project,task));lanes.append(bar);
      }
      week.append(lanes);calendar.append(week);
    }
    timeline.append(calendar);
    const legend=el('div','dev-calendar-legend');const projectIds=new Set(entries.filter(e=>{const weeks=calendarWeeks(monthStart);return e.dates.start<=weeks[weeks.length-1]+6*DAY&&e.dates.end>=weeks[0];}).map(e=>e.project.id));
    data.projects.forEach((project,index)=>{if(!projectIds.has(project.id))return;const label=el('span','dev-legend-item');const dot=el('span','dev-project-dot project-'+index);dot.setAttribute('aria-hidden','true');label.append(dot,el('span','',projectName(project)));legend.append(label);});
    legend.append(el('span','dev-calendar-note','相邻月份日期以浅色显示'));timeline.append(legend);
  }
  function createDialog() {
    dialog=el('dialog','dev-dialog');dialog.setAttribute('aria-labelledby','dev-detail-title');
    const outside=event=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
    let pressedOutside=false;
    dialog.addEventListener('pointerdown',event=>{pressedOutside=event.target===dialog&&outside(event);});
    dialog.addEventListener('click',event=>{if(pressedOutside&&event.target===dialog&&outside(event))dialog.close();pressedOutside=false;});
    const head=el('div','dev-dialog-head','任务详情');const close=el('button','dev-close','×');close.type='button';close.setAttribute('aria-label','关闭任务详情');close.addEventListener('click',()=>dialog.close());head.append(close);dialog.append(head);
    detail=el('div','dev-detail');dialog.append(detail);panel.append(dialog);
  }
  function openTask(project,task) {
    detail.replaceChildren();detail.append(el('span',`dev-priority-pill ${color(task)}`,priorityName(task)));
    const heading=el('h2','',task.title);heading.id='dev-detail-title';detail.append(heading);
    const meta=el('dl','dev-meta');
    for(const [name,value]of[['项目',project.name],['状态',task.status===2?'已完成':'未完成'],['开始',dateKey(task.startDate)||'未设置'],['截止',dateKey(task.dueDate)||'未设置']])meta.append(el('dt','',name),el('dd','',value));
    if(task.status===2)meta.append(el('dt','','完成时间'),el('dd','',task.completedTime?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short',hour12:false}).format(new Date(task.completedTime)):'未记录'));
    const parent=project.tasks.find(t=>t.id===task.parentId);if(parent)meta.append(el('dt','','父任务'),el('dd','',parent.title));detail.append(meta);
    if(task.content||task.desc)detail.append(el('h3','','任务说明'),el('p','dev-detail-text',task.content||task.desc));
    if(task.items?.length){detail.append(el('h3','','检查项'));const list=el('ul','dev-detail-list');for(const item of task.items)list.append(el('li','',`${item.status===1||item.status===2?'✓':'□'} ${item.title}`));detail.append(list);}
    const kids=children(project,task);if(kids.length){detail.append(el('h3','',`子任务 · ${kids.length}`));const list=el('ul','dev-detail-list');for(const child of kids)list.append(el('li','',child.title));detail.append(list);}
    detail.append(el('p','dev-detail-notice','此页面展示滴答清单的任务快照。任务状态以滴答清单为准。'));dialog.showModal();
  }
  function build() {
    panel.replaceChildren();
    const toolbar=el('div','dev-toolbar');const meta=el('div','dev-source');count=el('span','dev-total');meta.append(count);
    const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(data.capturedAt));
    meta.append(el('span','dev-snapshot',`滴答快照 · ${time}`));toolbar.append(meta);
    const controls=el('div','dev-controls');
    const label=el('label','dev-search');const searchIcon=el('span','dev-search-icon');searchIcon.setAttribute('aria-hidden','true');label.append(searchIcon);
    searchInput=el('input');searchInput.type='search';searchInput.placeholder='搜索任务、说明或检查项';searchInput.setAttribute('aria-label','搜索开发任务');searchInput.value=query;searchInput.addEventListener('input',()=>{query=searchInput.value.trim().toLocaleLowerCase();renderView();});label.append(searchInput);controls.append(label);
    reload=el('button','dev-reload','刷新快照');reload.type='button';reload.addEventListener('click',()=>load(true));controls.append(reload);toolbar.append(controls);panel.append(toolbar);
    timeline=el('section','dev-timeline');timeline.setAttribute('aria-labelledby','dev-timeline-title');
    const boardSection=el('section','dev-board-section');boardSection.setAttribute('aria-labelledby','dev-board-title');const boardTitle=el('h2','dev-section-title','项目看板');boardTitle.id='dev-board-title';
    board=el('div','dev-board');boardSection.append(boardTitle,board);panel.append(timeline,boardSection,el('p','dev-footnote','只读快照 · 日期按北京时间展示 · 点击任务查看详情'));
    createDialog();renderView();
  }
  async function load(force=false) {
    if(loading||(data&&!force))return;loading=true;if(reload)reload.disabled=true;
    try{
      const response=await fetch('./data/ai-development.json',{cache:'no-store'});if(!response.ok)throw new Error('snapshot unavailable');
      const incoming=await response.json();if(!Array.isArray(incoming.projects)||!incoming.capturedAt)throw new Error('invalid snapshot');data=incoming;build();
    }catch(error){const box=el('div','dev-empty','任务快照暂时无法加载。');const retry=el('button','dev-reload','重试');retry.type='button';retry.addEventListener('click',()=>load(true));box.append(retry);panel.replaceChildren(box);}
    finally{loading=false;if(reload)reload.disabled=false;}
  }
  document.addEventListener('task-preview:open',()=>load());if(location.hash==='#tasks')load();
})();
