(() => {
  const resources = [
    {id:'tianchao',title:'温州天超电器 - 招聘信息采集清单',kind:'recruitment',platform:'企业微信文档',url:'https://doc.weixin.qq.com/sheet/e3_AQsA_wYCAFMCNwfQziIeVS5ixhePo?scode=ANgA6geLAFYtOuXkW7AQsA_wYCAFM&tab=000001'},
    {id:'collection-2',title:'温州泰昌铁塔 - 招聘信息采集清单',kind:'recruitment',platform:'企业微信文档',url:'https://doc.weixin.qq.com/sheet/e3_AQsA_wYCAFMCNgIB6VcvEQ30aXUP6?scode=ANgA6geLAFYzqfpKtFAQsA_wYCAFM&tab=000001'},
    {id:'collection-3',title:'合达电子 - 招聘信息采集清单',kind:'recruitment',platform:'企业微信文档',url:'https://doc.weixin.qq.com/sheet/e3_AQsA_wYCAFMCN3Tcu2woLRSOaF4eX?scode=ANgA6geLAFYqZlmKM1AQsA_wYCAFM&tab=000001'},
    {id:'team-data',title:'创新招聘组数据',kind:'team',platform:'腾讯文档',url:'https://docs.qq.com/sheet/DWVZDVGtBeEt3SHBM?tab=pgbna0'}
  ];
  const panel=document.getElementById('positions-panel');let built=false;
  function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function build(){
    if(built)return;built=true;
    const intro=el('div','resources-intro');intro.append(el('span','resources-kicker','RECRUITMENT DOCUMENTS'),el('p','','从企业信息采集到团队过程数据，快速进入对应资料。'));panel.append(intro);
    const filters=el('div','resources-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','资料分类');
    const grid=el('div','resources-grid');
    function show(kind){grid.replaceChildren();for(const resource of resources.filter(r=>kind==='all'||r.kind===kind)){
      const card=el('article','resource-card');
      const top=el('div','resource-card-top');const icon=el('div','resource-icon');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M9 9v12M4 15h16"/></svg>';top.append(icon,el('span','resource-platform',resource.platform));card.append(top);
      card.append(el('h2','',resource.title||'文档标题待确认'),el('p','resource-description',resource.kind==='team'?'招聘组过程记录、统计与协作数据。':'企业岗位需求、招聘条件与对接信息采集。'));
      if(!resource.title)card.append(el('span','resource-pending','等待确认原文件名'));
      const link=el('a','resource-open','打开文档 ↗');link.href=resource.url;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';card.append(link);grid.append(card);
    }}
    for(const [kind,label]of[['all','全部资料 · 4'],['recruitment','招聘采集 · 3'],['team','团队数据 · 1']]){const button=el('button','resource-filter',label);button.type='button';button.setAttribute('aria-pressed',String(kind==='all'));button.addEventListener('click',()=>{filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));show(kind);});filters.append(button);}
    panel.append(filters,grid,el('p','resource-footnote','文档将在新标签页打开，访问与编辑权限由原文档的分享设置决定。'));show('all');
  }
  document.addEventListener('positions:open',build);if(location.hash==='#positions')build();
})();
