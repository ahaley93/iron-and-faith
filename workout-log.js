(() => {
  "use strict";

  const cfg = window.GYM_BUDDY_CONFIG || {};
  const $ = id => document.getElementById(id);
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let session = null;
  let membership = null;
  let members = [];

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  async function loadContext() {
    const { data: authData } = await sb.auth.getSession();
    session = authData.session;
    if (!session) return false;

    const { data: member, error: memberError } = await sb
      .from("team_members")
      .select("team_id,user_id,display_name")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (memberError || !member) return false;
    membership = member;

    const { data: teamMembers, error: teamError } = await sb
      .from("team_members")
      .select("user_id,display_name")
      .eq("team_id", membership.team_id)
      .order("joined_at");
    if (teamError) return false;
    members = teamMembers || [];
    return true;
  }

  async function loadWorkoutLogs() {
    const textarea = $("workoutDetails");
    const feed = $("todayWorkoutFeed");
    if (!textarea || !feed) return;
    if (!membership && !(await loadContext())) return;

    const { data: rows, error } = await sb
      .from("daily_checkins")
      .select("user_id,workout_details,workout_done,updated_at")
      .eq("team_id", membership.team_id)
      .eq("checkin_date", today());

    if (error) {
      feed.innerHTML = `<div class="card form-card muted">Could not load today's workout logs.</div>`;
      return;
    }

    const logs = rows || [];
    const mine = logs.find(r => r.user_id === session.user.id);
    if (document.activeElement !== textarea) textarea.value = mine?.workout_details || "";

    feed.innerHTML = members.map(member => {
      const row = logs.find(r => r.user_id === member.user_id);
      const details = row?.workout_details?.trim();
      return `<article class="card workout-log-card">
        <div class="eyebrow">${member.user_id === session.user.id ? "Your workout" : "Partner workout"}</div>
        <h3>${esc(member.display_name)}</h3>
        ${details
          ? `<pre class="workout-log-text">${esc(details)}</pre>`
          : `<div class="workout-log-empty">No workout details saved for today yet.</div>`}
      </article>`;
    }).join("");
  }

  async function saveWorkoutLog() {
    const textarea = $("workoutDetails");
    if (!textarea) return;
    if (!membership && !(await loadContext())) return;

    const details = textarea.value.trim() || null;
    const payload = {
      team_id: membership.team_id,
      user_id: session.user.id,
      checkin_date: today(),
      workout_details: details,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb
      .from("daily_checkins")
      .upsert(payload, { onConflict: "user_id,checkin_date" });

    const status = $("workoutLogStatus");
    if (status) status.textContent = error ? "Workout log could not be saved." : "Workout log saved.";
    if (!error) setTimeout(loadWorkoutLogs, 250);
  }

  function install() {
    const form = $("dailyForm");
    const textarea = $("workoutDetails");
    if (!form || !textarea) return;

    if (!$("workoutLogStatus")) {
      const status = document.createElement("div");
      status.id = "workoutLogStatus";
      status.className = "workout-log-status";
      textarea.closest(".workout-entry")?.appendChild(status);
    }

    form.addEventListener("submit", () => { saveWorkoutLog(); });
    window.addEventListener("focus", () => loadWorkoutLogs());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loadWorkoutLogs(); });
    loadWorkoutLogs();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();

(() => {
  "use strict";

  const cfg = window.GYM_BUDDY_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = id => document.getElementById(id);
  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const categories = ["Fitness","Spiritual","Career","Family","Financial","Health","Personal Growth","Relationships","Education","Other"];
  let session = null;
  let membership = null;
  let members = [];

  const formatDate = value => {
    if (!value) return "";
    return new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(`${value}T12:00:00`));
  };

  async function context() {
    const { data: authData } = await sb.auth.getSession();
    session = authData.session;
    if (!session) return false;
    const { data: member } = await sb.from("team_members").select("team_id,user_id,display_name").eq("user_id",session.user.id).maybeSingle();
    if (!member) return false;
    membership = member;
    const { data: teamMembers } = await sb.from("team_members").select("user_id,display_name").eq("team_id",member.team_id).order("joined_at");
    members = teamMembers || [];
    return true;
  }

  function memberName(id) {
    return members.find(m => m.user_id === id)?.display_name || "Teammate";
  }

  function buildGoalForm() {
    const oldForm = $("goalForm");
    if (!oldForm || oldForm.dataset.lifeGoals === "true") return oldForm;
    const form = oldForm.cloneNode(false);
    form.id = "goalForm";
    form.className = oldForm.className;
    form.dataset.lifeGoals = "true";
    form.innerHTML = `
      <div class="life-goal-intro">
        <div class="eyebrow">Whole-life goals</div>
        <p class="muted">Track fitness goals alongside spiritual, career, family, financial, and other goals you want accountability for.</p>
      </div>
      <div class="life-goal-grid">
        <label>Category
          <select id="goalCategory" required>${categories.map(c => `<option value="${c}">${c}</option>`).join("")}</select>
        </label>
        <label>Goal
          <input id="goalTitle" required maxlength="120" placeholder="Read Scripture every morning" />
        </label>
        <label>Measurable target <span class="optional-label">optional</span>
          <input id="goalTarget" type="number" step="0.1" placeholder="5" />
        </label>
        <label>Unit <span class="optional-label">optional</span>
          <input id="goalUnit" maxlength="20" placeholder="days/week, $, lb, hours..." />
        </label>
        <label>Target date <span class="optional-label">optional</span>
          <input id="goalDate" type="date" />
        </label>
      </div>
      <label>Why this matters
        <textarea id="goalWhy" maxlength="300" rows="3" placeholder="Why do you want your accountability partner to hold you to this?"></textarea>
      </label>
      <button class="btn btn-primary" type="submit">Add goal</button>`;
    oldForm.replaceWith(form);
    form.addEventListener("submit", saveGoal);
    return form;
  }

  async function loadGoals() {
    const list = $("goalsList");
    if (!list) return;
    if (!(await context())) return;
    const { data: goals, error } = await sb.from("goals").select("*").eq("team_id",membership.team_id).eq("is_active",true).order("created_at",{ascending:false});
    if (error) {
      list.innerHTML = `<div class="card form-card muted">Could not load goals.</div>`;
      return;
    }
    const rows = goals || [];
    list.innerHTML = rows.length ? rows.map(g => {
      const title = g.title || g.metric || "Goal";
      const category = g.category || "Fitness";
      const target = g.target != null ? `${esc(g.target)}${g.unit ? ` ${esc(g.unit)}` : ""}` : "";
      const deadline = g.target_date ? `By ${formatDate(g.target_date)}` : "";
      const detail = [target, deadline].filter(Boolean).join(" · ");
      return `<article class="goal-card card life-goal-card">
        <div class="goal-card-top">
          <span class="goal-category-pill">${esc(category)}</span>
          <span class="goal-owner">${esc(memberName(g.user_id))}${g.user_id === session.user.id ? " · You" : ""}</span>
        </div>
        <h3>${esc(title)}</h3>
        ${detail ? `<div class="goal-target-line">${detail}</div>` : ""}
        <p>${esc(g.why || "No reason added yet.")}</p>
        ${g.user_id === session.user.id ? `<button class="text-btn" type="button" data-life-goal="${g.id}">Mark complete</button>` : ""}
      </article>`;
    }).join("") : `<div class="card form-card muted">Add a fitness, spiritual, career, family, financial, or personal goal and make it visible to your accountability partner.</div>`;
    list.querySelectorAll("[data-life-goal]").forEach(btn => btn.addEventListener("click", () => completeGoal(btn.dataset.lifeGoal)));
  }

  async function saveGoal(event) {
    event.preventDefault();
    if (!(await context())) return;
    const category = $("goalCategory").value;
    const title = $("goalTitle").value.trim();
    const targetRaw = $("goalTarget").value;
    const unit = $("goalUnit").value.trim() || null;
    const payload = {
      team_id: membership.team_id,
      user_id: session.user.id,
      category,
      title,
      metric: category,
      target: targetRaw === "" ? null : Number(targetRaw),
      unit,
      target_date: $("goalDate").value || null,
      why: $("goalWhy").value.trim() || null,
      is_active: true
    };
    const { error } = await sb.from("goals").insert(payload);
    if (error) {
      const toast = $("toast");
      if (toast) { toast.textContent = error.message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"),2600); }
      return;
    }
    event.currentTarget.reset();
    $("goalCategory").value = "Fitness";
    await loadGoals();
    const toast = $("toast");
    if (toast) { toast.textContent = "Goal added."; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"),2200); }
  }

  async function completeGoal(id) {
    if (!(await context())) return;
    const { error } = await sb.from("goals").update({is_active:false,completed_at:new Date().toISOString()}).eq("id",id).eq("user_id",session.user.id);
    if (!error) await loadGoals();
  }

  function installLifeGoals() {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#1b211d");
    const form = buildGoalForm();
    if (!form) return;
    setTimeout(loadGoals, 150);
    document.addEventListener("click", event => {
      if (event.target.closest('[data-tab="goals"]')) setTimeout(loadGoals, 120);
    });
    window.addEventListener("focus", () => loadGoals());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loadGoals(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(installLifeGoals, 50));
  else setTimeout(installLifeGoals, 50);
})();
