const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY is not configured");
    }

    const {
      email,
      groupName,
      inviterName,
    } = await req.json();

    if (!email || !groupName) {
      throw new Error("Email and group name are required");
    }

    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Personal Manager",
            email: "no-reply@cidstech.in",
          },
          to: [
            {
              email: email,
            },
          ],
          subject: "You're invited to a Shared Expense Group",
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;">
              <h2>You're invited to a Shared Expense Group</h2>

              <p>
                ${inviterName || "Someone"} has invited you to join:
              </p>

              <h3>${groupName}</h3>

              <p>
                Open Personal Manager to view and accept the invitation.
              </p>

              <p style="margin:30px 0;">
                <a
                  href="https://cidstech.in/personal-manager/shared-expenses.html"
                  style="background:#2dd4bf;color:#12151a;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold;"
                >
                  Open Shared Expenses
                </a>
              </p>

              <p style="color:#777;font-size:13px;">
                If you were not expecting this invitation, you can safely ignore this email.
              </p>
            </div>
          `,
        }),
      }
    );

    const result = await response.json();


    if (!response.ok) {
      console.error("Brevo error:", result);

      return new Response(
        JSON.stringify({
          error: result?.message || "Failed to send email",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.messageId,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Function error:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Unexpected error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});