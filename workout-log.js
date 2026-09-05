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
