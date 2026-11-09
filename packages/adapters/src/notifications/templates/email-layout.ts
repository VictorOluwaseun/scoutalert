/** Shared email palette follows the product; inline styles remain usable when clients remove the head. */
export const emailColors = {
  ink: "#191c22",
  paper: "#f6f7f8",
  white: "#ffffff",
  muted: "#52606f",
  lime: "#d9ef70",
  soft: "#f1f5df",
};

/** Escapes every dynamic string before it enters an HTML text node or quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

/** Accepts ordinary public-web link syntax only; credentials and non-web schemes never become email links. */
export function emailWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      value.length > 2048 ||
      /[\u0000-\u0020\u007f]/u.test(value)
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** Produces a real text link; unsafe source URLs are replaced by the non-clickable label. */
export function emailLink(label: string, url: string): string {
  const safe = emailWebUrl(url);
  if (!safe) {
    return escapeHtml(label);
  }
  return `<a href="${escapeHtml(safe)}" class="email-link" style="color:${emailColors.ink};text-decoration:underline;text-underline-offset:3px;">${escapeHtml(label)}</a>`;
}

/** Uses a table-backed, image-free button with a readable link if client-specific styling is stripped. */
export function emailButton(label: string, url: string): string {
  const safe = emailWebUrl(url);
  if (!safe) {
    return "";
  }
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr><td bgcolor="${emailColors.lime}" style="background:${emailColors.lime};border:1px solid ${emailColors.lime};border-radius:8px;text-align:center;mso-padding-alt:14px 24px;"><a href="${escapeHtml(safe)}" style="display:inline-block;padding:14px 24px;font-size:15px;line-height:20px;font-weight:700;color:${emailColors.ink};text-decoration:none;mso-padding-alt:0;">${escapeHtml(label)}</a></td></tr></table>`;
}

/** Supplies responsive, table-based presentation with real headings, inbox preview text and optional dark-mode overrides. */
export function emailLayout(input: {
  subject: string;
  preview: string;
  category: string;
  body: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <title>${escapeHtml(input.subject)}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body { margin:0!important; padding:0!important; width:100%!important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    td { overflow-wrap:anywhere; word-break:break-word; }
    a:focus-visible { outline:2px solid #476126; outline-offset:4px; }
    @media only screen and (max-width:620px) {
      .email-outer { padding:24px 12px!important; }
      .email-padding { padding:28px 24px!important; }
      .email-heading { font-size:28px!important; line-height:34px!important; }
      .email-code { font-size:36px!important; letter-spacing:6px!important; }
      .email-category { font-size:11px!important; }
    }
    @media (prefers-color-scheme:dark) {
      body, .email-canvas { background:#12171c!important; }
      .email-surface { background:#1e252c!important; border-color:#3d4751!important; }
      .email-text, .email-link { color:#f4f6f8!important; }
      .email-muted { color:#b4bec8!important; }
      .email-soft { background:#293126!important; }
      .email-rule { border-color:#3d4751!important; }
    }
  </style>
</head>
<body class="email-canvas" style="margin:0;padding:0;background:${emailColors.paper};color:${emailColors.ink};">
  <div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;color:${emailColors.paper};max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preview)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="email-canvas" bgcolor="${emailColors.paper}" style="background:${emailColors.paper};">
    <tr><td align="center" class="email-outer" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;text-align:left;">
        <tr><td style="padding:0 4px 22px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>
            <td class="email-text" style="font-size:23px;line-height:30px;font-weight:700;letter-spacing:-1px;color:${emailColors.ink};">ScoutAlert<span style="color:#6c822d;">.</span></td>
            <td align="right" class="email-muted email-category" style="font-size:12px;line-height:18px;color:${emailColors.muted};padding-left:16px;">${escapeHtml(input.category)}</td>
          </tr></table>
        </td></tr>
        <tr><td class="email-surface" bgcolor="${emailColors.white}" style="background:${emailColors.white};border:1px solid #dde1e6;border-top:4px solid ${emailColors.lime};border-radius:16px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td class="email-padding email-text" style="padding:36px;color:${emailColors.ink};font-size:15px;line-height:24px;">${input.body}</td></tr></table>
        </td></tr>
        <tr><td class="email-muted" style="padding:24px 12px 0;color:${emailColors.muted};font-size:12px;line-height:19px;text-align:center;">${input.footer}<p style="margin:16px 0 0;font-size:12px;">ScoutAlert &nbsp;/&nbsp; Your next move, worth finding.</p></td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

/** Provides a consistent heading hierarchy without using graphics for essential content. */
export function emailHeading(text: string): string {
  return `<h1 class="email-heading email-text" style="margin:0 0 16px;font-size:34px;line-height:40px;font-weight:700;letter-spacing:-1px;color:${emailColors.ink};">${escapeHtml(text)}</h1>`;
}
