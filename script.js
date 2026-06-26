/* ══════════════════════════════════════════════════════════
   DEADLOCK TOOLKIT v2 — script.js
   Complete implementation:
   - Banker's Safety Algorithm
   - Deadlock Detection
   - Recovery: Terminate / Preempt / Rollback
   - Animated Step-by-Step walkthrough
   - Resource Allocation Graph (Canvas)
   - Background particle system
   - Light/Dark theme toggle
   - Screenshot export
   - Keyboard shortcuts
══════════════════════════════════════════════════════════ */
"use strict";

/* ════════════════════════════════════════════
   1.  GLOBAL STATE
════════════════════════════════════════════ */
const App = {
  n: 5,    // processes
  m: 3,    // resource types
  allocation: [],
  maximum: [],
  need: [],
  available: [],
  // results
  safeResult: null,     // { safe, sequence, steps }
  detectResult: null,   // { deadlocked, steps }
  // step-mode
  stepIndex: 0,
  stepTimer: null,
  stepRunning: false,
  // recovery state
  selectedTerminate: -1,
  selectedPreempt: -1,
  // RAG zoom
  ragScale: 1,
};

/* DEMO DATA (classic OS textbook 5-process, 3-resource example) */
const DEMO = {
  n:5, m:3,
  allocation:[[0,1,0],[2,0,0],[3,0,2],[2,1,1],[0,0,2]],
  maximum:   [[7,5,3],[3,2,2],[9,0,2],[2,2,2],[4,3,3]],
  available: [3,3,2],
};

/* ════════════════════════════════════════════
   2.  UTILITY HELPERS
════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const show = el => typeof el==='string' ? $(el).classList.remove('hidden') : el.classList.remove('hidden');
const hide = el => typeof el==='string' ? $(el).classList.add('hidden')    : el.classList.add('hidden');

function toast(msg, type='info', duration=3200){
  const c = $('toast-container');
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  d.innerHTML = `<span>${{success:'✓',error:'✗',info:'ℹ'}[type]||'•'}</span> ${msg}`;
  c.appendChild(d);
  setTimeout(()=>{ d.style.opacity='0'; d.style.transform='translateX(20px)'; setTimeout(()=>d.remove(),300); }, duration);
}

function showLoader(text='Processing…'){
  $('loading-text').textContent = text;
  show('loading-overlay');
}
function hideLoader(){ hide('loading-overlay'); }

function deepCopy(arr){ return arr.map(r=>Array.isArray(r)?[...r]:r); }

function addLogLine(containerId, text, tag='info'){
  const c = $(containerId);
  const placeholder = c.querySelector('.log-placeholder');
  if(placeholder) placeholder.remove();
  const d = document.createElement('div');
  d.className = 'log-line';
  d.innerHTML = `<span class="log-tag tag-${tag}">${tag.toUpperCase()}</span><span class="log-text">${text}</span>`;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function clearLog(id){ $(id).innerHTML=''; }

/* ════════════════════════════════════════════
   3.  TAB NAVIGATION
════════════════════════════════════════════ */
const TAB_TITLES = {
  simulator: ['Banker\'s Algorithm Simulator','Configure processes and resources, then run the algorithm'],
  detection: ['Deadlock Detection Engine','Identify which processes are deadlocked'],
  recovery:  ['Deadlock Recovery Toolkit','Resolve deadlocks via termination, preemption, or rollback'],
  rag:       ['Resource Allocation Graph','Visual representation of process-resource relationships'],
  theory:    ['OS Theory Reference','Deadlock concepts, conditions, and strategies'],
};

document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${tab}`).classList.add('active');
    const [t,s] = TAB_TITLES[tab]||['',''];
    $('page-title').textContent = t;
    $('page-sub').textContent   = s;
    if(tab==='rag') drawRAG();
  });
});

/* hamburger */
$('hamburger').addEventListener('click',()=>{
  document.getElementById('sidebar').classList.toggle('open');
});

/* ════════════════════════════════════════════
   4.  MATRIX UI GENERATION
════════════════════════════════════════════ */
function buildAvailableInputs(){
  const c = $('available-inputs'); c.innerHTML='';
  for(let j=0;j<App.m;j++){
    const g = document.createElement('div');
    g.className='avail-group';
    g.innerHTML=`<label>R${j}</label><input class="avail-in" data-j="${j}" type="number" min="0" max="99" value="${App.available[j]||0}"/>`;
    c.appendChild(g);
  }
  c.querySelectorAll('.avail-in').forEach(inp=>{
    inp.addEventListener('input',()=>{
      App.available[parseInt(inp.dataset.j)] = parseInt(inp.value)||0;
      refreshNeedDisplay();
    });
  });
}

function buildMatrixTable(containerId, prefix, rows, cols, initData, cellClass=''){
  const c = $(containerId); c.innerHTML='';
  let html=`<table class="input-table"><thead><tr><th></th>`;
  for(let j=0;j<cols;j++) html+=`<th>R${j}</th>`;
  html+=`</tr></thead><tbody>`;
  for(let i=0;i<rows;i++){
    html+=`<tr><td class="row-lbl">P${i}</td>`;
    for(let j=0;j<cols;j++){
      const v = initData?.[i]?.[j]??0;
      html+=`<td><input class="cell ${cellClass}" id="${prefix}_${i}_${j}" data-i="${i}" data-j="${j}" type="number" min="0" max="99" value="${v}"/></td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  c.innerHTML=html;
}

function buildNeedDisplay(need){
  const c=$('need-matrix'); c.innerHTML='';
  if(!need||!need.length){c.innerHTML='<p style="color:var(--tx3);font-size:0.8rem;padding:0.5rem">Run the algorithm to see the Need matrix.</p>';return;}
  let html=`<table class="input-table"><thead><tr><th></th>`;
  for(let j=0;j<App.m;j++) html+=`<th>R${j}</th>`;
  html+=`</tr></thead><tbody>`;
  for(let i=0;i<App.n;i++){
    html+=`<tr><td class="row-lbl">P${i}</td>`;
    for(let j=0;j<App.m;j++){
      const v=need[i][j];
      const cls = v > (App.available[j]||0) ? 'need-cell danger':'need-cell';
      html+=`<td><input class="cell ${cls}" value="${v}" readonly/></td>`;
    }
    html+=`</tr>`;
  }
  html+=`</tbody></table>`;
  c.innerHTML=html;
}

function refreshNeedDisplay(){
  try{
    readMatrices();
    App.need = calcNeed(App.allocation, App.maximum, App.n, App.m);
    buildNeedDisplay(App.need);
  }catch(e){ buildNeedDisplay(null); }
}

function initMatrices(allocData=null, maxData=null, availData=null){
  App.allocation = allocData || Array.from({length:App.n},()=>Array(App.m).fill(0));
  App.maximum    = maxData   || Array.from({length:App.n},()=>Array(App.m).fill(0));
  App.available  = availData || Array(App.m).fill(0);
  buildAvailableInputs();
  buildMatrixTable('alloc-matrix','alloc',App.n,App.m,App.allocation);
  buildMatrixTable('max-matrix','max',App.n,App.m,App.maximum);
  buildNeedDisplay(null);
  attachMatrixListeners();
}

function attachMatrixListeners(){
  ['alloc','max'].forEach(prefix=>{
    for(let i=0;i<App.n;i++) for(let j=0;j<App.m;j++){
      const inp=$(`${prefix}_${i}_${j}`);
      if(!inp) continue;
      inp.addEventListener('input',()=> refreshNeedDisplay());
    }
  });
}

/* ════════════════════════════════════════════
   5.  NUMBER CONTROLS (+/- for n & m)
════════════════════════════════════════════ */
document.querySelectorAll('.nc-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const id   = btn.dataset.target;
    const el   = $(id);
    let val    = parseInt(el.textContent);
    const act  = btn.dataset.action;
    if(id==='num-proc'){
      if(act==='inc'&&val<10) val++;
      if(act==='dec'&&val>1)  val--;
      App.n = val;
    } else {
      if(act==='inc'&&val<8) val++;
      if(act==='dec'&&val>1) val--;
      App.m = val;
    }
    el.textContent = val;
    initMatrices();
    hide('result-area'); hide('step-panel');
  });
});

/* ════════════════════════════════════════════
   6.  READ MATRICES FROM DOM
════════════════════════════════════════════ */
function readMatrices(){
  App.allocation = [];
  App.maximum    = [];
  for(let i=0;i<App.n;i++){
    const aRow=[], mRow=[];
    for(let j=0;j<App.m;j++){
      const av = parseInt($(`alloc_${i}_${j}`)?.value)||0;
      const mv = parseInt($(`max_${i}_${j}`)?.value)||0;
      aRow.push(av); mRow.push(mv);
    }
    App.allocation.push(aRow);
    App.maximum.push(mRow);
  }
  App.available = [];
  document.querySelectorAll('.avail-in').forEach(inp=>{
    App.available.push(parseInt(inp.value)||0);
  });
}

/* ════════════════════════════════════════════
   7.  CORE ALGORITHMS
════════════════════════════════════════════ */

/* 7a. Calculate Need Matrix */
function calcNeed(allocation, maximum, n, m){
  const need=[];
  for(let i=0;i<n;i++){
    const row=[];
    for(let j=0;j<m;j++){
      const v = maximum[i][j] - allocation[i][j];
      if(v<0) throw new Error(`P${i}: Allocation[${j}]=${allocation[i][j]} > Max[${j}]=${maximum[i][j]}`);
      row.push(v);
    }
    need.push(row);
  }
  return need;
}

/* 7b. Banker's Safety Algorithm
   Returns { safe, sequence, steps[] }
   Each step: { label, detail, selectedProc, work, finish, sequence }
*/
function bankersAlgorithm(allocation, need, available, n, m){
  const work    = [...available];
  const finish  = Array(n).fill(false);
  const sequence= [];
  const steps   = [];

  steps.push({
    label:'Initialize',
    detail:`Set <strong>Work = Available = [${work.join(', ')}]</strong><br>Mark all Finish[i] = false`,
    selectedProc: -1,
    work:[...work], finish:[...finish], sequence:[...sequence],
  });

  let count=0, guard=0;
  while(count<n && guard<n*n+10){
    guard++;
    let found=false;
    for(let i=0;i<n;i++){
      if(finish[i]) continue;
      const canRun = need[i].every((v,j)=>v<=work[j]);
      if(canRun){
        const prevWork=[...work];
        for(let j=0;j<m;j++) work[j]+=allocation[i][j];
        finish[i]=true; sequence.push(i); count++; found=true;
        steps.push({
          label:`P${i} selected`,
          detail:`<strong>P${i} can execute</strong> because<br>Need[${i}] = [${need[i].join(', ')}] ≤ Work = [${prevWork.join(', ')}]<br>→ Allocate resources, P${i} finishes<br>→ Work += Allocation[${i}] = [${allocation[i].join(', ')}]<br>→ New Work = [${work.join(', ')}]`,
          selectedProc:i,
          work:[...work], finish:[...finish], sequence:[...sequence],
        });
        break;
      }
    }
    if(!found) break;
  }

  const safe = finish.every(f=>f);
  steps.push({
    label: safe ? '✅ System is SAFE' : '❌ System is UNSAFE',
    detail: safe
      ? `All processes completed. <strong>Safe sequence: ${sequence.map(i=>`P${i}`).join(' → ')}</strong>`
      : `Cannot complete all processes.<br>Blocked: <strong>${finish.map((f,i)=>!f?`P${i}`:null).filter(Boolean).join(', ')}</strong><br>System is in UNSAFE state!`,
    selectedProc:-1,
    work:[...work], finish:[...finish], sequence:[...sequence],
  });

  return { safe, sequence, steps };
}

/* 7c. Deadlock Detection
   Returns { deadlocked[], steps[] }
*/
function detectDeadlock(allocation, need, available, n, m){
  const work   = [...available];
  const finish = allocation.map(row=>row.every(v=>v===0)); // pre-mark zero-alloc
  const steps  = [];

  steps.push({
    label:'Initialize Detection',
    detail:`Work = [${work.join(', ')}]<br>Pre-mark processes with zero allocation as finished.`,
  });

  let found, guard=0;
  do{
    found=false; guard++;
    for(let i=0;i<n;i++){
      if(finish[i]) continue;
      const canRun = need[i].every((v,j)=>v<=work[j]);
      if(canRun){
        for(let j=0;j<m;j++) work[j]+=allocation[i][j];
        finish[i]=true; found=true;
        steps.push({
          label:`P${i} can complete`,
          detail:`Request[${i}] = [${need[i].join(', ')}] ≤ Work<br>P${i} runs & releases. Work = [${work.join(', ')}]`,
        });
      }
    }
  }while(found && guard<n*n+10);

  const deadlocked = finish.map((f,i)=>!f?i:null).filter(v=>v!==null);
  steps.push({
    label: deadlocked.length===0 ? '✅ No Deadlock' : `❌ Deadlock: ${deadlocked.map(i=>`P${i}`).join(', ')}`,
    detail: deadlocked.length===0
      ? 'All processes can complete — <strong>no deadlock detected</strong>.'
      : `Processes stuck in circular wait:<br><strong>${deadlocked.map(i=>`P${i}`).join(', ')}</strong>`,
  });

  return { deadlocked, steps };
}

/* ════════════════════════════════════════════
   8.  RUN BANKER'S ALGORITHM
════════════════════════════════════════════ */
$('btn-run').addEventListener('click', async()=>{
  try{
    readMatrices();
    App.need = calcNeed(App.allocation, App.maximum, App.n, App.m);
    buildNeedDisplay(App.need);
  }catch(e){ toast(e.message,'error'); return; }

  showLoader('Running Banker\'s Algorithm…');
  await delay(600);

  App.safeResult = bankersAlgorithm(App.allocation, App.need, App.available, App.n, App.m);
  hideLoader();

  renderBankersResult(App.safeResult);
  populateAlgoLog(App.safeResult.steps);
  show('result-area');

  toast(App.safeResult.safe ? 'System is in a SAFE state ✓' : 'System is UNSAFE — deadlock risk!',
        App.safeResult.safe ? 'success' : 'error');
});

function renderBankersResult(result){
  const card = $('status-card');
  const icon = $('status-icon');
  const title= $('status-title');
  const msg  = $('status-msg');
  const seqW = $('safe-seq-wrap');

  card.className='status-card glass-card '+(result.safe?'status-safe':'status-unsafe');
  icon.textContent = result.safe ? '🔐' : '💥';
  title.textContent= result.safe ? 'SAFE STATE' : 'UNSAFE STATE';
  msg.textContent  = result.safe
    ? `Safe sequence of ${App.n} processes found.`
    : 'No safe sequence exists. Deadlock risk detected.';

  seqW.innerHTML='';
  if(result.safe){
    result.sequence.forEach((pid,idx)=>{
      if(idx>0){const a=document.createElement('span');a.className='seq-arrow';a.textContent='→';seqW.appendChild(a);}
      const s=document.createElement('span');
      s.className='seq-step';
      const p=document.createElement('span');
      p.className='seq-proc';
      p.textContent=`P${pid}`;
      p.style.animationDelay=`${idx*0.1}s`;
      s.appendChild(p); seqW.appendChild(s);
    });
  }
}

function populateAlgoLog(steps){
  clearLog('log-scroll');
  steps.forEach((s,i)=>{
    const tag = s.label.includes('✅')?'ok': s.label.includes('❌')?'err': i===0?'info':'step';
    addLogLine('log-scroll', `<strong>${s.label}</strong> — ${s.detail.replace(/<[^>]+>/g,' ')}`, tag);
  });
}

/* ════════════════════════════════════════════
   9.  STEP-BY-STEP MODE
════════════════════════════════════════════ */
$('btn-stepmode').addEventListener('click',()=>{
  if(!App.safeResult){ toast('Run the algorithm first!','error'); return; }
  App.stepIndex = 0;
  show('step-panel');
  renderStep();
});
$('step-close').addEventListener('click',()=>{ hide('step-panel'); stopAuto(); });
$('step-prev').addEventListener('click',()=>{ if(App.stepIndex>0){App.stepIndex--;renderStep();} });
$('step-next').addEventListener('click',()=>{
  const steps=App.safeResult.steps;
  if(App.stepIndex<steps.length-1){App.stepIndex++;renderStep();}
});
$('step-auto').addEventListener('click',()=>{
  if(App.stepRunning){ stopAuto(); return; }
  App.stepRunning=true;
  $('step-auto').textContent='⏸ Pause';
  App.stepTimer=setInterval(()=>{
    const steps=App.safeResult.steps;
    if(App.stepIndex>=steps.length-1){ stopAuto(); return; }
    App.stepIndex++; renderStep();
  },1800);
});
function stopAuto(){
  App.stepRunning=false;
  clearInterval(App.stepTimer);
  $('step-auto').textContent='▶ Auto';
}

function renderStep(){
  const steps = App.safeResult.steps;
  const total = steps.length;
  const s     = steps[App.stepIndex];

  $('step-counter').textContent = `${App.stepIndex+1} / ${total}`;
  $('step-fill').style.width = `${((App.stepIndex+1)/total)*100}%`;

  // Visual: process grid
  const vis = $('step-visual');
  let html=`<div style="font-size:0.72rem;color:var(--tx3);margin-bottom:0.5rem;letter-spacing:0.06em">PROCESS STATUS</div>`;
  html+=`<div style="display:flex;flex-wrap:wrap;gap:0.4rem">`;
  for(let i=0;i<App.n;i++){
    const done    = s.finish[i];
    const active  = s.selectedProc===i;
    const inSeq   = s.sequence.includes(i);
    const col = active?'var(--amber)': done?'var(--green)':'var(--tx3)';
    const bg  = active?'rgba(251,191,36,0.15)': done?'rgba(52,211,153,0.1)':'rgba(255,255,255,0.04)';
    const br  = active?'rgba(251,191,36,0.4)': done?'rgba(52,211,153,0.3)':'var(--glass-border)';
    html+=`<div style="padding:0.3rem 0.55rem;border-radius:6px;border:1px solid ${br};background:${bg};font-family:var(--f-mono);font-size:0.78rem;color:${col};font-weight:${active?700:500}">`;
    html+=`P${i} ${active?'🔄': done?'✓':'⏳'}`;
    html+=`</div>`;
  }
  html+=`</div>`;
  // Work vector
  html+=`<div style="margin-top:0.6rem;font-size:0.72rem;color:var(--tx3)">Work = [${s.work.join(', ')}]</div>`;
  vis.innerHTML=html;

  // Explain
  $('step-explain').innerHTML=`
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--tx3);margin-bottom:0.45rem;font-family:var(--f-mono)">Step ${App.stepIndex+1}: ${s.label}</div>
    <div style="line-height:1.7;font-size:0.85rem;color:var(--tx2)">${s.detail}</div>
    ${s.sequence.length>0?`<div style="margin-top:0.5rem;font-size:0.75rem;color:var(--tx3);font-family:var(--f-mono)">Sequence so far: ${s.sequence.map(i=>`P${i}`).join(' → ')}</div>`:''}
  `;

  // Work row chips
  const wr=$('step-work-row');
  wr.innerHTML=`<span style="color:var(--tx3);margin-right:0.25rem">Work:</span>`;
  s.work.forEach((v,j)=>{
    const ch=document.createElement('span');ch.className='work-chip';ch.textContent=`R${j}=${v}`;wr.appendChild(ch);
  });
  wr.innerHTML+=`<span style="color:var(--tx3);margin:0 0.25rem">|</span>`;
  for(let i=0;i<App.n;i++){
    const ch=document.createElement('span');
    ch.className=`finish-chip${s.finish[i]?' done':''}`;
    ch.textContent=`P${i}`;
    wr.appendChild(ch);
  }
}

/* ════════════════════════════════════════════
   10.  DETECTION TAB
════════════════════════════════════════════ */
$('btn-detect').addEventListener('click', async()=>{
  try{ readMatrices(); App.need = calcNeed(App.allocation,App.maximum,App.n,App.m); }
  catch(e){ toast(e.message,'error'); return; }

  showLoader('Detecting deadlock…');
  await delay(700);
  App.detectResult = detectDeadlock(App.allocation, App.need, App.available, App.n, App.m);
  hideLoader();

  renderDetectResult(App.detectResult);
  show('detect-result');
  populateRecovery(App.detectResult);

  toast(App.detectResult.deadlocked.length===0
    ? 'No deadlock detected ✓'
    : `Deadlock in ${App.detectResult.deadlocked.map(i=>`P${i}`).join(', ')}`,
    App.detectResult.deadlocked.length===0?'success':'error');
});

function renderDetectResult(result){
  // Status card
  const ds=$('detect-status');
  ds.className='status-card glass-card '+(result.deadlocked.length===0?'status-safe':'status-unsafe');
  ds.innerHTML=`
    <div class="status-icon">${result.deadlocked.length===0?'🟢':'🔴'}</div>
    <div class="status-body">
      <h2>${result.deadlocked.length===0?'NO DEADLOCK':'DEADLOCK DETECTED'}</h2>
      <p>${result.deadlocked.length===0
        ? 'All processes can complete successfully.'
        : `Deadlocked processes: <strong>${result.deadlocked.map(i=>`P${i}`).join(', ')}</strong>`
      }</p>
    </div>`;

  // Process states
  const dp=$('detect-processes'); dp.innerHTML='';
  for(let i=0;i<App.n;i++){
    const dead = result.deadlocked.includes(i);
    const div=document.createElement('div');
    div.className=`proc-state-item ${dead?'state-deadlock':'state-safe'}`;
    div.innerHTML=`
      <span class="psi-dot"></span>
      <span class="psi-name">P${i}</span>
      <span class="psi-label">${dead?'⚠ DEADLOCKED':'✓ CAN COMPLETE'}</span>`;
    dp.appendChild(div);
  }

  // Log
  clearLog('detect-log');
  result.steps.forEach(s=>{
    const tag=s.label.includes('✅')?'ok':s.label.includes('❌')?'err':'info';
    addLogLine('detect-log',`<strong>${s.label}</strong> — ${s.detail.replace(/<[^>]+>/g,' ')}`,tag);
  });
}

/* ════════════════════════════════════════════
   11.  RECOVERY TAB
════════════════════════════════════════════ */
function populateRecovery(result){
  if(!result || result.deadlocked.length===0){
    $('recovery-intro').querySelector('.hint-text').textContent='No deadlock detected — recovery not needed.';
    return;
  }
  hide('recovery-intro'); show('recovery-options');

  // Banner
  const banner=$('recovery-banner');
  banner.innerHTML=`
    <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
      <span style="font-size:1.4rem">⚠️</span>
      <div>
        <div style="font-family:var(--f-display);font-weight:700;color:var(--red)">Deadlock Detected</div>
        <div style="font-size:0.82rem;color:var(--tx2)">Deadlocked processes: <strong style="color:var(--red)">${result.deadlocked.map(i=>`P${i}`).join(', ')}</strong></div>
      </div>
    </div>`;

  // Populate chips
  ['terminate-procs','preempt-procs'].forEach(id=>{
    const c=$(id); c.innerHTML='';
    result.deadlocked.forEach(pid=>{
      const chip=document.createElement('div');
      chip.className='proc-chip'; chip.textContent=`P${pid}`; chip.dataset.pid=pid;
      chip.addEventListener('click',()=>{
        c.querySelectorAll('.proc-chip').forEach(ch=>ch.classList.remove('selected'));
        chip.classList.add('selected');
        if(id==='terminate-procs') App.selectedTerminate=pid;
        else App.selectedPreempt=pid;
      });
      c.appendChild(chip);
    });
  });

  // Rollback info
  $('rollback-info').innerHTML=`Will rollback: <span style="color:var(--purple)">${result.deadlocked.map(i=>`P${i}`).join(', ')}</span> to initial allocation state.`;
}

$('btn-terminate').addEventListener('click',()=>{
  if(App.selectedTerminate<0){toast('Select a process to terminate','error');return;}
  const pid=App.selectedTerminate;
  clearLog('recovery-log');
  addLogLine('recovery-log',`Terminating <strong>P${pid}</strong>…`,'warn');
  // Release resources
  for(let j=0;j<App.m;j++){
    App.available[j]+=App.allocation[pid][j];
    App.allocation[pid][j]=0; App.maximum[pid][j]=0; App.need[pid][j]=0;
  }
  addLogLine('recovery-log',`P${pid} terminated. Resources released. Available = [${App.available.join(', ')}]`,'ok');
  rerunAfterRecovery(pid,'terminated');
});

$('btn-preempt').addEventListener('click',()=>{
  if(App.selectedPreempt<0){toast('Select a process to preempt','error');return;}
  const pid=App.selectedPreempt;
  clearLog('recovery-log');
  addLogLine('recovery-log',`Preempting resources from <strong>P${pid}</strong>…`,'warn');
  const freed=[...App.allocation[pid]];
  for(let j=0;j<App.m;j++){
    App.available[j]+=App.allocation[pid][j];
    App.need[pid][j]+=App.allocation[pid][j];
    App.allocation[pid][j]=0;
  }
  addLogLine('recovery-log',`Preempted [${freed.join(', ')}] from P${pid}. P${pid} rolled back. Available = [${App.available.join(', ')}]`,'ok');
  rerunAfterRecovery(pid,'preempted');
});

$('btn-rollback').addEventListener('click',()=>{
  if(!App.detectResult||App.detectResult.deadlocked.length===0){toast('Run detection first','error');return;}
  clearLog('recovery-log');
  App.detectResult.deadlocked.forEach(pid=>{
    for(let j=0;j<App.m;j++){
      App.available[j]+=App.allocation[pid][j];
      App.allocation[pid][j]=0;
    }
    addLogLine('recovery-log',`P${pid} rolled back to initial state.`,'step');
  });
  addLogLine('recovery-log',`All deadlocked processes rolled back. Available = [${App.available.join(', ')}]`,'ok');
  // re-detect
  try{ App.need=calcNeed(App.allocation,App.maximum,App.n,App.m); }catch(e){}
  const newResult=detectDeadlock(App.allocation,App.need,App.available,App.n,App.m);
  if(newResult.deadlocked.length===0){
    addLogLine('recovery-log','✅ Deadlock resolved after rollback.','ok');
    toast('Rollback successful — no more deadlock!','success');
  } else {
    addLogLine('recovery-log',`⚠ Still deadlocked: ${newResult.deadlocked.map(i=>`P${i}`).join(', ')}`,'err');
    toast('Still deadlocked after rollback','error');
  }
  show('recovery-log-card');
});

function rerunAfterRecovery(pid, action){
  try{ App.need=calcNeed(App.allocation,App.maximum,App.n,App.m); }catch(e){}
  const result=detectDeadlock(App.allocation,App.need,App.available,App.n,App.m);
  if(result.deadlocked.length===0){
    addLogLine('recovery-log',`✅ No more deadlock after ${action} P${pid}!`,'ok');
    toast(`Recovery successful — P${pid} ${action}!`,'success');
    $('recovery-banner').innerHTML=`<div style="color:var(--green);font-weight:700">✅ Deadlock Resolved</div>`;
  } else {
    addLogLine('recovery-log',`Still deadlocked: ${result.deadlocked.map(i=>`P${i}`).join(', ')}. Try another process.`,'err');
    toast(`Still deadlocked after ${action} P${pid}`,'error');
    populateRecovery(result);
  }
  show('recovery-log-card');
}

/* ════════════════════════════════════════════
   12.  RESOURCE ALLOCATION GRAPH (Canvas)
════════════════════════════════════════════ */
let ragZoom=1;
$('rag-zoom-in').addEventListener('click',()=>{ragZoom=Math.min(ragZoom+0.15,2.5);drawRAG();});
$('rag-zoom-out').addEventListener('click',()=>{ragZoom=Math.max(ragZoom-0.15,0.4);drawRAG();});
$('rag-refresh').addEventListener('click',()=>drawRAG());

function drawRAG(){
  const canvas=$('rag-canvas');
  const isDark = document.documentElement.getAttribute('data-theme')!=='light';
  const W=canvas.width, H=canvas.height;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);

  // Background
  ctx.fillStyle = isDark?'#06080f':'#f0f4ff';
  ctx.fillRect(0,0,W,H);

  // Grid dots
  ctx.fillStyle = isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)';
  for(let x=20;x<W;x+=30) for(let y=20;y<H;y+=30){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}

  const n=App.n, m=App.m;
  if(!n||!m||!App.allocation.length) return;

  const cx=W/2, cy=H/2, R=Math.min(W,H)*0.35*ragZoom;

  // Calculate positions
  // Processes on left arc, Resources on right arc
  const procPos=[], resPos=[];
  for(let i=0;i<n;i++){
    const angle = -Math.PI/2 + (i/(Math.max(n-1,1)))*Math.PI;
    procPos.push({x:cx-R*0.6+Math.cos(angle)*R*0.45, y:cy+Math.sin(angle)*R*0.7});
  }
  for(let j=0;j<m;j++){
    const angle = -Math.PI/2 + (j/(Math.max(m-1,1)))*Math.PI;
    resPos.push({x:cx+R*0.6+Math.cos(angle)*R*0.35, y:cy+Math.sin(angle)*R*0.7});
  }

  // Detect deadlocked
  const deadlocked = App.detectResult ? App.detectResult.deadlocked : [];

  // Arrow helper
  function arrow(x1,y1,x2,y2,color,dashed=false){
    const angle=Math.atan2(y2-y1,x2-x1);
    const len=Math.sqrt((x2-x1)**2+(y2-y1)**2);
    const shorten=22;
    const ex=x2-Math.cos(angle)*shorten, ey=y2-Math.sin(angle)*shorten;
    const sx=x1+Math.cos(angle)*shorten, sy=y1+Math.sin(angle)*shorten;
    ctx.beginPath();
    if(dashed){ctx.setLineDash([5,4]);}else{ctx.setLineDash([]);}
    ctx.moveTo(sx,sy); ctx.lineTo(ex,ey);
    ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke();
    ctx.setLineDash([]);
    // head
    const hw=9;
    ctx.beginPath();
    ctx.moveTo(ex,ey);
    ctx.lineTo(ex-hw*Math.cos(angle-0.4),ey-hw*Math.sin(angle-0.4));
    ctx.lineTo(ex-hw*Math.cos(angle+0.4),ey-hw*Math.sin(angle+0.4));
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  }

  // Draw edges
  for(let i=0;i<n;i++){
    for(let j=0;j<m;j++){
      const dead = deadlocked.includes(i);
      // Allocation: Resource → Process (green / red if deadlocked)
      if(App.allocation[i]&&App.allocation[i][j]>0){
        const c=dead?'#f43f5e':'#34d399';
        arrow(resPos[j].x,resPos[j].y,procPos[i].x,procPos[i].y,c,dead);
      }
      // Request/Need: Process → Resource (blue dashed / red if deadlocked)
      if(App.need[i]&&App.need[i][j]>0){
        const c=dead?'#fb7185':'#818cf8';
        arrow(procPos[i].x,procPos[i].y,resPos[j].x,resPos[j].y,c,true);
      }
    }
  }

  // Draw Resource nodes (squares)
  for(let j=0;j<m;j++){
    const {x,y}=resPos[j];
    const grd=ctx.createRadialGradient(x,y,0,x,y,22);
    grd.addColorStop(0,'rgba(251,191,36,0.3)'); grd.addColorStop(1,'rgba(251,191,36,0.05)');
    ctx.fillStyle=grd;
    ctx.beginPath(); ctx.roundRect(x-18,y-18,36,36,5);
    ctx.fill();
    ctx.strokeStyle='#fbbf24'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(x-18,y-18,36,36,5); ctx.stroke();
    // Available dots
    const avail=App.available[j]||0;
    for(let d=0;d<Math.min(avail,6);d++){
      ctx.beginPath(); ctx.arc(x-12+d*5,y+22,3,0,Math.PI*2);
      ctx.fillStyle='rgba(251,191,36,0.6)'; ctx.fill();
    }
    ctx.fillStyle='#fbbf24'; ctx.font=`bold 12px 'JetBrains Mono',monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`R${j}`,x,y);
  }

  // Draw Process nodes (circles)
  for(let i=0;i<n;i++){
    const {x,y}=procPos[i];
    const dead=deadlocked.includes(i);
    const nodeColor=dead?'#f87171':'#38bdf8';
    const grd=ctx.createRadialGradient(x,y,0,x,y,22);
    grd.addColorStop(0,dead?'rgba(248,113,113,0.25)':'rgba(56,189,248,0.2)');
    grd.addColorStop(1,dead?'rgba(248,113,113,0.02)':'rgba(56,189,248,0.02)');
    ctx.fillStyle=grd;
    ctx.beginPath(); ctx.arc(x,y,20,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=nodeColor; ctx.lineWidth=dead?2.5:1.5;
    if(dead){ctx.setLineDash([4,3]);}
    ctx.beginPath(); ctx.arc(x,y,20,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=nodeColor; ctx.font=`bold 12px 'JetBrains Mono',monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`P${i}`,x,y);
    if(dead){
      ctx.fillStyle='#f43f5e'; ctx.font=`bold 9px sans-serif`;
      ctx.fillText('DL',x,y+14);
    }
  }

  // Labels
  ctx.fillStyle=isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.3)';
  ctx.font=`11px 'JetBrains Mono',monospace`; ctx.textAlign='center';
  ctx.fillText('PROCESSES',cx-R*0.6,20);
  ctx.fillText('RESOURCES',cx+R*0.6,20);

  // RAG info update
  $('rag-info').innerHTML=`
    <span style="font-family:var(--f-mono);font-size:0.78rem;color:var(--tx3)">
      ${n} processes · ${m} resource types · 
      ${deadlocked.length===0?'<span style="color:var(--green)">No deadlock</span>':'<span style="color:var(--red)">'+deadlocked.length+' deadlocked</span>'}
    </span>`;
}

/* ════════════════════════════════════════════
   13.  DEMO + RESET
════════════════════════════════════════════ */
$('btn-demo').addEventListener('click',()=>{
  App.n=DEMO.n; App.m=DEMO.m;
  $('num-proc').textContent=DEMO.n;
  $('num-res').textContent=DEMO.m;
  initMatrices(deepCopy(DEMO.allocation), deepCopy(DEMO.maximum), [...DEMO.available]);
  hide('result-area'); hide('step-panel'); hide('detect-result');
  hide('recovery-options'); show('recovery-intro');
  $('recovery-intro').querySelector('.hint-text').textContent='Run Deadlock Detection first to identify deadlocked processes.';
  clearLog('log-scroll'); $('log-scroll').innerHTML='<div class="log-placeholder">Demo data loaded. Click "Run Banker\'s" to start.</div>';
  toast('Demo data loaded — 5 processes, 3 resources','info');
});

$('btn-reset').addEventListener('click',()=>{
  App.n=5; App.m=3;
  $('num-proc').textContent=5; $('num-res').textContent=3;
  initMatrices();
  App.safeResult=null; App.detectResult=null;
  App.selectedTerminate=-1; App.selectedPreempt=-1;
  hide('result-area'); hide('step-panel'); hide('detect-result');
  hide('recovery-options'); show('recovery-intro');
  $('recovery-intro').querySelector('.hint-text').textContent='Run Deadlock Detection first to identify deadlocked processes.';
  clearLog('log-scroll'); $('log-scroll').innerHTML='<div class="log-placeholder">Run the algorithm to see step-by-step explanations here...</div>';
  toast('Reset complete','info');
});

$('clear-log').addEventListener('click',()=>{
  clearLog('log-scroll');
  $('log-scroll').innerHTML='<div class="log-placeholder">Log cleared.</div>';
});

/* ════════════════════════════════════════════
   14.  THEME TOGGLE
════════════════════════════════════════════ */
$('theme-toggle').addEventListener('click',()=>{
  const html=document.documentElement;
  const isDark=html.getAttribute('data-theme')!=='light';
  html.setAttribute('data-theme',isDark?'light':'dark');
  if(App.allocation.length) drawRAG();
  toast(`Switched to ${isDark?'light':'dark'} mode`,'info');
});

/* ════════════════════════════════════════════
   15.  EXPORT (screenshot)
════════════════════════════════════════════ */
$('btn-export').addEventListener('click',async()=>{
  toast('Capturing screenshot…','info');
  try{
    const canvas = await html2canvas(document.body,{
      backgroundColor:document.documentElement.getAttribute('data-theme')==='light'?'#f0f4ff':'#080c14',
      scale:1.5, useCORS:true,
    });
    const link=document.createElement('a');
    link.download='deadlock-toolkit.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
    toast('Screenshot saved!','success');
  }catch(e){ toast('Export failed: '+e.message,'error'); }
});

/* ════════════════════════════════════════════
   16.  KEYBOARD SHORTCUTS
════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  switch(e.key.toLowerCase()){
    case 'r': $('btn-run').click(); break;
    case 'd': $('btn-demo').click(); break;
    case 't': $('theme-toggle').click(); break;
    case '?': $('kb-hint').style.display=$('kb-hint').style.display==='none'?'flex':'none'; break;
    case 'arrowright':
      if(!$('step-panel').classList.contains('hidden')) $('step-next').click(); break;
    case 'arrowleft':
      if(!$('step-panel').classList.contains('hidden')) $('step-prev').click(); break;
  }
});

/* ════════════════════════════════════════════
   17.  BACKGROUND PARTICLE SYSTEM
════════════════════════════════════════════ */
(function bgParticles(){
  const canvas=$('bg-canvas');
  const ctx=canvas.getContext('2d');
  let particles=[], W, H;

  function resize(){
    W=canvas.width=window.innerWidth;
    H=canvas.height=window.innerHeight;
  }

  function rand(a,b){return a+Math.random()*(b-a);}

  class Particle{
    constructor(){this.reset();}
    reset(){
      this.x=rand(0,W); this.y=rand(0,H);
      this.r=rand(0.5,2);
      this.vx=rand(-0.15,0.15); this.vy=rand(-0.1,0.1);
      const palettes=['38bdf8','a78bfa','f472b6','34d399','fbbf24'];
      this.hex=palettes[Math.floor(Math.random()*palettes.length)];
      this.a=rand(0.1,0.4); this.da=rand(-0.002,0.002);
    }
    update(){
      this.x+=this.vx; this.y+=this.vy;
      this.a+=this.da;
      if(this.a<0.05||this.a>0.45) this.da*=-1;
      if(this.x<0) this.x=W; if(this.x>W) this.x=0;
      if(this.y<0) this.y=H; if(this.y>H) this.y=0;
    }
    draw(){
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
      const [r,g,b]=[parseInt(this.hex.slice(0,2),16),parseInt(this.hex.slice(2,4),16),parseInt(this.hex.slice(4,6),16)];
      ctx.fillStyle=`rgba(${r},${g},${b},${this.a.toFixed(2)})`; ctx.fill();
    }
  }

  function init(){
    particles=[];
    const count=Math.min(Math.floor(W*H/18000),80);
    for(let i=0;i<count;i++) particles.push(new Particle());
  }

  function drawConnections(){
    const isDark=document.documentElement.getAttribute('data-theme')!=='light';
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<100){
          ctx.beginPath();
          ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.strokeStyle=isDark
            ?`rgba(56,189,248,${(0.04*(1-d/100)).toFixed(3)})`
            :`rgba(56,189,248,${(0.08*(1-d/100)).toFixed(3)})`;
          ctx.lineWidth=0.5; ctx.stroke();
        }
      }
    }
  }

  function loop(){
    ctx.clearRect(0,0,W,H);
    particles.forEach(p=>{p.update();p.draw();});
    drawConnections();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize',()=>{resize();init();});
  resize(); init(); loop();
})();

/* ════════════════════════════════════════════
   18.  UTILITIES
════════════════════════════════════════════ */
function delay(ms){return new Promise(r=>setTimeout(r,ms));}

/* ════════════════════════════════════════════
   19.  INIT ON LOAD
════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded',()=>{
  initMatrices();
  $('btn-demo').click(); // load demo data by default for immediate wow factor
});

/*
╔══════════════════════════════════════════════════════════════╗
║  SAMPLE INPUT — Classic OS Textbook Example                  ║
╠══════════════════════════════════════════════════════════════╣
║  Processes: 5   |   Resource Types: 3                        ║
║                                                              ║
║  ALLOCATION:      MAXIMUM:           AVAILABLE: [3,3,2]      ║
║  P0: 0,1,0       P0: 7,5,3                                   ║
║  P1: 2,0,0       P1: 3,2,2                                   ║
║  P2: 3,0,2       P2: 9,0,2                                   ║
║  P3: 2,1,1       P3: 2,2,2                                   ║
║  P4: 0,0,2       P4: 4,3,3                                   ║
║                                                              ║
║  EXPECTED OUTPUT:                                            ║
║  Need Matrix (Max - Allocation):                             ║
║  P0: 7,4,3  P1: 1,2,2  P2: 6,0,0  P3: 0,1,1  P4: 4,3,1    ║
║                                                              ║
║  SAFE STATE ✓                                                ║
║  Safe Sequence: P1 → P3 → P4 → P0 → P2                      ║
╚══════════════════════════════════════════════════════════════╝
*/
