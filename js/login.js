(() => {
  "use strict";
  const client = window.supabaseClient;
  const app = document.getElementById("app");

  function esc(v) { return window.PM.escape(v); }

  function render(mode = "login", message = "") {
    const signup = mode === "signup";
    const reset = mode === "reset";

    app.innerHTML = `
      <div class="auth-page">
        <div class="auth-logo">P</div>
        <h1>Personal Manager</h1>
        <p class="auth-subtitle">${reset ? "Reset your password" : signup ? "Create your account" : "Welcome back"}</p>
        ${message ? `<div class="auth-error">${esc(message)}</div>` : ""}
        ${signup ? `<div class="field"><label>Name</label><input id="authName" type="text" autocomplete="name" placeholder="Your name"></div>` : ""}
        <div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>
        ${reset ? "" : `<div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="At least 6 characters"></div>`}
        ${signup ? `<div class="field"><label>Confirm password</label><input id="authConfirm" type="password" autocomplete="new-password" placeholder="Re-enter password"></div>` : ""}
        <button class="btn primary" id="authSubmit" type="button" style="width:100%;margin-top:8px">
          ${reset ? "Send Reset Email" : signup ? "Create Account" : "Login"}
        </button>
        ${!reset ? `
          <button class="btn" id="forgotBtn" type="button" style="width:100%;margin-top:12px">Forgot Password?</button>
          <div class="notice" style="margin-top:12px;text-align:center">${signup ? "Already have an account?" : "Don't have an account?"}</div>
          <button class="btn" id="switchBtn" type="button" style="width:100%;margin-top:12px">${signup ? "Login" : "Create Account"}</button>
        ` : `
          <button class="btn" id="backBtn" type="button" style="width:100%;margin-top:12px">Back to Login</button>
        `}
      </div>
    `;

    document.getElementById("authSubmit").onclick = async () => {
      const btn = document.getElementById("authSubmit");
      const email = document.getElementById("authEmail").value.trim();
      if (!email) return render(mode, "Please enter your email address.");
      btn.disabled = true;
      btn.textContent = reset ? "Sending..." : signup ? "Creating..." : "Logging in...";
      try {
        if (reset) {
          const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${location.origin}${location.pathname}`
          });
          if (error) throw error;
          render("login", "Password reset email sent. Please check your inbox.");
          return;
        }
        const password = document.getElementById("authPassword").value;
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (signup) {
          const name = document.getElementById("authName").value.trim();
          const confirm = document.getElementById("authConfirm").value;
          if (!name) throw new Error("Please enter your name.");
          if (password !== confirm) throw new Error("Passwords do not match.");
          const { data, error } = await client.auth.signUp({
            email, password, options: { data: { name } }
          });
          if (error) throw error;
          if (data.session) {
            await PM.unlockDocuments(password, data.user.id);
            location.href = "index.html";
          }
          else render("login", "Account created. Please verify your email, then log in.");
        } else {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          await PM.unlockDocuments(password, data.user.id);
          location.href = "index.html";
        }
      } catch (e) {
        render(mode, e.message || String(e));
      }
    };

    document.getElementById("forgotBtn")?.addEventListener("click", () => render("reset"));
    document.getElementById("backBtn")?.addEventListener("click", () => render("login"));
    document.getElementById("switchBtn")?.addEventListener("click", () => render(signup ? "login" : "signup"));
  }

  (async () => {
    if (!client) return render("login", "Supabase client is not initialized.");
    const { data } = await client.auth.getSession();
    if (data.session?.user) location.href = "index.html";
    else render("login");
  })();
})();
