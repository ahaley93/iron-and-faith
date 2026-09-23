(() => {
  "use strict";

  const cfg = window.GYM_BUDDY_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = id => document.getElementById(id);
  const inviteToken = new URL(window.location.href).searchParams.get("invite")?.trim() || "";
  let inviteInfo = null;
  let membership = null;
  let team = null;

  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const fmt = value => value ? new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value)) : "";

  function toast(message, bad = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.style.background = bad ? "#7d3939" : "#2a382f";
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function appBaseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function inviteUrl(token) {
    const u = new URL(appBaseUrl());
    u.searchParams.set("invite", token);
    return u.toString();
  }

  async function validateInvite() {
    if (!inviteToken) return false;
    const { data, error } = await sb.rpc("validate_team_invite", { p_token: inviteToken });
    if (error) return false;
    const row = Array.isArray(data) ? data[0] : data;
    inviteInfo = row?.valid ? row : null;
    return !!inviteInfo;
  }

  function ensureAuthNotice(valid) {
    const card = document.querySelector("#authScreen .auth-card");
    if (!card) return;
    let notice = $("secureInviteNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "secureInviteNotice";
      notice.className = "secure-invite-notice";
      const segmented = card.querySelector(".segmented");
      card.insertBefore(notice, segmented || null);
    }

    if (valid) {
      notice.innerHTML = `<div class="eyebrow">Secure invitation</div>
        <strong>You’ve been invited to ${esc(inviteInfo.team_name || "Iron & Faith")}.</strong>
        <p>Sign in if you already have an account, or create one with the exact email address this invitation was issued to. This link can be used once and expires ${esc(fmt(inviteInfo.expires_at))}.</p>`;
    } else if (inviteToken) {
      notice.innerHTML = `<div class="eyebrow">Invitation unavailable</div>
        <strong>This invite is invalid, expired, already used, or revoked.</strong>
        <p>Ask the team owner for a new secure invitation.</p>`;
    } else {
      notice.innerHTML = `<div class="eyebrow">Invite only</div>
        <strong>Iron & Faith membership is invitation-only.</strong>
        <p>Existing members can sign in below. New members need a one-time invitation link from the team owner.</p>`;
    }
  }

  function configureAuth(valid) {
    const signupTab = document.querySelector('[data-auth-tab="signup"]');
    const loginTab = document.querySelector('[data-auth-tab="login"]');
    const signupForm = $("signupForm");
    if (!signupTab || !loginTab || !signupForm) return;

    ensureAuthNotice(valid);

    if (!valid) {
      signupTab.style.display = "none";
      signupForm.classList.add("hidden");
      loginTab.classList.add("active");
    } else {
      signupTab.style.display = "";
    }

    signupForm.onsubmit = async event => {
      event.preventDefault();
      if (!inviteInfo) {
        toast("A valid one-time invitation is required to create an account.", true);
        return;
      }

      const email = $("signupEmail")?.value.trim();
      const password = $("signupPassword")?.value;
      if (!email || !password) return;

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: inviteUrl(inviteToken) }
      });

      if (error) {
        toast(error.message, true);
        return;
      }

      if (data?.session) {
        window.location.reload();
      } else {
        toast("Account created. Confirm your email, then the confirmation link will return you to this secure invitation.");
      }
    };
  }

  function configureTeamScreen(valid) {
    const screen = $("teamScreen");
    const createForm = $("createTeamForm");
    const joinForm = $("joinTeamForm");
    const segmented = screen?.querySelector(".segmented");
    if (!screen || !createForm || !joinForm) return;

    if (segmented) segmented.style.display = "none";
    createForm.classList.add("hidden");

    if (!valid) {
      joinForm.classList.add("hidden");
      let blocked = $("inviteRequiredMessage");
      if (!blocked) {
        blocked = document.createElement("div");
        blocked.id = "inviteRequiredMessage";
        blocked.className = "secure-invite-notice";
        blocked.innerHTML = `<div class="eyebrow">Invite required</div>
          <strong>This account is not on a team yet.</strong>
          <p>Ask the Iron & Faith team owner for a new one-time invitation link. Team-code joining and self-service team creation are disabled.</p>`;
        screen.querySelector(".auth-card")?.insertBefore(blocked, $("teamLogoutBtn"));
      }
      return;
    }

    $("inviteRequiredMessage")?.remove();
    joinForm.classList.remove("hidden");
    joinForm.innerHTML = `
      <div class="secure-join-summary">
        <div class="eyebrow">One-time invitation</div>
        <strong>${esc(inviteInfo.team_name || "Iron & Faith")}</strong>
        <p class="muted">This invitation is email-locked and will be consumed when you join.</p>
      </div>
      <label>Your display name
        <input id="secureJoinDisplayName" required maxlength="30" placeholder="Your name" />
      </label>
      <button class="btn btn-primary full" type="submit">Join securely</button>`;

    joinForm.onsubmit = async event => {
      event.preventDefault();
      const displayName = $("secureJoinDisplayName")?.value.trim();
      if (!displayName) return;

      const { error } = await sb.rpc("join_team_by_invite", {
        p_invite_token: inviteToken,
        p_display_name: displayName
      });

      if (error) {
        toast(error.message, true);
        return;
      }

      const clean = new URL(window.location.href);
      clean.searchParams.delete("invite");
      window.history.replaceState({}, "", clean.toString());
      window.location.reload();
    };
  }

  async function loadMembership() {
    const { data: authData } = await sb.auth.getSession();
    const session = authData?.session;
    if (!session) {
      membership = null;
      team = null;
      return false;
    }

    const { data: member, error } = await sb
      .from("team_members")
      .select("team_id,user_id,display_name,role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error || !member) {
      membership = null;
      team = null;
      return false;
    }

    membership = member;
    const { data: teamRow } = await sb
      .from("teams")
      .select("id,name,invite_code")
      .eq("id", member.team_id)
      .single();
    team = teamRow || null;
    return !!team;
  }

  function invitationStatus(row) {
    if (row.used_at) return "Used";
    if (row.revoked_at) return "Revoked";
    if (new Date(row.expires_at) <= new Date()) return "Expired";
    return "Active";
  }

  async function loadInviteList() {
    const list = $("secureInviteList");
    if (!list || membership?.role !== "owner") return;

    const { data, error } = await sb
      .from("team_invites")
      .select("id,invite_email,created_at,expires_at,used_at,revoked_at")
      .eq("team_id", membership.team_id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      list.innerHTML = `<div class="muted">Could not load invitations.</div>`;
      return;
    }

    const rows = data || [];
    list.innerHTML = rows.length ? rows.map(row => {
      const status = invitationStatus(row);
      return `<div class="secure-invite-row">
        <div>
          <strong>${esc(row.invite_email)}</strong>
          <small>${esc(status)} · expires ${esc(fmt(row.expires_at))}</small>
        </div>
        ${status === "Active" ? `<button type="button" class="text-btn" data-revoke-invite="${row.id}">Revoke</button>` : ""}
      </div>`;
    }).join("") : `<div class="muted">No secure invitations created yet.</div>`;

    list.querySelectorAll("[data-revoke-invite]").forEach(button => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        const { error: revokeError } = await sb.rpc("revoke_team_invite", {
          p_invite_id: button.dataset.revokeInvite
        });
        if (revokeError) toast(revokeError.message, true);
        else {
          toast("Invitation revoked.");
          await loadInviteList();
        }
        button.disabled = false;
      });
    });
  }

  async function renderTeamInviteManager() {
    const card = $("teamInviteCard");
    if (!card) return;

    const ok = await loadMembership();
    if (!ok) {
      card.classList.add("hidden");
      return;
    }

    card.classList.remove("hidden");

    if (membership.role !== "owner") {
      card.innerHTML = `
        <div class="team-invite-copy">
          <div class="eyebrow">Your team</div>
          <h2>${esc(team.name || "Iron & Faith")}</h2>
          <p class="muted">New-member invitations are managed by the team owner. One-time invite links are email-locked and can be revoked.</p>
        </div>
        <div class="invite-code-block">
          <span class="invite-label">Team code · reference only</span>
          <code class="invite-code">${esc(team.invite_code || "—")}</code>
          <small>This code no longer grants membership.</small>
        </div>`;
      return;
    }

    card.innerHTML = `
      <div class="team-invite-copy secure-invite-copy">
        <div class="eyebrow">Secure invitations</div>
        <h2>${esc(team.name || "Iron & Faith")}</h2>
        <p class="muted">Create a one-time, email-locked invitation. The link expires automatically and can be revoked before it is used.</p>
        <div class="secure-invite-form">
          <label>Invite email
            <input id="secureInviteEmail" type="email" autocomplete="email" placeholder="friend@example.com" required />
          </label>
          <label>Expires
            <select id="secureInviteExpiry">
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168" selected>7 days</option>
              <option value="336">14 days</option>
            </select>
          </label>
          <button id="createSecureInviteBtn" class="btn btn-primary" type="button">Create secure invite</button>
        </div>
        <div id="secureInviteOutput" class="secure-invite-output hidden"></div>
        <div class="secure-invite-history">
          <div class="invite-label">Recent invitations</div>
          <div id="secureInviteList"></div>
        </div>
      </div>
      <div class="invite-code-block secure-team-code">
        <span class="invite-label">Team code · reference only</span>
        <code class="invite-code">${esc(team.invite_code || "—")}</code>
        <small>The legacy team code is retained, but direct code joining is disabled.</small>
      </div>`;

    $("createSecureInviteBtn")?.addEventListener("click", async () => {
      const button = $("createSecureInviteBtn");
      const email = $("secureInviteEmail")?.value.trim();
      const hours = Number($("secureInviteExpiry")?.value || 168);
      if (!email) {
        toast("Enter the email address you want to invite.", true);
        return;
      }

      button.disabled = true;
      button.textContent = "Creating…";

      const { data, error } = await sb.rpc("create_team_invite", {
        p_invite_email: email,
        p_expires_hours: hours
      });

      button.disabled = false;
      button.textContent = "Create secure invite";

      if (error) {
        toast(error.message, true);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.invite_token) {
        toast("Invite was created, but the secure link could not be displayed.", true);
        return;
      }

      const link = inviteUrl(row.invite_token);
      const output = $("secureInviteOutput");
      output.classList.remove("hidden");
      output.innerHTML = `
        <div class="invite-label">One-time invite for ${esc(row.invite_email)}</div>
        <input id="secureInviteLink" readonly value="${esc(link)}" />
        <div class="invite-actions">
          <button id="copySecureInviteBtn" class="btn btn-primary" type="button">Copy link</button>
          <button id="shareSecureInviteBtn" class="btn btn-secondary" type="button">Share</button>
        </div>
        <small>Save or send this link now. For security, the full token is not stored where it can be retrieved later.</small>`;

      $("copySecureInviteBtn")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast("Secure invite link copied.");
        } catch {
          window.prompt("Copy this secure invite link:", link);
        }
      });

      $("shareSecureInviteBtn")?.addEventListener("click", async () => {
        const shareText = `You’re invited to ${team.name || "Iron & Faith"}. Use this one-time link and sign up with ${row.invite_email}.`;
        if (navigator.share) {
          try {
            await navigator.share({ title: "Iron & Faith invitation", text: shareText, url: link });
            return;
          } catch (error) {
            if (error?.name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(`${shareText}\n${link}`);
          toast("Secure invitation copied.");
        } catch {
          window.prompt("Copy and send this secure invitation:", `${shareText}\n${link}`);
        }
      });

      $("secureInviteEmail").value = "";
      await loadInviteList();
    });

    await loadInviteList();
  }

  async function install() {
    const valid = await validateInvite();
    configureAuth(valid);
    configureTeamScreen(valid);
    await renderTeamInviteManager();

    sb.auth.onAuthStateChange(() => {
      setTimeout(async () => {
        const stillValid = await validateInvite();
        configureAuth(stillValid);
        configureTeamScreen(stillValid);
        await renderTeamInviteManager();
      }, 150);
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setTimeout(renderTeamInviteManager, 100);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
