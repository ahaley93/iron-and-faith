(() => {
  "use strict";
  const cfg = window.GYM_BUDDY_CONFIG || {};
  const $ = id => document.getElementById(id);
  const $$ = s => [...document.querySelectorAll(s)];
  const verses = [
    ["Proverbs 27:17","Iron sharpens iron; so a man sharpens his friend’s countenance."],
    ["1 Corinthians 9:24","Don’t you know that those who run in a race all run, but one receives the prize? Run like that, that you may win."],
    ["Philippians 4:13","I can do all things through Christ, who strengthens me."],
    ["Isaiah 40:31","Those who wait for Yahweh will renew their strength. They will mount up with wings like eagles."],
    ["2 Timothy 1:7","For God didn’t give us a spirit of fear, but of power, love, and self-control."],
    ["Colossians 3:23","And whatever you do, work heartily, as for the Lord and not for men."],
    ["Galatians 6:9","Let’s not be weary in doing good, for we will reap in due season if we don’t give up."],
    ["Joshua 1:9","Be strong and courageous. Don’t be afraid or dismayed, for Yahweh your God is with you wherever you go."],
    ["Ecclesiastes 4:9-10","Two are better than one, because they have a good reward for their labor. For if they fall, the one will lift up his fellow."],
    ["Hebrews 10:24","Let’s consider how to provoke one another to love and good works."],
    ["Proverbs 24:16","For a righteous man falls seven times and rises up again."],
    ["Ephesians 6:10","Finally, be strong in the Lord and in the strength of his might."],
    ["1 Corinthians 16:13","Watch! Stand firm in the faith! Be courageous! Be strong!"],
    ["Psalm 46:1","God is our refuge and strength, a very present help in trouble."],
    ["Romans 12:12","Rejoicing in hope; enduring in troubles; continuing steadfastly in prayer."]
  ];
  const state = { sb:null, session:null, membership:null, team:null, members:[], daily:[], weekly:[], goals:[], notes:[], install:null };

  function iso(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
  function weekStart(d=new Date()){const x=new Date(d);const day=x.getDay();x.setDate(x.getDate()+(day===0?-6:1-day));x.setHours(0,0,0,0);return x}
  function fmt(d,o={month:"short",day:"numeric"}){return new Intl.DateTimeFormat(undefined,o).format(d)}
  function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
  function uid(){return state.session?.user?.id}
  function show(id){["setupScreen","authScreen","teamScreen","mainScreen"].forEach(x=>$(x).classList.add("hidden"));$(id).classList.remove("hidden")}
  function toast(msg,bad=false){const t=$("toast");t.textContent=msg;t.style.background=bad?"#8b3636":"#172019";t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2600)}
  function val(id){const v=$(id).value;return v===""?null:Number(v)}
  function memberName(id){return state.members.find(m=>m.user_id===id)?.display_name||"Teammate"}
  function setVerse(){const n=Math.floor(Date.now()/86400000)%verses.length,[r,t]=verses[n];["verseRef","authVerseRef"].forEach(x=>$(x).textContent=r);["verseText","authVerseText"].forEach(x=>$(x).textContent=t)}

  async function init(){
    setVerse(); $("appName").textContent=cfg.appName||"Iron & Faith";
    if("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(()=>{});
    window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.install=e;$("installBtn").classList.remove("hidden")});
    if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase){show("setupScreen");return}
    state.sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    const {data}=await state.sb.auth.getSession();state.session=data.session;
    state.sb.auth.onAuthStateChange((_e,s)=>state.session=s);
    if(!state.session){show("authScreen");return}
    await enter();
  }

  async function enter(){
    try{
      const {data,error}=await state.sb.from("team_members").select("*").eq("user_id",uid()).maybeSingle();
      if(error) throw error;
      if(!data){show("teamScreen");return}
      state.membership=data;await refresh();show("mainScreen");render();
    }catch(e){toast(e.message||"Could not load app",true)}
  }

  async function refresh(){
    const teamId=state.membership.team_id, ws=iso(weekStart()), old=new Date(weekStart());old.setDate(old.getDate()-84);
    const [a,b,c,d,e,f]=await Promise.all([
      state.sb.from("teams").select("*").eq("id",teamId).single(),
      state.sb.from("team_members").select("*").eq("team_id",teamId).order("joined_at"),
      state.sb.from("daily_checkins").select("*").eq("team_id",teamId).gte("checkin_date",ws).order("checkin_date"),
      state.sb.from("weekly_progress").select("*").eq("team_id",teamId).gte("week_start",iso(old)).order("week_start"),
      state.sb.from("goals").select("*").eq("team_id",teamId).eq("is_active",true).order("created_at",{ascending:false}),
      state.sb.from("encouragements").select("*").eq("team_id",teamId).order("created_at",{ascending:false}).limit(40)
    ]);
    for(const r of [a,b,c,d,e,f]) if(r.error) throw r.error;
    state.team=a.data;state.members=b.data||[];state.daily=c.data||[];state.weekly=d.data||[];state.goals=e.data||[];state.notes=f.data||[];
  }

  function render(){
    const ws=weekStart(),we=new Date(ws);we.setDate(we.getDate()+6);
    $("teamNameLabel").textContent=state.team?.name||"Accountability";
    $("weekRange").textContent=`${fmt(ws)} – ${fmt(we,{month:"short",day:"numeric",year:"numeric"})}`;
    $("todayDate").textContent=fmt(new Date(),{weekday:"short",month:"short",day:"numeric"});
    $("welcomeLine").textContent=`${memberName(uid())}, keep the promise you made this week.`;
    renderDaily();renderMembers();renderWeekly();renderGoals();renderNotes();renderTrend();
  }

  function dayStats(id){
    const rows=state.daily.filter(x=>x.user_id===id),elapsed=Math.min(7,Math.floor((new Date().setHours(0,0,0,0)-weekStart())/86400000)+1),checks=new Set(rows.map(x=>x.checkin_date)).size;
    return {checks,workouts:rows.filter(x=>x.workout_done).length,faith:rows.filter(x=>x.prayer_done).length,pct:Math.min(100,Math.round(checks/elapsed*100)||0)};
  }
  function renderMembers(){
    $("teamPulse").innerHTML=state.members.map(m=>{const s=dayStats(m.user_id);return `<div class="pulse-row"><span>●</span><span><b>${esc(m.display_name)}</b> — ${s.checks} check-ins · ${s.workouts} workouts</span></div>`}).join("");
    $("memberCards").innerHTML=state.members.map(m=>{const s=dayStats(m.user_id);return `<article class="member-card card"><div class="member-top"><div class="member-name"><div class="member-initial">${esc(m.display_name[0]?.toUpperCase()||"?")}</div><div><b>${esc(m.display_name)}${m.user_id===uid()?" · You":""}</b><br><small class="muted">This week</small></div></div><div class="score-ring" style="--pct:${s.pct}"><strong>${s.pct}%</strong></div></div><div class="stats-row"><div class="stat"><b>${s.checks}</b><span>Check-ins</span></div><div class="stat"><b>${s.workouts}</b><span>Workouts</span></div><div class="stat"><b>${s.faith}</b><span>Faith days</span></div></div></article>`}).join("");
  }

  function renderDaily(){const r=state.daily.find(x=>x.user_id===uid()&&x.checkin_date===iso());
    $("workoutDone").checked=!!r?.workout_done;$("nutritionOnTrack").checked=!!r?.nutrition_on_track;$("prayerDone").checked=!!r?.prayer_done;$("mobilityDone").checked=!!r?.mobility_done;
    $("waterOz").value=r?.water_oz??"";$("steps").value=r?.steps??"";$("sleepHours").value=r?.sleep_hours??"";$("energy").value=r?.energy??"";$("dailyNote").value=r?.note??"";}

  function renderWeekly(){const r=state.weekly.find(x=>x.user_id===uid()&&x.week_start===iso(weekStart()));
    $("weight").value=r?.weight??"";$("bodyFat").value=r?.body_fat??"";$("waist").value=r?.waist??"";$("trainingSessions").value=r?.training_sessions??"";$("weeklyWin").value=r?.win??"";$("weeklyCommitment").value=r?.commitment??"";
    const rows=[...state.weekly].sort((a,b)=>b.week_start.localeCompare(a.week_start)).slice(0,12);
    $("weeklyHistory").innerHTML=rows.length?rows.map(r=>`<article class="history-item card"><b>${esc(memberName(r.user_id))} · ${fmt(new Date(r.week_start+"T12:00:00"),{month:"short",day:"numeric",year:"numeric"})}</b><div class="muted">${[r.weight!=null?`${r.weight} lb`:null,r.body_fat!=null?`${r.body_fat}% BF`:null,r.waist!=null?`${r.waist} in`:null,r.training_sessions!=null?`${r.training_sessions} sessions`:null].filter(Boolean).join(" · ")||"No measurements"}</div><p>${r.win?`<b>Win:</b> ${esc(r.win)} `:""}${r.commitment?`<b>Next:</b> ${esc(r.commitment)}`:""}</p></article>`).join(""):`<div class="card form-card muted">No weekly reviews yet.</div>`;
  }

  function renderTrend(){const metric=$("chartMetric").value, rows=state.weekly.filter(x=>x[metric]!=null).slice(-12);$("chartLegend").innerHTML=state.members.map(m=>`<span class="muted">● ${esc(m.display_name)}</span>`).join(" &nbsp; ");$("progressChart").innerHTML=rows.length?`<table class="trend-table"><thead><tr><th>Week</th><th>Member</th><th>${esc(metric.replace("_"," "))}</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmt(new Date(r.week_start+"T12:00:00"))}</td><td>${esc(memberName(r.user_id))}</td><td>${esc(r[metric])}</td></tr>`).join("")}</tbody></table>`:`<div class="muted">Add weekly measurements to see the trend.</div>`}

  function renderGoals(){
    $("goalsList").innerHTML=state.goals.length?state.goals.map(g=>`<article class="goal-card card"><div class="eyebrow">${esc(memberName(g.user_id))}</div><h3>${esc(g.target)} ${esc(g.unit)}</h3><div class="goal-meta">${esc(g.metric)}${g.target_date?` · by ${fmt(new Date(g.target_date+"T12:00:00"),{month:"short",day:"numeric",year:"numeric"})}`:""}</div><p>${esc(g.why||"No reason added yet.")}</p>${g.user_id===uid()?`<button class="text-btn" data-goal="${g.id}">Mark complete</button>`:""}</article>`).join(""):`<div class="card form-card muted">Add a goal and make it visible to your accountability partner.</div>`;
    $$('[data-goal]').forEach(b=>b.onclick=()=>completeGoal(b.dataset.goal));
  }

  function renderNotes(){const others=state.members.filter(m=>m.user_id!==uid());$("encourageTo").innerHTML=others.map(m=>`<option value="${m.user_id}">${esc(m.display_name)}</option>`).join("")||`<option value="">No teammate yet</option>`;$("encouragementFeed").innerHTML=state.notes.length?state.notes.map(n=>`<article class="feed-item card"><div class="feed-head"><b>${esc(memberName(n.from_user))} → ${esc(memberName(n.to_user))}</b><span>${fmt(new Date(n.created_at),{month:"short",day:"numeric"})}</span></div><p>${esc(n.message)}</p></article>`).join(""):`<div class="card form-card muted">No messages yet.</div>`}

  async function saveDaily(e){e.preventDefault();const p={team_id:state.membership.team_id,user_id:uid(),checkin_date:iso(),workout_done:$("workoutDone").checked,nutrition_on_track:$("nutritionOnTrack").checked,prayer_done:$("prayerDone").checked,mobility_done:$("mobilityDone").checked,water_oz:val("waterOz"),steps:val("steps"),sleep_hours:val("sleepHours"),energy:val("energy"),note:$("dailyNote").value.trim()||null,updated_at:new Date().toISOString()};const {error}=await state.sb.from("daily_checkins").upsert(p,{onConflict:"user_id,checkin_date"});if(error)return toast(error.message,true);await refresh();render();toast("Today’s check-in saved.")}
  async function saveWeekly(e){e.preventDefault();const p={team_id:state.membership.team_id,user_id:uid(),week_start:iso(weekStart()),weight:val("weight"),body_fat:val("bodyFat"),waist:val("waist"),training_sessions:val("trainingSessions"),win:$("weeklyWin").value.trim()||null,commitment:$("weeklyCommitment").value.trim()||null,updated_at:new Date().toISOString()};const {error}=await state.sb.from("weekly_progress").upsert(p,{onConflict:"user_id,week_start"});if(error)return toast(error.message,true);await refresh();render();toast("Weekly review saved.")}
  async function saveGoal(e){e.preventDefault();const p={team_id:state.membership.team_id,user_id:uid(),metric:$("goalMetric").value,target:Number($("goalTarget").value),unit:$("goalUnit").value.trim(),target_date:$("goalDate").value||null,why:$("goalWhy").value.trim()||null,is_active:true};const {error}=await state.sb.from("goals").insert(p);if(error)return toast(error.message,true);e.currentTarget.reset();await refresh();renderGoals();toast("Goal added.")}
  async function completeGoal(id){const {error}=await state.sb.from("goals").update({is_active:false,completed_at:new Date().toISOString()}).eq("id",id).eq("user_id",uid());if(error)return toast(error.message,true);await refresh();renderGoals();toast("Goal complete.")}
  async function sendNote(e){e.preventDefault();const to=$("encourageTo").value,msg=$("encourageMessage").value.trim();if(!to||!msg)return toast("Choose a teammate and write a message.",true);const {error}=await state.sb.from("encouragements").insert({team_id:state.membership.team_id,from_user:uid(),to_user:to,message:msg});if(error)return toast(error.message,true);$("encourageMessage").value="";await refresh();renderNotes();toast("Encouragement sent.")}

  async function createTeam(e){e.preventDefault();const {data,error}=await state.sb.rpc("create_team",{p_team_name:$("teamName").value.trim(),p_display_name:$("createDisplayName").value.trim()});if(error)return toast(error.message,true);const r=Array.isArray(data)?data[0]:data;if(r?.invite_code){navigator.clipboard?.writeText(r.invite_code).catch(()=>{});toast(`Team created. Invite code: ${r.invite_code}`)}await enter()}
  async function joinTeam(e){e.preventDefault();const {error}=await state.sb.rpc("join_team_by_code",{p_invite_code:$("inviteCode").value.trim().toUpperCase(),p_display_name:$("joinDisplayName").value.trim()});if(error)return toast(error.message,true);toast("Team joined.");await enter()}
  async function login(e){e.preventDefault();const {data,error}=await state.sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error)return toast(error.message,true);state.session=data.session;await enter()}
  async function signup(e){e.preventDefault();const {data,error}=await state.sb.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value});if(error)return toast(error.message,true);if(data.session){state.session=data.session;await enter()}else toast("Account created. Check your email to confirm it.")}
  async function logout(){await state.sb.auth.signOut();state.session=null;show("authScreen")}

  $$('[data-auth-tab]').forEach(b=>b.onclick=()=>{$$('[data-auth-tab]').forEach(x=>x.classList.toggle("active",x===b));const login=b.dataset.authTab==="login";$("loginForm").classList.toggle("hidden",!login);$("signupForm").classList.toggle("hidden",login)});
  $$('[data-team-tab]').forEach(b=>b.onclick=()=>{$$('[data-team-tab]').forEach(x=>x.classList.toggle("active",x===b));const create=b.dataset.teamTab==="create";$("createTeamForm").classList.toggle("hidden",!create);$("joinTeamForm").classList.toggle("hidden",create)});
  $$('[data-tab]').forEach(b=>b.onclick=()=>{$$('[data-tab]').forEach(x=>x.classList.toggle("active",x===b));$$('.tab-page').forEach(x=>x.classList.remove("active"));$(`${b.dataset.tab}Tab`).classList.add("active");if(b.dataset.tab==="week")renderTrend();scrollTo({top:0,behavior:"smooth"})});
  $("loginForm").onsubmit=login;$("signupForm").onsubmit=signup;$("createTeamForm").onsubmit=createTeam;$("joinTeamForm").onsubmit=joinTeam;$("dailyForm").onsubmit=saveDaily;$("weeklyForm").onsubmit=saveWeekly;$("goalForm").onsubmit=saveGoal;$("encouragementForm").onsubmit=sendNote;$("chartMetric").onchange=renderTrend;$("logoutBtn").onclick=logout;$("teamLogoutBtn").onclick=logout;
  $("copyVerseBtn").onclick=()=>{const [r,t]=verses[Math.floor(Date.now()/86400000)%verses.length];navigator.clipboard?.writeText(`${r} — ${t}`).then(()=>toast("Verse copied."))};
  $("installBtn").onclick=async()=>{if(!state.install)return;state.install.prompt();await state.install.userChoice;state.install=null;$("installBtn").classList.add("hidden")};
  $("demoBtn").onclick=()=>toast("This deployed version is already connected to Supabase.");
  init();
})();
