(() => {
  "use strict";

  const cfg = window.GYM_BUDDY_CONFIG || {};
  const card = document.getElementById("teamInviteCard");
  const nameEl = document.getElementById("teamInviteName");
  const codeEl = document.getElementById("teamInviteCode");
  const copyBtn = document.getElementById("copyInviteBtn");
  const shareBtn = document.getElementById("shareInviteBtn");

  if (!card || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let currentTeam = null;

  function flashButton(button, message) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = message;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1600);
  }

  async function loadTeamInvite() {
    try {
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        card.classList.add("hidden");
        currentTeam = null;
        return;
      }

      const { data: membership, error: membershipError } = await client
        .from("team_members")
        .select("team_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (membershipError || !membership) {
        card.classList.add("hidden");
        currentTeam = null;
        return;
      }

      const { data: team, error: teamError } = await client
        .from("teams")
        .select("name, invite_code")
        .eq("id", membership.team_id)
        .single();

      if (teamError || !team?.invite_code) {
        card.classList.add("hidden");
        currentTeam = null;
        return;
      }

      currentTeam = team;
      nameEl.textContent = team.name || "Accountability team";
      codeEl.textContent = team.invite_code;
      card.classList.remove("hidden");
    } catch (error) {
      console.warn("Could not load team invite code", error);
      card.classList.add("hidden");
    }
  }

  copyBtn?.addEventListener("click", async () => {
    if (!currentTeam?.invite_code) return;
    try {
      await navigator.clipboard.writeText(currentTeam.invite_code);
      flashButton(copyBtn, "Copied!");
    } catch {
      window.prompt("Copy your Iron & Faith invite code:", currentTeam.invite_code);
    }
  });

  shareBtn?.addEventListener("click", async () => {
    if (!currentTeam?.invite_code) return;
    const appUrl = "https://ahaley93.github.io/iron-and-faith/";
    const text = `Join my Iron & Faith accountability team \"${currentTeam.name}\". Invite code: ${currentTeam.invite_code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Iron & Faith invite", text, url: appUrl });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${appUrl}`);
      flashButton(shareBtn, "Invite copied!");
    } catch {
      window.prompt("Copy and send this invite:", `${text}\n${appUrl}`);
    }
  });

  client.auth.onAuthStateChange(() => setTimeout(loadTeamInvite, 0));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadTeamInvite();
  });

  loadTeamInvite();
  setTimeout(loadTeamInvite, 700);
})();
