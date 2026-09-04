(() => {
  "use strict";

  const client = window.supabaseClient;
  const app = document.getElementById("app");
  const PASSKEY_PROMPT_KEY = "pm_passkey_prompt_dismissed";
    async function signInWithPasskey() {
    if (!client?.auth?.signInWithPasskey) {
      throw new Error("Passkey login is not available.");
    }

    const { data, error } =
      await client.auth.signInWithPasskey();

    if (error) {
      throw error;
    }

    if (!data?.user) {
      throw new Error("Passkey authentication failed.");
    }

    return data.user;
  }

  async function showPasskeySetupPrompt() {
    return new Promise((resolve) => {
      PM.modal(`
        <div style="text-align:center;">
          <div style="font-size:32px;margin-bottom:10px;">🔐</div>

          <div style="font-weight:800;font-size:18px;">
            Enable Fingerprint Login?
          </div>

          <div class="status" style="margin-top:8px;">
            Sign in faster next time using your fingerprint,
            face unlock, or device PIN.
          </div>

          <button
            class="btn primary"
            id="loginEnablePasskeyBtn"
            type="button"
            style="width:100%;margin-top:18px;"
          >
            Enable Fingerprint Login
          </button>

          <button
            class="btn"
            id="loginSkipPasskeyBtn"
            type="button"
            style="width:100%;margin-top:10px;"
          >
            Not Now
          </button>

          <div
            id="loginPasskeyStatus"
            class="status"
            style="text-align:center;margin-top:10px;"
          ></div>
        </div>
      `);

      document
        .getElementById("loginSkipPasskeyBtn")
        ?.addEventListener("click", () => {
          localStorage.setItem(PASSKEY_PROMPT_KEY, "1");
          PM.closeModal();
          resolve();
        });

      document
        .getElementById("loginEnablePasskeyBtn")
        ?.addEventListener("click", async () => {
          const btn =
            document.getElementById("loginEnablePasskeyBtn");

          const status =
            document.getElementById("loginPasskeyStatus");

          if (!btn) return;

          btn.disabled = true;
          btn.textContent = "Registering...";

          try {
            if (!client?.auth?.registerPasskey) {
              throw new Error(
                "Passkey registration is not available."
              );
            }

            const { error } =
              await client.auth.registerPasskey();

            if (error) throw error;

            localStorage.setItem(PASSKEY_PROMPT_KEY, "1");

            btn.textContent = "✓ Enabled";

            if (status) {
              status.textContent =
                "Fingerprint login enabled successfully.";
            }

            setTimeout(() => {
              PM.closeModal();
              resolve();
            }, 1000);

          } catch (error) {
            console.error(
              "Passkey registration error:",
              error
            );

            btn.disabled = false;
            btn.textContent = "Enable Fingerprint Login";

            if (status) {
              status.textContent =
                error?.message ||
                "Passkey registration failed.";
            }
          }
        });
    });
  }
  function esc(v) {
    return window.PM?.escape
      ? window.PM.escape(v)
      : String(v);
  }

  function render(mode = "login", message = "") {
    const signup = mode === "signup";
    const reset = mode === "reset";

    app.innerHTML = `
      <div class="auth-page">

        <div class="auth-logo">P</div>

        <h1>Personal Manager</h1>

        <p class="auth-subtitle">
          ${
            reset
              ? "Reset your password"
              : signup
                ? "Create your account"
                : "Welcome back"
          }
        </p>

        ${
          message
            ? `<div class="auth-error">${esc(message)}</div>`
            : ""
        }

        ${
          signup
            ? `
              <div class="field">
                <label>Name</label>
                <input
                  id="authName"
                  type="text"
                  autocomplete="name"
                  placeholder="Your name"
                >
              </div>
            `
            : ""
        }

        <div class="field">
          <label>Email</label>
          <input
            id="authEmail"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
          >
        </div>

        ${
          reset
            ? ""
            : `
              <div class="field">
                <label>Password</label>
                <div class="password-field">
                  <input
                    id="authPassword"
                    type="password"
                    autocomplete="${
                      signup ? "new-password" : "current-password"
                    }"
                    placeholder="At least 6 characters"
                  >
                  <button
                    type="button"
                    class="password-toggle"
                    id="passwordToggle"
                    aria-label="Show password"
                    title="Show password"
                  >👁</button>
                </div>
              </div>
            `
        }

        ${
          signup
            ? `
              <div class="field">
                <label>Confirm password</label>
                <div class="password-field">
                  <input
                    id="authConfirm"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Re-enter password"
                  >
                  <button
                    type="button"
                    class="password-toggle"
                    id="confirmPasswordToggle"
                    aria-label="Show password"
                    title="Show password"
                  >👁</button>
                </div>
              </div>
            `
            : ""
        }

        <button
          class="btn primary"
          id="authSubmit"
          type="button"
          style="width:100%;margin-top:8px"
        >
          ${
            reset
              ? "Send Reset Email"
              : signup
                ? "Create Account"
                : "Login"
          }
        </button>
         
        ${
          !reset
            ? `
              <button
                class="btn"
                id="forgotBtn"
                type="button"
                style="width:100%;margin-top:12px"
              >
                Forgot Password?
              </button>
              ${
                !signup && !reset
                  ? `
                    <button
                      class="btn"
                      id="passkeyBtn"
                      type="button"
                      style="width:100%;margin-top:12px"
                    >
                      🔐 Sign in with fingerprint
                    </button>

                    <div
                      class="notice"
                      style="margin-top:8px;text-align:center;font-size:13px"
                    >
                      Fingerprint, face unlock, or device PIN
                    </div>
                  `
                  : ""
              }      

              <div
                class="notice"
                style="margin-top:12px;text-align:center"
              >
                ${
                  signup
                    ? "Already have an account?"
                    : "Don't have an account?"
                }
              </div>

              <button
                class="btn"
                id="switchBtn"
                type="button"
                style="width:100%;margin-top:12px"
              >
                ${signup ? "Login" : "Create Account"}
              </button>
            `
            : `
              <button
                class="btn"
                id="backBtn"
                type="button"
                style="width:100%;margin-top:12px"
              >
                Back to Login
              </button>
            `
        }

      </div>
    `;

    // Password visibility toggles
    const passwordInput = document.getElementById("authPassword");
    const passwordToggle = document.getElementById("passwordToggle");

    passwordToggle?.addEventListener("click", () => {
      if (!passwordInput) return;

      const showPassword = passwordInput.type === "password";

      passwordInput.type = showPassword ? "text" : "password";
      passwordToggle.textContent = showPassword ? "🙈" : "👁";
      passwordToggle.setAttribute(
        "aria-label",
        showPassword ? "Hide password" : "Show password"
      );
      passwordToggle.setAttribute(
        "title",
        showPassword ? "Hide password" : "Show password"
      );
    });

    const confirmInput = document.getElementById("authConfirm");
    const confirmToggle = document.getElementById("confirmPasswordToggle");

    confirmToggle?.addEventListener("click", () => {
      if (!confirmInput) return;

      const showPassword = confirmInput.type === "password";

      confirmInput.type = showPassword ? "text" : "password";
      confirmToggle.textContent = showPassword ? "🙈" : "👁";
      confirmToggle.setAttribute(
        "aria-label",
        showPassword ? "Hide password" : "Show password"
      );
      confirmToggle.setAttribute(
        "title",
        showPassword ? "Hide password" : "Show password"
      );
    });

    /*
     * Main authentication button
     */
    document.getElementById("authSubmit").onclick = async () => {
      const btn = document.getElementById("authSubmit");
      const email = document.getElementById("authEmail").value.trim();

      if (!email) {
        render(mode, "Please enter your email address.");
        return;
      }

      btn.disabled = true;

      btn.textContent =
        reset
          ? "Sending..."
          : signup
            ? "Creating..."
            : "Logging in...";

      try {

        /*
         * PASSWORD RESET EMAIL
         */
        if (reset) {
          const { error } =
            await client.auth.resetPasswordForEmail(email, {
              redirectTo:
                "https://cidstech.in/personal-manager/reset-password.html"
            });

          if (error) {
            throw error;
          }

          render(
            "login",
            "Password reset email sent. Please check your inbox."
          );

          return;
        }

        /*
         * LOGIN / SIGNUP PASSWORD
         */
        const password =
          document.getElementById("authPassword").value;

        if (password.length < 6) {
          throw new Error(
            "Password must be at least 6 characters."
          );
        }

        /*
         * SIGNUP
         */
        if (signup) {
          const name =
            document.getElementById("authName").value.trim();

          const confirm =
            document.getElementById("authConfirm").value;

          if (!name) {
            throw new Error("Please enter your name.");
          }

          if (password !== confirm) {
            throw new Error("Passwords do not match.");
          }

          const redirectUrl =
            "https://cidstech.in/personal-manager/login.html?verified=1";

          const { data, error } =
            await client.auth.signUp({
              email,
              password,
              options: {
                data: {
                  name
                },
                emailRedirectTo: redirectUrl
              }
            });

          if (error) {
            throw error;
          }

          /*
           * If Supabase returns a session immediately,
           * allow the normal login flow.
           *
           * Normally, with email confirmation enabled,
           * data.session will be null.
           */
          if (data.session) {
            await PM.unlockDocuments(
              password,
              data.user.id
            );

            PM.markSessionUnlocked();

            location.href = "index.html";
          } else {
            render(
              "login",
              "Account created. Please verify your email, then log in."
            );
          }

          return;
        }

        /*
         * LOGIN
         */
        const { data, error } =
          await client.auth.signInWithPassword({
            email,
            password
          });

        if (error) {
          throw error;
        }

        btn.textContent = "Securing your data...";

        await PM.unlockDocuments(
          password,
          data.user.id
        );

        PM.markSessionUnlocked();

        location.href = "index.html";

      } catch (e) {

        console.error("Authentication error:", e);

        render(
          mode,
          e.message || String(e)
        );
      }
    };

        /*
     * PASSKEY LOGIN
     */
    document.getElementById("passkeyBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("passkeyBtn");

      if (!btn) return;

      btn.disabled = true;
      btn.textContent = "Authenticating...";

      try {
        const user = await signInWithPasskey();

        /*
         * Passkey authentication succeeded.
         *
         * Restore the document encryption key that was
         * previously saved on this device.
         */
        const restored = await PM.restoreDocumentKey(user.id);

        if (!restored) {
          await client.auth.signOut({ scope: "local" });

          render(
            "login",
            "Fingerprint login is not yet available on this device. Please log in with your password first."
          );

          return;
        }

        PM.markSessionUnlocked();

        location.href = "index.html";
        
      } catch (e) {
        console.error("Passkey login error:", e);

        render(
          "login",
          e.message || "Fingerprint login failed. Please use your password."
        );
      }
    });

    // Enter key support
    document.getElementById("authEmail")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("authSubmit").click();
      }
    });

    document.getElementById("authPassword")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("authSubmit").click();
      }
    });

    document.getElementById("authConfirm")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("authSubmit").click();
      }
    });
    /*
     * NAVIGATION BUTTONS
     */
    document
      .getElementById("forgotBtn")
      ?.addEventListener("click", () => {
        render("reset");
      });

    document
      .getElementById("backBtn")
      ?.addEventListener("click", () => {
        render("login");
      });

    document
      .getElementById("switchBtn")
      ?.addEventListener("click", () => {
        render(
          signup ? "login" : "signup"
        );
      });
  }

  /*
   * INITIALIZE LOGIN PAGE
   */
  (async () => {

    if (!client) {
      return render(
        "login",
        "Supabase client is not initialized."
      );
    }

    const params =
      new URLSearchParams(window.location.search);

    const verified =
      params.get("verified") === "1";

    const reset =
      params.get("reset") === "1";

    const { data } =
      await client.auth.getSession();

    /*
     * EMAIL VERIFICATION COMPLETED
     *
     * Supabase may create a session after
     * email verification.
     *
     * We immediately sign that session out
     * so the user must manually enter the password.
     */
    if (verified) {

      if (data.session) {
        await client.auth.signOut({
          scope: "local"
        });
      }

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      render(
        "login",
        "Email verified successfully. Please enter your password to log in."
      );

      return;
    }

    /*
     * PASSWORD RESET COMPLETED
     *
     * reset-password.js signs the recovery session out
     * and redirects here with ?reset=1.
     */
    if (reset) {

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      render(
        "login",
        "Password updated successfully. Please log in with your new password."
      );

      return;
    }

    /*
     * NORMAL ALREADY-LOGGED-IN USER
     */
    if (data.session?.user) {

      location.href = "index.html";

      return;
    }

    /*
     * NORMAL LOGIN PAGE
     */
    render("login");

  })();

})();