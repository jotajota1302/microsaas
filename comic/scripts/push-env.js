/*
 * Copia a Vercel las variables que producción necesita, desde .env.
 *
 *   node scripts/push-env.js          → enseña lo que haría, no cambia nada
 *   node scripts/push-env.js --apply  → las escribe en producción
 *
 * Adaptado de cuentos/scripts/push-env.js, incluidas sus tres decisiones
 * buenas, que no son obvias:
 *
 *  - Viaja una LISTA BLANCA de nombres, no el .env entero. El fichero tiene
 *    claves de otras cosas, y un secreto que no necesita estar en una nube es
 *    un secreto que no puede escaparse de ella.
 *  - Los valores NO se imprimen nunca. Solo el nombre y qué se ha hecho con él.
 *  - PUBLIC_BASE_URL no se coge del .env: en local apunta a localhost, y un
 *    enlace de correo a localhost es un correo que nadie puede abrir.
 *
 * Esto NO despliega. `vercel --prod` desde dentro de una carpeta de proyecto
 * está prohibido en este repo (ha subido la carpeta equivocada antes): los
 * despliegues van por git push, y las variables las coge el siguiente.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

/** Lee el .env del proyecto. Lo ya presente en el entorno manda. */
function readEnv() {
  const out = {};
  if (fs.existsSync(".env")) {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return { ...out, ...process.env };
}

const env = readEnv();

const NEEDED = [
  // El almacén. Sin esto en serverless no se guarda ni un pedido.
  "STORE", "BLOBS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BUCKET",
  // Los modelos.
  "MINIMAX_API_KEY", "MINIMAX_BASE_URL", "MINIMAX_MODEL",
  "OPENROUTER_API_KEY", "CRITIC_PROVIDER", "CRITIC_MODEL", "IMAGE_PROVIDER",
  // Entrega y cobro.
  "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_MANAGED_PAYMENTS",
  // Operación.
  "ADMIN_TOKEN", "CRON_SECRET", "IP_SALT",
  "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY",
  // Identidad del titular: obligatoria por LSSI art. 10.
  "LEGAL_NAME", "LEGAL_NIF", "LEGAL_ADDRESS", "LEGAL_EMAIL",
  // Techos de gasto y retención.
  "MAX_PREVIEWS_PER_DAY", "MAX_PREVIEWS_PER_IP", "MAX_HOLES",
  "KEEP_UNPAID_DAYS", "KEEP_PAID_DAYS",
];

/** Sin estas el producto no funciona en absoluto; el resto solo lo limitan. */
const REQUIRED = ["STORE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "MINIMAX_API_KEY", "ADMIN_TOKEN"];

const BASE_URL = process.env.BASE_URL || "https://myownmanga-jose-juan-jimenezs-projects.vercel.app";
const TARGET = process.env.TARGET || "production";
const apply = process.argv.includes("--apply");

/*
 * La CLI se ejecuta como script con node, no como el comando `vercel`. En
 * Windows ese comando es un .cmd, y desde el endurecimiento de spawn de 2024
 * Node se niega a ejecутar un .cmd sin shell — y pasar por un shell obligaría a
 * entrecomillar secretos en una línea de comandos. Esto lanza node directamente.
 */
const CLI = (() => {
  const bin = path.dirname(process.execPath);
  const candidates = [
    process.env.VERCEL_CLI,
    path.join(process.env.APPDATA || "", "npm", "node_modules", "vercel", "dist", "index.js"),
    path.join(bin, "node_modules", "vercel", "dist", "index.js"),
    path.join(bin, "..", "lib", "node_modules", "vercel", "dist", "index.js"),
    "/usr/local/lib/node_modules/vercel/dist/index.js",
    "/usr/lib/node_modules/vercel/dist/index.js",
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    console.error("\n  No encuentro la CLI de Vercel. `npm i -g vercel`, o pasa la ruta en VERCEL_CLI.\n");
    process.exit(1);
  }
  return found;
})();

const vercel = (args, input) =>
  execFileSync(process.execPath, [CLI, ...args], {
    input: input === undefined ? "" : input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

function set(name, value) {
  if (!apply) return "se pondría";
  try {
    vercel(["env", "rm", name, TARGET, "--yes"]);
  } catch (e) {
    /* no estaba: es el caso normal la primera vez */
  }
  vercel(["env", "add", name, TARGET], value);
  return "puesta";
}

const values = { ...Object.fromEntries(NEEDED.map((k) => [k, env[k]])), PUBLIC_BASE_URL: BASE_URL };

const missing = REQUIRED.filter((k) => !values[k]);
if (missing.length) {
  console.error(`\n  Falta en .env: ${missing.join(", ")}\n`);
  process.exit(1);
}

console.log(`\n  ${apply ? "Subiendo" : "Simulacro (usa --apply para subir)"} → entorno ${TARGET}\n`);
let done = 0;
let skipped = 0;
for (const [name, value] of Object.entries(values)) {
  if (value === undefined || value === "") {
    console.log(`  ·  ${name.padEnd(28)} no está en .env, se omite`);
    skipped++;
    continue;
  }
  const what = set(name, String(value));
  done++;
  console.log(`  ✓  ${name.padEnd(28)} ${what}${name === "PUBLIC_BASE_URL" ? ` (${BASE_URL})` : ""}`);
}
console.log(`\n  ${done} variables${skipped ? `, ${skipped} omitidas` : ""}.`);
if (apply) console.log("  Las coge el próximo despliegue. Haz un push, o Redeploy desde el panel.\n");
else console.log("");
