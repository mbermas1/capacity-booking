/**
 * Emailit REST API (https://emailit.com/docs/api-reference/emails/send). This
 * project's first external service dependency — everything else has stayed at
 * zero new dependencies. Never throws: a failed send doesn't lose the caller's
 * data, it just means whatever depended on the email doesn't happen yet.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.EMAILIT_API_KEY;
  const fromEmail = process.env.EMAILIT_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error("Emailit not configured — set EMAILIT_API_KEY and EMAILIT_FROM_EMAIL");
    return false;
  }

  try {
    const response = await fetch("https://api.emailit.com/v2/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html }),
    });

    if (!response.ok) {
      console.error("Emailit send failed:", response.status, await response.text());
    }
    return response.ok;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  context: { dockName: string },
): Promise<boolean> {
  return sendEmail(
    to,
    `Confirm your dock booking request — ${context.dockName}`,
    `<p>Confirm your booking request for ${context.dockName}:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 30 minutes.</p>`,
  );
}

export async function sendBookingConfirmationEmail(
  to: string,
  context: { dockName: string; startTime: Date; endTime: Date; referenceNumber: string },
): Promise<boolean> {
  return sendEmail(
    to,
    `Booking confirmed — ${context.dockName}`,
    `<p>Your dock appointment is confirmed.</p><ul><li>Dock: ${context.dockName}</li><li>Time: ${context.startTime.toISOString()}–${context.endTime.toISOString()} UTC</li><li>Reference: ${context.referenceNumber}</li></ul>`,
  );
}
