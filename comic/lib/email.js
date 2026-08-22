/*
 * The two emails this product sends, and nothing else.
 *
 *   previewReady - "the script and the cover are ready", the free half
 *   deliver      - "your comic is finished", the paid half
 *
 * Behind an adapter with a `console` backend, which is not a stub for its own
 * sake: the whole paid flow — webhook, render, delivery — has to be walkable on
 * a laptop with no email account, or it does not get walked before a customer
 * walks it.
 *
 * The PDF is a LINK, not an attachment. Twelve megabytes bounces off plenty of
 * corporate mailboxes and lands in spam at the rest, and a bounced delivery of
 * something already paid for is the worst message this product can send.
 *
 * Plain fetch, no SDK, same as lib/stripe.js: one endpoint does not justify a
 * dependency.
 */

const PROVIDER = process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? "resend" : "console");
const FROM = process.env.EMAIL_FROM || "MyOwnManga <hola@myownmanga.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO || null;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function baseFor(job) {
  return String(job.base_url || process.env.PUBLIC_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
}

// --- providers ---------------------------------------------------------------

async function sendResend({ to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      html,
      text,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.message || `HTTP ${res.status}`).slice(0, 200));
  return { provider: "resend", id: data.id || null };
}

async function sendConsole({ to, subject, text }) {
  console.log(`\n--- email (no enviado: EMAIL_PROVIDER=console) ---\npara: ${to.join(", ")}\nasunto: ${subject}\n\n${text}\n---\n`);
  return { provider: "console", id: null };
}

async function send(message) {
  const to = (Array.isArray(message.to) ? message.to : [message.to])
    .map((a) => String(a || "").trim().toLowerCase())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a));
  // Deduplicated: our form's address and Stripe's are usually the same one, and
  // getting the same email twice reads as a bug.
  const unique = [...new Set(to)];
  if (!unique.length) return { skipped: "no_address" };

  const payload = { ...message, to: unique };
  try {
    const result = PROVIDER === "resend" ? await sendResend(payload) : await sendConsole(payload);
    return { ...result, to: unique, at: new Date().toISOString() };
  } catch (e) {
    // Never throws upwards. An email that will not send must not roll back a
    // render that already cost seven minutes and 22 cents; the comic is on the
    // page either way, and the failure is recorded on the job.
    console.error(`[comic] email failed: ${e.message}`);
    return { error: String(e.message).slice(0, 200), to: unique };
  }
}

// --- the shell ---------------------------------------------------------------

function shell({ heading, body, cta, ctaUrl, footer }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#171c24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#171c24;padding:28px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#232b36;border:1px solid #3d4854;border-radius:10px">
    <tr><td style="padding:26px 26px 6px">
      <p style="margin:0 0 18px;font:700 15px/1 Arial,sans-serif;letter-spacing:.06em;color:#e8e3d8">MYOWN<span style="color:#e8a33d">MANGA</span></p>
      <h1 style="margin:0 0 12px;font:700 21px/1.25 Arial,sans-serif;color:#e8e3d8">${heading}</h1>
      <div style="font:400 15px/1.55 Arial,sans-serif;color:#c3c9d1">${body}</div>
    </td></tr>
    <tr><td style="padding:20px 26px 26px">
      <a href="${esc(ctaUrl)}" style="display:inline-block;background:#e8a33d;color:#171c24;text-decoration:none;font:700 15px/1 Arial,sans-serif;padding:13px 20px;border-radius:8px">${esc(cta)}</a>
    </td></tr>
    <tr><td style="padding:0 26px 24px;border-top:1px solid #2e3743">
      <p style="margin:16px 0 0;font:400 12px/1.5 Arial,sans-serif;color:#7d8894">${footer}</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// --- the free half -----------------------------------------------------------

async function previewReady({ job, story }) {
  const en = job.lang === "en";
  const url = `${baseFor(job)}/c/${job.token}`;
  const title = story && story.title ? story.title : "";
  const hero = story && story.hero ? story.hero.name : "";

  const subject = en
    ? `"${title}" is ready to read`
    : `Ya puedes leer "${title}"`;

  const body = en
    ? `<p style="margin:0 0 12px">The cover is drawn and the whole script is written — ${esc(hero)} is the hero of it.</p>
       <p style="margin:0">Read it, and if you like it the finished 14-page comic is one click away. Nothing to pay to look.</p>`
    : `<p style="margin:0 0 12px">Ya está la portada dibujada y el guion entero escrito, con ${esc(hero)} de protagonista.</p>
       <p style="margin:0">Léelo, y si te gusta el cómic completo de 14 páginas está a un clic. Mirar no cuesta nada.</p>`;

  const text = en
    ? `"${title}" is ready to read.\n\n${url}\n\nThe cover is drawn and the whole script is written. The finished 14-page comic is one click away.`
    : `Ya puedes leer "${title}".\n\n${url}\n\nEstá la portada dibujada y el guion entero. El cómic completo de 14 páginas está a un clic.`;

  return send({
    to: [job.email],
    subject,
    text,
    html: shell({
      heading: en ? "Your preview is ready" : "Tu vista previa está lista",
      body,
      cta: en ? "Read the preview" : "Leer la vista previa",
      ctaUrl: url,
      footer: en
        ? "You asked for this on myownmanga.com. This link is private — anyone who has it can read the story."
        : "Lo has pedido tú en myownmanga.com. Este enlace es privado: quien lo tenga puede leer la historia.",
    }),
  });
}

// --- the paid half -----------------------------------------------------------

async function deliver({ job, story, to }) {
  const en = job.lang === "en";
  const base = baseFor(job);
  const url = `${base}/c/${job.token}?pagado=1`;
  const pdf = `${base}/api/file?token=${encodeURIComponent(job.token)}&k=pdf`;
  const title = story && story.title ? story.title : "";
  const hero = story && story.hero ? story.hero.name : "";
  const pages = story && story.pages ? story.pages.length : 14;

  const subject = en ? `"${title}" is finished` : `"${title}" ya está terminado`;

  const body = en
    ? `<p style="margin:0 0 12px">All ${pages} pages are drawn. ${esc(hero)} carries the whole thing.</p>
       <p style="margin:0 0 12px">The PDF reads well on a phone, which is where it will actually be read.</p>
       <p style="margin:0"><a href="${esc(pdf)}" style="color:#e8a33d">Download the PDF directly</a>.</p>`
    : `<p style="margin:0 0 12px">Ya están dibujadas las ${pages} páginas. ${esc(hero)} las sostiene enteras.</p>
       <p style="margin:0 0 12px">El PDF se lee bien en el móvil, que es donde se va a leer de verdad.</p>
       <p style="margin:0"><a href="${esc(pdf)}" style="color:#e8a33d">Descargar el PDF directamente</a>.</p>`;

  const text = en
    ? `"${title}" is finished — all ${pages} pages.\n\nRead it: ${url}\nDownload the PDF: ${pdf}\n\nKeep this email: the links are how you get back to it.`
    : `"${title}" ya está terminado: las ${pages} páginas.\n\nLeerlo: ${url}\nDescargar el PDF: ${pdf}\n\nGuarda este correo: los enlaces son la forma de volver.`;

  return send({
    to,
    subject,
    text,
    html: shell({
      heading: en ? "Your comic is finished" : "Tu cómic está terminado",
      body,
      cta: en ? "Open the comic" : "Abrir el cómic",
      ctaUrl: url,
      footer: en
        ? "Keep this email: these links are how you get back to the comic. Any problem, just reply."
        : "Guarda este correo: estos enlaces son la forma de volver al cómic. Cualquier problema, responde y ya está.",
    }),
  });
}

module.exports = { send, previewReady, deliver, PROVIDER };
