import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend";

serve(async () => {
  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY missing" }),
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: "MyNeighbor.Live <no-reply@myneighbor.live>",
      to: ["surgofhope@gmail.com"],
      subject: "✅ Test Email — MyNeighbor.Live",
      html: `
        <h2>This is a test email</h2>
        <p>If you received this, Resend is successfully connected.</p>
        <p><strong>No reminders were sent.</strong></p>
      `,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Test email sent",
        resend_id: result.id ?? null,
      }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: String(err),
      }),
      { status: 500 }
    );
  }
});
