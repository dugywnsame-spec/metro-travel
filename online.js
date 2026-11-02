// 온라인 기능: 구글 로그인 · 닉네임 · 실시간 레이스 방 · 랭킹
import {firebaseConfig} from './firebase-config.js';
const MT=window.MT;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let net=null,netErr='',user=null,profile=null,boxEl=null;
let room=null,roomCode='',players=[],unsubs=[],started=-1,resultShown=-1,statsSaved=-1,firstFinishAt=0,hbTimer=0,checkTimer=0;
const CODE_CH='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2700)}
const configured=()=>firebaseConfig&&firebaseConfig.apiKey&&!/여기/.test(firebaseConfig.apiKey);

async function boot(){
  try{
    if(new URLSearchParams(location.search).has('mock')){const m=await import('./mock-net.js');net=m.createNet()}
    else if(configured()){const m=await import('./net-firebase.js');net=await m.createNet(firebaseConfig)}
    else netErr='온라인 기능은 아직 설정 전이야. 같이 받은 설치 가이드대로 Firebase 설정값을 넣으면 켜져.';
  }catch(e){net=null;netErr='온라인 서버에 연결하지 못했어. 인터넷 연결이나 Firebase 설정을 확인해줘.'}
  MT.titleHook=el=>{boxEl=el;renderBox()};
  MT.onResult=r=>submitResult(r);
  if(net)net.onAuth(async u=>{user=u;profile=null;if(u){await net.syncClock(u.uid);profile=await net.get('scores/'+u.uid).catch(()=>null);if(!profile||!profile.name)askNickname()}renderBox()});
  const el=$('#onlineBox');if(el){boxEl=el;renderBox()}
}

/* ----- 시작 화면 안의 온라인 상자 ----- */
function renderBox(){
  if(!boxEl||!boxEl.isConnected)return;
  if(!net){boxEl.innerHTML=`<div class="net-msg">🌐 ${esc(netErr||'온라인 기능 준비 중…')}</div>`;return}
  if(!user){boxEl.innerHTML=`<div class="net-msg">🌐 로그인하면 친구와 레이스하고 랭킹에 기록이 올라가.</div>
    <div class="ob-btns"><button class="btn google" id="obLogin" type="button"><i></i>구글로 로그인</button><button class="btn" id="obRank" type="button">🏆 랭킹</button></div>`;
    $('#obLogin').onclick=async()=>{try{await net.signIn()}catch(e){toast('로그인하지 못했어: '+(e.code||e.message||''))}};
    $('#obRank').onclick=openRanking;return}
  const nm=profile&&profile.name?profile.name:'닉네임 설정 필요';
  boxEl.innerHTML=`<div class="ob-user">👤 ${esc(nm)} <small>${profile&&profile.wins?'🏆 '+profile.wins+'승':''}</small><button class="linkbtn" id="obNick" type="button">닉네임 변경</button><button class="linkbtn" id="obOut" type="button">로그아웃</button></div>
    <div class="ob-btns"><button class="btn go" id="obRace" type="button">🏁 친구와 레이스</button><button class="btn" id="obRank" type="button">🏆 랭킹</button></div>`;
  $('#obNick').onclick=askNickname;$('#obOut').onclick=()=>net.signOut();$('#obRace').onclick=openRaceMenu;$('#obRank').onclick=openRanking;
}
function backToTitle(){MT.goHome()}

/* ----- 닉네임 ----- */
function askNickname(){
  const b=MT.openPanel('닉네임',`<div class="mg-intro"><span class="mg-ico">👤</span><h2>닉네임 정하기</h2></div>
    <p>랭킹과 레이스에 보일 이름이야. 실명 말고 별명을 추천해. (최대 10자)</p>
    <div class="net-field"><input id="nkIn" maxlength="10" autocomplete="off" value="${esc(profile&&profile.name||'')}" placeholder="예: 타자왕"></div>
    <div class="net-err" id="nkErr"></div><div class="row"><button class="btn go" id="nkOk" type="button">저장</button><button class="btn" id="nkNo" type="button">나중에</button></div>`);
  const inp=$('#nkIn');inp.focus();
  const save=async()=>{const v=inp.value.trim().replace(/\s+/g,' ');if(v.length<1||v.length>10){$('#nkErr').textContent='1~10자로 정해줘';return}
    try{await net.set('scores/'+user.uid,{name:v,updatedAt:net.now()},true);profile=Object.assign(profile||{},{name:v});toast('닉네임 저장 완료');backToTitle()}catch(e){$('#nkErr').textContent='저장하지 못했어: '+(e.code||e.message)}};
  $('#nkOk').onclick=save;inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)save()});$('#nkNo').onclick=backToTitle;
}
const myName=()=>profile&&profile.name||'플레이어';

/* ----- 기록 저장 (랭킹) ----- */
async function submitResult(r){
  if(!net||!user||!profile||!profile.name)return;
  try{
    const cur=await net.get('scores/'+user.uid)||{};const up={name:profile.name,updatedAt:net.now()};let better=false;
    const tpm=Math.min(1500,Math.round(r.tpm||0));
    if((r.mode==='test'&&r.words>=10)||(r.mode==='solo'&&r.words>=20)||(r.mode==='race'&&r.words>=15)){if(tpm>(cur.bestTpm||0)){up.bestTpm=tpm;better=true}}
    if(r.mode==='solo'&&r.diff){const k='best_'+r.diff,sc=Math.min(5000000,Math.round(r.score||0));if(sc>(cur[k]||0)){up[k]=sc;better=true}}
    if(r.mode==='race'){up.races=(cur.races||0)+1;up.wins=(cur.wins||0)+(r.win?1:0);better=better||r.win}
    await net.set('scores/'+user.uid,up,true);Object.assign(profile,up);
    if(better)toast('🏆 랭킹 기록이 갱신됐어!');
  }catch(e){toast('기록을 저장하지 못했어')}
}

/* ----- 랭킹 ----- */
const BOARDS=[['bestTpm','⌨️ 최고 타수','타'],['wins','🏁 레이스 승리','승'],['best_easy','🌱 쉬움','점'],['best_normal','🚇 보통','점'],['best_hard','🔥 어려움','점'],['best_hell','💀 지옥','점']];
async function openRanking(){
  if(!net){toast(netErr);return}
  MT.openPanel('랭킹',`<div class="mg-intro"><span class="mg-ico">🏆</span><h2>전체 랭킹</h2></div>
    <div class="lb-tabs">${BOARDS.map((b,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===0}">${b[1]}</button>`).join('')}</div>
    <div class="lb-list" id="lbList"><div class="net-msg">불러오는 중…</div></div>
    <p class="net-msg">타수는 타자 측정 60초, 혼자 하기(20개 이상), 레이스에서 나온 최고 기록이야. 점수는 난이도별 혼자 하기 최고 점수.</p>
    <div class="row"><button class="btn" id="lbBack" type="button">처음 화면</button></div>`);
  MT.widePanel();
  const load=async i=>{document.querySelectorAll('.lb-tabs button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.i===i));const[f,,u]=BOARDS[i];const L=$('#lbList');L.innerHTML='<div class="net-msg">불러오는 중…</div>';
    try{const rows=await net.top('scores',f,30);L.innerHTML=rows.length?rows.map((r,k)=>`<div class="lb-row${user&&r.id===user.uid?' me':''}"><span class="lb-rank">${['🥇','🥈','🥉'][k]||k+1}</span><span>${esc(r.name||'플레이어')}</span><b>${(r[f]||0).toLocaleString()}${u}</b></div>`).join(''):'<div class="net-msg">아직 기록이 없어. 첫 번째 주인공이 되어봐!</div>'}
    catch(e){L.innerHTML='<div class="net-err">랭킹을 불러오지 못했어 ('+esc(e.code||e.message)+')</div>'}};
  document.querySelectorAll('.lb-tabs button').forEach(b=>b.onclick=()=>load(+b.dataset.i));$('#lbBack').onclick=backToTitle;load(0);
}

/* ----- 레이스 방 ----- */
function openRaceMenu(){
  if(!profile||!profile.name){askNickname();return}
  const c=MT.getCfg();
  MT.openPanel('친구와 레이스',`<div class="mg-intro"><span class="mg-ico">🏁</span><h2>친구와 레이스</h2></div>
    <p>모두 같은 역 이름을 같은 순서로 쳐. 먼저 종착역에 도착하는 사람이 이겨. 최대 8명.</p>
    <div class="sec"><p class="sec-t">방 만들기 · ${esc(c.lineName)} ${c.diffIcon} ${esc(c.diffName)}</p>
    <div class="net-field"><select id="rcCount" class="btn" style="flex:1"><option value="20">짧게 · 역 이름 20개</option><option value="30" selected>보통 · 30개</option><option value="45">길게 · 45개</option></select><button class="btn go" id="rcMake" type="button">방 만들기</button></div>
    <p class="net-msg">노선은 시작 화면에서 고른 노선으로 정해져.</p></div>
    <div class="sec"><p class="sec-t">친구 방에 들어가기</p><div class="net-field"><input id="rcCode" maxlength="5" autocomplete="off" placeholder="방 코드 5자리" style="text-transform:uppercase;letter-spacing:.15em"><button class="btn go" id="rcJoin" type="button">참가</button></div></div>
    <div class="net-err" id="rcErr"></div><div class="row"><button class="btn" id="rcBack" type="button">처음 화면</button></div>`);
  $('#rcBack').onclick=backToTitle;
  $('#rcMake').onclick=async()=>{try{await createRoom(+$('#rcCount').value)}catch(e){$('#rcErr').textContent='방을 만들지 못했어: '+(e.code||e.message)}};
  const join=async()=>{const code=$('#rcCode').value.trim().toUpperCase();if(code.length!==5){$('#rcErr').textContent='방 코드 5자리를 넣어줘';return}
    try{await joinRoom(code)}catch(e){$('#rcErr').textContent=e.message||'참가하지 못했어'}};
  $('#rcJoin').onclick=join;$('#rcCode').addEventListener('keydown',e=>{if(e.key==='Enter')join()});
}
async function createRoom(count){
  const c=MT.getCfg();let code='';
  for(let t=0;t<6;t++){code=Array.from({length:5},()=>CODE_CH[Math.floor(Math.random()*CODE_CH.length)]).join('');if(!(await net.get('rooms/'+code)))break}
  await net.set('rooms/'+code,{host:user.uid,hostName:myName(),status:'lobby',line:c.line,diff:c.diff,count,round:0,words:[],startAt:0,createdAt:net.now()});
  await enterRoom(code);
}
async function joinRoom(code){
  const r=await net.get('rooms/'+code);
  if(!r||r.status==='closed')throw new Error('그런 방이 없어. 코드를 다시 확인해줘');
  await enterRoom(code);
}
async function enterRoom(code){
  leaveRoom(true);roomCode=code;started=-1;resultShown=-1;statsSaved=-1;
  const r=await net.get('rooms/'+code);
  await net.set('rooms/'+code+'/players/'+user.uid,{name:myName(),round:r?r.round:0,done:0,total:0,tpm:0,acc:0,finishMs:null,seen:net.now(),color:pickColor(code)});
  unsubs.push(net.watchDoc('rooms/'+code,onRoom));
  unsubs.push(net.watchCol('rooms/'+code+'/players',onPlayers));
  hbTimer=setInterval(()=>{if(roomCode)net.update('rooms/'+roomCode+'/players/'+user.uid,{seen:net.now()}).catch(()=>{})},15000);
  checkTimer=setInterval(checkFinish,1000);
  addEventListener('beforeunload',unloadLeave);
}
function pickColor(code){let h=0;for(const ch of user.uid+code)h=(h*31+ch.charCodeAt(0))>>>0;return MT.OPP_COLORS[h%MT.OPP_COLORS.length]}
function unloadLeave(){if(roomCode&&user){try{net.del('rooms/'+roomCode+'/players/'+user.uid)}catch(e){}}}
function leaveRoom(silent){
  unsubs.forEach(u=>{try{u()}catch(e){}});unsubs=[];clearInterval(hbTimer);clearInterval(checkTimer);removeEventListener('beforeunload',unloadLeave);
  if(roomCode&&user){const code=roomCode,wasHost=room&&room.host===user.uid;net.del('rooms/'+code+'/players/'+user.uid).catch(()=>{});if(wasHost)net.update('rooms/'+code,{status:'closed'}).catch(()=>{})}
  roomCode='';room=null;players=[];
}
const isHost=()=>room&&user&&room.host===user.uid;
const livePlayers=()=>players.filter(p=>net.now()-(p.seen||0)<45000);

function onRoom(r){
  if(!roomCode)return;room=r;
  if(!r||r.status==='closed'){const was=roomCode;leaveRoom(true);toast('방장이 방을 닫았어');MT.leaveRaceUI();return}
  if(r.status==='lobby')renderLobby();
  if(r.status==='racing'&&started!==r.round){started=r.round;firstFinishAt=0;
    net.update('rooms/'+roomCode+'/players/'+user.uid,{round:r.round,done:0,total:r.words.length,tpm:0,acc:0,finishMs:null,seen:net.now()}).catch(()=>{});
    const round=r.round,code=roomCode;
    MT.startRace({words:r.words,line:r.line,diff:r.diff,startAt:r.startAt-(net.now()-Date.now()),
      onProgress:p=>{if(roomCode===code&&room&&room.round===round)net.update('rooms/'+code+'/players/'+user.uid,{round,done:p.done,total:p.total,tpm:p.tpm,seen:net.now()}).catch(()=>{})},
      onFinish:f=>{if(roomCode===code)net.update('rooms/'+code+'/players/'+user.uid,{round,done:f.done,total:f.total,tpm:f.tpm,acc:f.acc,finishMs:f.ms,seen:net.now()}).catch(()=>{})}});
  }
}
function onPlayers(list){
  if(!roomCode)return;players=list;
  if(room&&room.status==='lobby')renderLobby();
  if(room&&room.status==='racing'){
    const cur=raceRows();MT.raceUpdate(cur);
    if(!firstFinishAt&&cur.some(p=>p.finishMs!=null))firstFinishAt=Date.now();
    checkFinish();
  }
}
function raceRows(){
  const r=room;return livePlayers().filter(p=>p.round===r.round).map(p=>({id:p.id,name:p.name,color:p.color,done:p.done||0,total:p.total||r.words.length,tpm:p.tpm||0,finishMs:p.finishMs==null?null:p.finishMs,me:p.id===user.uid}));
}
function sortRows(rows){return rows.slice().sort((a,b)=>(a.finishMs!=null)===(b.finishMs!=null)?(a.finishMs!=null?a.finishMs-b.finishMs:b.done-a.done):(a.finishMs!=null?-1:1))}
function checkFinish(){
  if(!room||room.status!=='racing'||resultShown===room.round)return;
  const rows=raceRows();if(!rows.length)return;
  const allDone=rows.every(p=>p.finishMs!=null);const timeout=firstFinishAt&&Date.now()-firstFinishAt>60000;
  if(!allDone&&!timeout)return;
  resultShown=room.round;const sorted=sortRows(rows);
  if(statsSaved!==room.round){statsSaved=room.round;const me=sorted.find(p=>p.me);if(me)submitResult({mode:'race',tpm:me.tpm,words:me.done,win:sorted[0]===me&&me.finishMs!=null&&sorted.length>1})}
  MT.showRaceResult(sorted,{isHost:isHost(),onAgain:startRound,onLeave:()=>leaveRoom()});
}
async function startRound(){
  if(!isHost())return;const n=room.status==='lobby'&&room.round===0?1:(room.round||0)+1;
  await net.update('rooms/'+roomCode,{status:'racing',round:n,words:MT.makeRaceWords(room.line,room.count||30),startAt:net.now()+5000});
}
function renderLobby(){
  if(!room||room.status!=='lobby')return;
  const ps=livePlayers();
  const body=$('#lobbyBody')||MT.openPanel('레이스 대기실','<div id="lobbyBody"></div>');
  if(!$('#lobbyBody'))return;
  const L=ps.length;
  $('#lobbyBody').innerHTML=`<div class="mg-intro"><span class="mg-ico">🏁</span><h2>레이스 대기실</h2></div>
    <p>친구에게 이 방 코드를 알려줘. 같은 사이트에서 로그인하고 코드를 넣으면 들어와.</p>
    <div class="lobby-code" id="lbCode">${esc(roomCode)}</div>
    <div class="row"><button class="btn" id="lbCopy" type="button">코드 복사</button></div>
    <p class="net-msg">${esc(room.line)}호선 · 역 이름 ${room.count||30}개 · 방장 ${esc(room.hostName||'')}</p>
    <div class="lobby-list">${ps.map(p=>`<div><span class="rb-dot" style="background:${esc(p.color)}"></span>${esc(p.name)}${p.id===room.host?' 👑':''}${p.id===user.uid?' (나)':''}<small>대기 중</small></div>`).join('')}</div>
    <p class="net-msg">${L<2?'혼자서도 출발할 수 있지만 친구가 들어오면 더 재밌어.':L+'명 대기 중'}</p>
    <div class="row">${isHost()?'<button class="btn go" id="lbStart" type="button">🏁 출발!</button>':'<p class="net-msg" style="flex:1">방장이 출발을 누르면 5초 뒤에 시작해.</p>'}<button class="btn" id="lbLeave" type="button">나가기</button></div>`;
  $('#lbCopy').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(roomCode).then(()=>toast('방 코드를 복사했어'),()=>toast('복사가 안 되면 코드를 직접 알려줘'))};
  if(isHost())$('#lbStart').onclick=async()=>{$('#lbStart').disabled=true;try{await startRound()}catch(e){toast('출발하지 못했어');$('#lbStart').disabled=false}};
  $('#lbLeave').onclick=()=>{leaveRoom();backToTitle()};
}
boot();
