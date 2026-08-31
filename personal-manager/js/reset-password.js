(() => {
  "use strict";

  const client = window.supabaseClient;
  const app = document.getElementById("app");

  function esc(value) {
    return window.PM?.escape
      ? window.PM.escape(value)
      : String(value);
  }

  function render(message = "", isError = false) {

    app.innerHTML = `
      <div class="auth-page">

        <div class="auth-logo">P</div>

        <h1>Personal Manager</h1>

        <p class="auth-subtitle">
          Reset your password
        </p>

        ${
          message
            ? `
              <div class="${isError ? "auth-error" : "notice"}">
                ${esc(message)}
              </div>
            `
            : ""
        }

        <div class="field">

          <label>New Password</label>

          <input
            id="newPassword"
            type="password"
            autocomplete="new-password"
            placeholder="At least 6 characters">

        </div>

        <div class="field">

          <label>Confirm Password</label>

          <input
            id="confirmPassword"
            type="password"
            autocomplete="new-password"
            placeholder="Re-enter your password">

        </div>

        <button
          class="btn primary"
          id="updatePasswordBtn"
          type="button"
          style="width:100%;margin-top:8px">

          Update Password

        </button>

      </div>
    `;

    document
      .getElementById("updatePasswordBtn")
      .addEventListener("click", updatePassword);
  }


  async function updatePassword() {

    const password =
      document.getElementById("newPassword").value;

    const confirmPassword =
      document.getElementById("confirmPassword").value;

    if (password.length < 6) {

      render(
        "Password must be at least 6 characters.",
        true
      );

      return;
    }

    if (password !== confirmPassword) {

      render(
        "Passwords do not match.",
        true
      );

      return;
    }

    const button =
      document.getElementById("updatePasswordBtn");

    button.disabled = true;
    button.textContent = "Updating...";

    try {

      const { error } =
        await client.auth.updateUser({
          password
        });

      if (error) {
        throw error;
      }

    render(
      "Password updated successfully. Please log in with your new password."
    );

    await client.auth.signOut({ scope: "local" });

    setTimeout(() => {

      window.location.href = "login.html?reset=1";

    }, 1500);

    } catch (error) {

      console.error("Password update error:", error);

      render(
        error.message || "Unable to update password.",
        true
      );

      button.disabled = false;
      button.textContent = "Update Password";
    }
  }


  async function init() {

    if (!client) {

      render(
        "Supabase client is not initialized.",
        true
      );

      return;
    }

    try {

      const { data, error } =
        await client.auth.getSession();

      if (error) {
        throw error;
      }

      if (!data.session) {

        render(
          "This password reset link is invalid or has expired.",
          true
        );

        return;
      }

      render();

    } catch (error) {

      console.error("Reset page error:", error);

      render(
        error.message ||
        "Unable to initialize password reset.",
        true
      );
    }
  }


  init();

})();