/*
 * Transactional emails through Resend's REST API (plain fetch, no SDK).
 * Without RESEND_API_KEY the send is skipped and logged: local development
 * and tests never email anyone.
 *
 * The subject never carries the child's name; the body links to the story.
 */

const { env } = require("./env.js");
const brand = require("./brand.js");

const FROM = () => env.EMAIL_FROM || `${brand.name("es")} <cuentos@resend.dev>`;
const BASE = () => (env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const T = {
  es: {
    script_ready: {
      subject: "Tu cuento está escrito: léelo y dinos qué cambiar",
      body: (url) => `Ya tenemos el guion de tu cuento.\n\nLéelo aquí: ${url}\n\nSi quieres cambiar algo, puedes pedirlo dos veces sin coste. Cuando te guste, pulsa «Me gusta, ver cómo quedaría» y te enseñaremos dos páginas ilustradas.\n\nEste enlace caduca en 7 días.`,
    },
    sample_ready: {
      subject: "Dos páginas ilustradas de tu cuento te esperan",
      body: (url) => `Ya puedes ver cómo queda tu cuento ilustrado: ${url}\n\nPara completarlo (las doce páginas, las cuatro de colorear y el PDF) pulsa «Completar el cuento».\n\nEl enlace caduca en 7 días.`,
    },
    book_ready: {
      subject: "Tu cuento está listo para descargar",
      body: (url) => `Tu cuento completo está aquí: ${url}\n\nPuedes descargar el PDF durante 30 días y pedir un retoque sin coste.\n\nRecordatorio: al completarlo aceptaste que la entrega empezara de inmediato y renunciaste al derecho de desistimiento (art. 103 m LGDCU). Si algo no está bien, escríbenos y lo arreglamos.`,
    },
    expiring: {
      subject: "Tu cuento caduca en 2 días",
      body: (url) => `El cuento que creaste caduca pasado mañana. Si quieres completarlo, entra aquí: ${url}\n\nDespués de esa fecha se borra, junto con los datos que nos diste.`,
    },
    expired: {
      subject: "Tu cuento ha caducado",
      body: () => `El cuento que creaste ha caducado y hemos borrado sus datos, tal y como prometimos.\n\nSi quieres, puedes crear otro cuando quieras: ${BASE()}/crear/`,
    },
    recover: {
      subject: "Aquí tienes el enlace a tu cuento",
      body: (url) => `Nos has pedido el enlace a tu cuento. Aquí está: ${url}

No hace falta ninguna cuenta ni contraseña: guarda este correo y podrás volver siempre que quieras, hasta que el enlace caduque.

Si no has sido tú quien lo ha pedido, puedes ignorar este mensaje: nadie más ha recibido nada.`,
    },
    review_needed: {
      subject: "Tu cuento necesita un repaso nuestro",
      body: () => `Estamos revisando tu cuento a mano antes de entregarlo. Te avisamos en cuanto esté, como muy tarde mañana.`,
    },
  },
  en: {
    script_ready: {
      subject: "Your story is written — read it and tell us what to change",
      body: (url) => `The script of your story is ready.\n\nRead it here: ${url}\n\nYou can ask for changes twice at no cost. When you like it, press "I like it, show me how it looks" and we will illustrate two pages.\n\nThis link expires in 7 days.`,
    },
    sample_ready: {
      subject: "Two illustrated pages of your story are waiting",
      body: (url) => `See how your story looks illustrated: ${url}\n\nTo complete it (all twelve pages, four colouring pages and the PDF) press "Complete the story".\n\nThe link expires in 7 days.`,
    },
    book_ready: {
      subject: "Your story is ready to download",
      body: (url) => `Your complete story is here: ${url}\n\nYou can download the PDF for 30 days and ask for one touch-up at no cost.\n\nReminder: when completing it you agreed to immediate delivery and waived the right of withdrawal. If anything is wrong, write to us and we will fix it.`,
    },
    expiring: {
      subject: "Your story expires in 2 days",
      body: (url) => `The story you created expires the day after tomorrow. To complete it, go here: ${url}\n\nAfter that date it is deleted, together with the data you gave us.`,
    },
    expired: {
      subject: "Your story has expired",
      body: () => `The story you created has expired and its data has been deleted, as promised.\n\nYou can create another one any time: ${BASE()}/en/create/`,
    },
    recover: {
      subject: "Here is the link to your story",
      body: (url) => `You asked us for the link to your story. Here it is: ${url}

No account and no password needed: keep this email and you can come back whenever you like, until the link expires.

If this was not you, you can ignore this message — nobody else received anything.`,
    },
    review_needed: {
      subject: "Your story needs a look from us",
      body: () => `We are reviewing your story by hand before delivering it. We will let you know as soon as it is ready, tomorrow at the latest.`,
    },
  },
};

function render({ kind, locale = "es", token }) {
  const table = T[locale] || T.es;
  const tpl = table[kind];
  if (!tpl) throw new Error(`[cuentos] unknown email kind "${kind}"`);
  const url = token ? `${BASE()}/c/${token}` : BASE();
  return { subject: tpl.subject, text: tpl.body(url) };
}

/**
 * Every address a customer can be reached at. Usually one; two when the buyer
 * typed one address into our form and another into Stripe's, which is what a
 * typo looks like from here. The book goes to both rather than to nobody.
 */
function recipientsOf(order) {
  const seen = [];
  for (const e of [order && order.email, order && order.paid_email]) {
    const clean = String(e || "").trim().toLowerCase();
    if (clean && !seen.includes(clean)) seen.push(clean);
  }
  return seen;
}

async function sendEmail({ kind, to, locale, token }, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const { subject, text } = render({ kind, locale, token });
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) return { skipped: true, subject, reason: "no recipient" };
  if (!env.RESEND_API_KEY) {
    console.log(`[cuentos] email skipped (no RESEND_API_KEY): ${kind} -> ${recipients.join(", ")}`);
    return { skipped: true, subject };
  }
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: recipients, subject, text }),
  });
  if (!res.ok) throw new Error(`[cuentos] resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { id: data.id, subject };
}

/**
 * A customer writing in. It goes to the shop's own address, with reply-to set
 * to theirs so answering is one click, and it carries the story token when
 * there is one — that is what identifies the order without asking for it.
 */
async function sendContact({ from, message, token, orderEmail, status }, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const to = env.CONTACT_EMAIL || env.EMAIL_FROM_ADDRESS || "info@4bitsengineering.com";
  const lines = [
    `De: ${from}`,
    token ? `Cuento: ${BASE()}/c/${token}` : "Sin cuento asociado",
    orderEmail && orderEmail !== from ? `El pedido está a nombre de: ${orderEmail}` : "",
    status ? `Estado del pedido: ${status}` : "",
    "",
    message,
  ].filter(Boolean);
  if (!env.RESEND_API_KEY) {
    console.log(`[cuentos] contact skipped (no RESEND_API_KEY): ${from}`);
    return { skipped: true };
  }
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], reply_to: from, subject: `Contacto — ${from}`, text: lines.join("\n") }),
  });
  if (!res.ok) throw new Error(`[cuentos] resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

module.exports = { sendEmail, sendContact, render, recipientsOf, TEMPLATES: T };
