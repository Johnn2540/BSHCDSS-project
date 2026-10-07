const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const oneLine = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim();
const paragraph = (value) => `<p style="margin:0 0 18px;line-height:1.6">${escape(value).replace(/\r?\n/g, '<br>')}</p>`;

function layout(siteName, title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#171717"><div style="max-width:600px;margin:24px auto;background:white;border:1px solid #e5e5e5"><div style="padding:24px;background:#0F47AF;color:white;font-size:20px;font-weight:bold">${escape(siteName)}</div><div style="padding:28px"><h1 style="font-size:24px;margin:0 0 24px">${escape(title)}</h1>${body}</div><div style="padding:20px 28px;border-top:1px solid #e5e5e5;font-size:12px;color:#525252">${escape(siteName)} website</div></div></body></html>`;
}

function accountEmail({ kind, name, email, url, expiresIn, siteName = 'BSHCDSS' }) {
  const invite = kind === 'invite';
  const title = invite ? 'Choose your password' : 'Reset your password';
  const introduction = invite ? `An account has been created for you on the ${siteName} website.` : `We received a request to reset the password for your ${siteName} account.`;
  const closing = invite ? `Then log in with this email address (${email}).` : 'If you did not request this, you can ignore this email; your password will not change.';
  return {
    subject: invite ? `Your ${oneLine(siteName)} tutor account` : `Reset your ${oneLine(siteName)} password`,
    text: `Hello ${name},\n\n${introduction}\n\n${title} here (link valid for ${expiresIn}):\n${url}\n\n${closing}\n`,
    html: layout(siteName, title, paragraph(`Hello ${name},`) + paragraph(introduction) + `<p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;padding:14px 20px;background:#078930;color:white;border-radius:4px;text-decoration:none;font-weight:bold">${title}</a></p>` + paragraph(`This link expires in ${expiresIn} and can be used once.`) + paragraph(closing) + paragraph('If the button does not work, copy this address into your browser:') + `<p style="overflow-wrap:anywhere;line-height:1.6"><a href="${escape(url)}">${escape(url)}</a></p>`),
  };
}

function contactEmail({ siteName, name, email, phone, subject, message }) {
  const details = `Name: ${oneLine(name)}\nEmail: ${oneLine(email)}\n${phone ? `Phone: ${oneLine(phone)}\n` : ''}Subject: ${oneLine(subject)}`;
  return {
    subject: `[Website] ${oneLine(subject)}`,
    text: `New message from the ${siteName} website contact form.\n\n${details}\n\n${message}\n`,
    html: layout(siteName, 'New contact message', paragraph(details) + `<div style="padding:18px;background:#f5f5f5;border-left:4px solid #078930">${paragraph(message)}</div>` + paragraph('Reply to this email to contact the person who submitted the form.')),
  };
}

// Sent to the project mailbox (never to the applicant) when a visitor asks for tutor access. Every value was typed
// by an anonymous visitor: single-line fields are flattened, and the HTML escapes everything.
function tutorRequestEmail({ siteName, name, email, phone, institution, message, reviewUrl }) {
  const details = `Name: ${oneLine(name)}\nEmail: ${oneLine(email)}\n${phone ? `Phone: ${oneLine(phone)}\n` : ''}Institution: ${oneLine(institution)}`;
  const review = reviewUrl ? `Review the request and approve or decline it:\n${reviewUrl}` : 'Open Tutor requests in the admin panel to review it.';
  return {
    subject: `[Website] Tutor access request from ${oneLine(name)}`,
    text: `A visitor has asked for a tutor account on the ${siteName} website.\n\n${details}\n${message ? `\nMessage:\n${message}\n` : ''}\n${review}\n`,
    html: layout(siteName, 'Tutor access request', paragraph('A visitor has asked for a tutor account.') + paragraph(details)
      + (message ? `<div style="padding:18px;background:#f5f5f5;border-left:4px solid #078930">${paragraph(message)}</div>` : '')
      + (reviewUrl ? `<p style="margin:24px 0"><a href="${escape(reviewUrl)}" style="display:inline-block;padding:14px 20px;background:#0F47AF;color:white;border-radius:4px;text-decoration:none;font-weight:bold">Review the request</a></p>` : paragraph('Open Tutor requests in the admin panel to review it.'))
      + paragraph('Nothing happens until an administrator approves the request. Replying to this email writes to the applicant.')),
  };
}

module.exports = { accountEmail, contactEmail, tutorRequestEmail };
