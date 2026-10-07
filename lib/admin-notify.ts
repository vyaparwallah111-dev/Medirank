function getMailgunApiUrl(domain: string, region?: string | null) {
  const apiHost = region && region.trim().toUpperCase() === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net";
  return `https://${apiHost}/v3/${encodeURIComponent(domain)}/messages`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

export interface NewSignupNotificationDetails {
  email: string;
  name?: string | null;
  businessName?: string | null;
  businessType?: "doctor" | "coaching" | string | null;
  specialization?: string | null;
  city?: string | null;
  phone?: string | null;
  reviewLink?: string | null;
  slug?: string | null;
  stage?: "signup" | "onboarding_complete";
}

const DEFAULT_ADMIN_EMAIL = "Avinashjhacode@gmail.com";

export async function notifyAdminNewSignup(details: NewSignupNotificationDetails): Promise<boolean> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const region = process.env.MAILGUN_REGION || "US";
  const senderEmail = process.env.MAILGUN_SENDER_EMAIL || (domain ? `no-reply@${domain}` : "no-reply@medirank.vyaparwallah.com");
  const senderName = process.env.MAILGUN_SENDER_NAME || "MediRank by Vyapar Wallah";
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULT_ADMIN_EMAIL;

  if (!apiKey || !domain) {
    console.warn("Admin signup notification skipped: Mailgun API key or domain is not configured.");
    return false;
  }

  const isCoaching = details.businessType === "coaching";
  const verticalLabel = isCoaching ? "Education & Coaching" : "Healthcare (Clinic / Doctor)";
  const nowIst = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const displayName = details.name || details.email.split("@")[0];
  const displayBusiness = details.businessName || (isCoaching ? "New Coaching Institute" : "New Clinic");

  const subject = `🎉 New ${isCoaching ? "Coaching" : "Clinic"} Signup: ${displayBusiness} (${details.email})`;

  const textContent = `
New User Signup Alert - MediRank by Vyapar Wallah

User Email: ${details.email}
Name: ${details.name || "N/A"}
${isCoaching ? "Institute" : "Clinic"} Name: ${details.businessName || "N/A"}
Category / Specialization: ${details.specialization || "N/A"}
City: ${details.city || "N/A"}
Phone: ${details.phone || "N/A"}
Vertical: ${verticalLabel}
Review Page Slug: ${details.slug ? `/r/${details.slug}` : "N/A"}
Google Review Link: ${details.reviewLink || "N/A"}
Timestamp: ${nowIst} (IST)
`.trim();

  const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0A4C95 0%, #1e3a8a 100%); padding: 32px 28px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; font-weight: 800; }
    .header p { margin: 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 30px 28px; }
    .badge { display: inline-block; padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; border-radius: 20px; background: #eff6ff; color: #0A4C95; margin-bottom: 20px; }
    .details-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .details-table tr { border-bottom: 1px solid #f1f5f9; }
    .details-table td { padding: 12px 6px; font-size: 14px; }
    .details-table .label { color: #64748b; font-weight: 600; width: 38%; }
    .details-table .value { color: #0f172a; font-weight: 700; width: 62%; word-break: break-word; }
    .cta-box { margin-top: 28px; text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .cta-btn { display: inline-block; background-color: #F37021; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 14px; font-weight: 800; border-radius: 10px; }
    .footer { background: #f8fafc; padding: 20px 28px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 New MediRank Registration</h1>
      <p>A new ${escapeHtml(isCoaching ? "institute" : "doctor / clinic")} has signed up on the platform</p>
    </div>
    <div class="content">
      <span class="badge">${escapeHtml(verticalLabel)}</span>
      <table class="details-table">
        <tr>
          <td class="label">📧 User Email</td>
          <td class="value"><a href="mailto:${escapeHtml(details.email)}" style="color: #0A4C95; text-decoration: none;">${escapeHtml(details.email)}</a></td>
        </tr>
        <tr>
          <td class="label">👤 ${escapeHtml(isCoaching ? "Educator / Director" : "Doctor Name")}</td>
          <td class="value">${escapeHtml(details.name || "N/A")}</td>
        </tr>
        <tr>
          <td class="label">🏢 ${escapeHtml(isCoaching ? "Institute Name" : "Clinic Name")}</td>
          <td class="value">${escapeHtml(details.businessName || "N/A")}</td>
        </tr>
        <tr>
          <td class="label">🏷️ Category / Specialty</td>
          <td class="value">${escapeHtml(details.specialization || "N/A")}</td>
        </tr>
        <tr>
          <td class="label">📍 City</td>
          <td class="value">${escapeHtml(details.city || "N/A")}</td>
        </tr>
        ${details.phone ? `<tr><td class="label">📱 Phone</td><td class="value"><a href="tel:${escapeHtml(details.phone)}" style="color: #0A4C95;">${escapeHtml(details.phone)}</a></td></tr>` : ""}
        ${details.slug ? `<tr><td class="label">🔗 Review URL</td><td class="value">/r/${escapeHtml(details.slug)}</td></tr>` : ""}
        ${details.reviewLink ? `<tr><td class="label">⭐ Google Link</td><td class="value"><a href="${escapeHtml(details.reviewLink)}" target="_blank" style="color: #0A4C95;">View Google Link</a></td></tr>` : ""}
        <tr>
          <td class="label">⏰ Time (IST)</td>
          <td class="value">${escapeHtml(nowIst)}</td>
        </tr>
      </table>

      <div class="cta-box">
        <a href="https://medirank.vyaparwallah.com/admin/dashboard" class="cta-btn" target="_blank">Open Admin Dashboard</a>
      </div>
    </div>
    <div class="footer">
      MediRank by Vyapar Wallah &nbsp;•&nbsp; Internal Admin Notification
    </div>
  </div>
</body>
</html>`;

  const form = new FormData();
  form.set("from", `${senderName} <${senderEmail}>`);
  form.set("to", adminEmail);
  form.set("subject", subject);
  form.set("text", textContent);
  form.set("html", htmlContent);

  try {
    const response = await fetch(getMailgunApiUrl(domain, region), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      },
      body: form,
    });

    if (!response.ok) {
      console.error("Admin notification email failed:", response.status, await response.text());
      return false;
    }

    console.log(`Admin notification email sent successfully to ${adminEmail} for user ${details.email}`);
    return true;
  } catch (err) {
    console.error("Failed to send admin notification email:", err);
    return false;
  }
}
