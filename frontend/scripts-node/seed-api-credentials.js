// One-off: move the API credentials that used to live in .env into Neon so the
// new Api section starts out configured. Safe to re-run (idempotent upserts).
const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")

const envPath = path.join(__dirname, "..", ".env")
const env = {}
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 })

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS api_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_api_keys (
    id SERIAL PRIMARY KEY, label TEXT, api_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active', cooldown_until TIMESTAMPTZ, last_error TEXT,
    last_used_at TIMESTAMPTZ, uses INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)

  const pairs = [
    ["tglion_api_key", process.argv[2] || env.TGLION_API_KEY || ""],
    ["tglion_user_id", process.argv[3] || env.TGLION_USER_ID || ""],
  ]
  for (const [key, value] of pairs) {
    if (!value) continue
    await pool.query(
      `INSERT INTO api_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    )
    console.log("seeded", key)
  }

  const groq = process.argv[4] || env.GROQ_API_KEY || ""
  if (groq) {
    const res = await pool.query(
      `INSERT INTO ai_api_keys (api_key, label) VALUES ($1, 'imported from .env')
       ON CONFLICT (api_key) DO NOTHING RETURNING id`,
      [groq],
    )
    console.log("groq key rows added:", res.rowCount)
  }
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
