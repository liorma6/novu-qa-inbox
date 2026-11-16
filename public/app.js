const $ = (id) => document.getElementById(id);
let messages = [], selected = null, view = 'html', requestGeneration = 0;
const make = (tag, cls, text) => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; };
const query = () => new URLSearchParams({environment:$('environment').value,q:$('search').value});

function detail() {
  const message = messages.find(m=>m.id===selected);
  const target = $('detail');
  target.replaceChildren();
  if(!message) { const empty=make('div','empty');empty.append(make('span','empty-icon','↙'),make('h3','','Every message tells a story.'),make('p','','Select a captured message to inspect its content and QA checks.'));target.append(empty);return; }
  target.append($('detail-template').content.cloneNode(true));
  target.querySelector('.subject').textContent=message.subject || '(No subject)';
  target.querySelector('.recipient').textContent=`To ${message.to.join(', ')}`;
  target.querySelector('.message-meta').textContent=`${message.environment} / ${message.workflow} / ${message.runId}`;
  const panel=target.querySelector('.view');
  panel.setAttribute('aria-labelledby',`tab-${view}`);
  for(const button of target.querySelectorAll('[role=tab]')) {
    button.setAttribute('aria-selected',String(button.dataset.view===view));
    button.onclick=()=>{view=button.dataset.view;detail();$('tab-'+view).focus();};
  }
  if(view==='html') {
    const frame=make('iframe');frame.title='Captured email preview';frame.setAttribute('sandbox','');frame.src=`/preview/${encodeURIComponent(message.id)}`;panel.append(frame);
  } else if(view==='text') panel.append(make('pre','',message.text || 'No plain-text fallback was captured.'));
  else for(const check of message.checks) { const row=make('div','check');row.append(make('span','',check.label),make('b',check.passed?'':'fail',check.passed?'PASS':'FAIL'));panel.append(row); }
}

function render() {
  $('messages').replaceChildren();
  if(!messages.length) { const empty=make('div','empty');empty.append(make('h3','','Nothing captured yet.'),make('p','','Run sample workflows, or send a signed Email Webhook request to this inbox.'));$('messages').append(empty); }
  for(const m of messages) {
    const card=make('button',`message-card${m.id===selected?' active':''}`);card.setAttribute('aria-label',`${m.subject || '(No subject)'}, ${m.status}`);card.setAttribute('aria-pressed',String(m.id===selected));
    const top=make('div','card-top');top.append(make('span',`badge ${m.environment}`,m.environment.toUpperCase()),make('span',`status ${m.status}`,m.status==='passed'?'● Passed':'● Needs attention'));
    card.append(top,make('h3','',m.subject||'(No subject)'),make('p','',m.to.join(', ')),make('div','card-workflow',m.workflow));
    card.onclick=()=>{selected=m.id;view='html';render();};$('messages').append(card);
  }
  detail();
}

async function refresh() {
  const generation=++requestGeneration;
  try {
    const response=await fetch(`/api/messages?${query()}`);
    if(!response.ok)throw new Error('Could not load inbox');
    const data=await response.json(); if(generation!==requestGeneration)return;
    messages=data.messages;
    if(!messages.some(m=>m.id===selected)) selected=messages[0]?.id ?? null;
    for(const id of ['captured','passed','failed']) $(id).textContent=data.summary[id];
    $('count').textContent=messages.length;$('export').href=`/api/report?${query()}`;render();
  } catch(error) { if(generation===requestGeneration)$('notice').textContent=error.message; }
}
$('demo').onclick=async()=>{
  $('demo').disabled=true;$('notice').textContent='Running three synthetic workflows through signed HTTP capture…';
  try {
    const response=await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Sample run failed');
    $('environment').value='';$('search').value='';
    $('notice').textContent=`${data.captured} messages captured · ${data.runId} · two intentional content failures to inspect.`;
    await refresh();
  } catch(error){$('notice').textContent=error.message;}finally{$('demo').disabled=false;}
};
$('environment').onchange=()=>refresh();$('search').oninput=()=>refresh();$('refresh').onclick=()=>refresh();
refresh();
