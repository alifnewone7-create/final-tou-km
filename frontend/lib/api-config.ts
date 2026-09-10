import "server-only"
import { query, queryOne } from "@/lib/db"

// =============================================================================
// API credentials live in the database (Neon), NOT in .env
// =============================================================================
// * Buy Api  -> tg-lion apiKey + user id (api_settings table). Only the tg-lion
//               BASE URL stays in .env (TGLION_BASE_URL).
// * Ai Api   -> one or more Groq API keys (ai_api_keys table). The model name is
//               hardcoded below, never in .env.

export const GROQ_MODEL = "openai/gpt-oss-120b"
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

export class AiKeyError extends Error {}

// Shows enough of a key to recognise it, never the whole secret.
export function maskKey(value: string): string {
  const v = (value || "").trim()
  if (v.length <= 10) return v ? `${v.slice(0, 2)}****` : ""
  return `${v.slice(0, 6)}****${v.slice(-4)}`
}

// Short ids (like the store user id) are hidden the same way: dots + last 4.
export function maskId(value: string): string {
  const v = (value || "").trim()
  if (!v) return ""
  if (v.length <= 4) return "••••"
  return `••••${v.slice(-4)}`
}

// ---------------------------------------------------------------- Buy Api ----

export interface TgLionCreds {
  apiKey: string
  userId: string
}

export async function getTgLionCreds(): Promise<TgLionCreds> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM api_settings WHERE key IN ('tglion_api_key', 'tglion_user_id')`,
  )
  const map = new Map(rows.map((r) => [r.key, (r.value || "").trim()]))
  return {
    apiKey: map.get("tglion_api_key") ?? "",
    userId: map.get("tglion_user_id") ?? "",
  }
}

export async function saveTgLionCreds(apiKey: string, userId: string): Promise<void> {
  const entries: [string, string][] = [
    ["tglion_api_key", apiKey.trim()],
    ["tglion_user_id", userId.trim()],
  ]
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO api_settings (key, value, updated_at)
            VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value],
    )
  }
}

export async function clearTgLionCreds(): Promise<void> {
  await query(`DELETE FROM api_settings WHERE key IN ('tglion_api_key', 'tglion_user_id')`)
}

// ----------------------------------------------------------------- Ai Api ----

export interface AiKeyRow {
  id: number
  label: string | null
  api_key: string
  status: string
  cooldown_until: string | null
  last_error: string | null
  last_used_at: string | null
  uses: number
  created_at: string
}

// Any key whose rate-limit window has passed becomes usable again. This is what
// makes "key finished -> use the next one -> come back to it after the reset"
// work without anybody touching the panel.
async function releaseExpiredCooldowns(): Promise<void> {
  await query(
    `UPDATE ai_api_keys
        SET status = 'active', cooldown_until = NULL, updated_at = now()
      WHERE status = 'cooldown'
        AND (cooldown_until IS NULL OR cooldown_until <= now())`,
  )
}

export async function listAiKeys(): Promise<AiKeyRow[]> {
  await releaseExpiredCooldowns()
  return query<AiKeyRow>(`SELECT * FROM ai_api_keys ORDER BY id`)
}

export async function addAiKeys(raw: string, label?: string): Promise<number> {
  const keys = Array.from(
    new Set(
      String(raw || "")
        .split(/[\s,;]+/)
        .map((k) => k.trim())
        .filter((k) => k.length >= 10),
    ),
  )
  let added = 0
  for (const key of keys) {
    const row = await queryOne<{ id: number }>(
      `INSERT INTO ai_api_keys (api_key, label)
            VALUES ($1, $2)
       ON CONFLICT (api_key) DO NOTHING
         RETURNING id`,
      [key, (label || "").trim() || null],
    )
    if (row) added += 1
  }
  return added
}

export async function deleteAiKey(id: number): Promise<void> {
  await query(`DELETE FROM ai_api_keys WHERE id = $1`, [id])
}

export async function updateAiKey(
  id: number,
  action: "enable" | "disable" | "reset",
  label?: string | null,
): Promise<void> {
  if (action === "disable") {
    await query(`UPDATE ai_api_keys SET status = 'disabled', updated_at = now() WHERE id = $1`, [id])
    return
  }
  // enable + reset both put the key back in rotation and clear the last error.
  await query(
    `UPDATE ai_api_keys
        SET status = 'active', cooldown_until = NULL, last_error = NULL,
            label = COALESCE($2, label), updated_at = now()
      WHERE id = $1`,
    [id, label ?? null],
  )
}

// Keys are used top-to-bottom (oldest first). A key keeps being used until it
// runs out of credit / hits its limit, then we move to the next one.
async function usableKeys(): Promise<AiKeyRow[]> {
  await releaseExpiredCooldowns()
  return query<AiKeyRow>(`SELECT * FROM ai_api_keys WHERE status = 'active' ORDER BY id`)
}

async function markUsed(id: number): Promise<void> {
  await query(
    `UPDATE ai_api_keys SET uses = uses + 1, last_used_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`,
    [id],
  )
}

async function markCooldown(id: number, seconds: number, detail: string): Promise<void> {
  await query(
    `UPDATE ai_api_keys
        SET status = 'cooldown',
            cooldown_until = now() + make_interval(secs => $2::int),
            last_error = $3,
            updated_at = now()
      WHERE id = $1`,
    [id, Math.max(30, Math.min(seconds, 86400)), detail.slice(0, 300)],
  )
}

async function markInvalid(id: number, detail: string): Promise<void> {
  await query(`UPDATE ai_api_keys SET status = 'invalid', last_error = $2, updated_at = now() WHERE id = $1`, [
    id,
    detail.slice(0, 300),
  ])
}

// How long to park a key that reported a limit. Groq sends `retry-after` for
// per-minute limits; daily limits get an hour so we retry them later.
function cooldownSeconds(res: Response, detail: string): number {
  const header = Number(res.headers.get("retry-after"))
  if (Number.isFinite(header) && header > 0) return Math.ceil(header) + 2
  if (/per\s?day|daily|RPD|TPD|out of credit|insufficient|quota/i.test(detail)) return 3600
  return 3600
}

// Pull the human-readable reason out of Groq's error body so the panel can show
// "Organization has been restricted" instead of a bare "failed (400)".
function errorMessage(raw: string): { message: string; code: string } {
  try {
    const j = JSON.parse(raw)
    const err = j?.error ?? j
    return {
      message: String(err?.message ?? raw ?? "").trim(),
      code: String(err?.code ?? err?.type ?? "").trim(),
    }
  } catch {
    return { message: (raw || "").trim(), code: "" }
  }
}

// Permanently broken keys/organizations: retrying them is pointless, so they are
// marked invalid and skipped from now on while the next key takes over.
const DEAD_KEY = /organization[_\s-]?restricted|organization has been restricted|invalid[_\s-]?api[_\s-]?key|api key not found|deactivated|disabled|suspended|terminated|unauthorized|permission/i

// Temporary problems (limits, credit, overload) -> park the key and come back
// to it once the window resets.
const LIMIT = /rate.?limit|quota|credit|too many requests|capacity|overloaded|over_capacity|try again later/i

// Single entry point for every AI call in the app. Rotates through the stored
// Groq keys top-to-bottom: the first working key wins and, the moment one is
// exhausted or restricted, it is parked/marked and the NEXT key takes over
// transparently. Rotation continues until a key succeeds or all of them fail.
export async function groqChat(payload: Record<string, unknown>): Promise<any> {
  const keys = await usableKeys()
  if (keys.length === 0) {
    throw new AiKeyError("No usable AI key. Add a Groq API key in the Api section (Ai Api tab).")
  }

  const reasons: string[] = []
  let lastError = ""

  for (const key of keys) {
    let res: Response
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: GROQ_MODEL, ...payload }),
        cache: "no-store",
      })
    } catch (e: any) {
      // Network hiccup: don't blame the key, just try the next one.
      lastError = `Could not reach the AI service: ${e?.message ?? e}`
      reasons.push(`${maskKey(key.api_key)}: network error`)
      continue
    }

    if (res.ok) {
      await markUsed(key.id)
      return res.json()
    }

    const raw = await res.text().catch(() => "")
    const { message, code } = errorMessage(raw)
    const detail = message || raw || `HTTP ${res.status}`
    const probe = `${code} ${detail}`

    if (res.status === 401 || res.status === 403 || DEAD_KEY.test(probe)) {
      // Dead key / restricted org -> park it for good and move on instantly.
      await markInvalid(key.id, detail)
      lastError = `An AI key is unusable (${detail.slice(0, 120)}) — switched to the next key.`
    } else if (res.status === 429 || res.status === 402 || LIMIT.test(probe)) {
      // Quota finished -> cooldown and move on instantly.
      await markCooldown(key.id, cooldownSeconds(res, detail), detail)
      lastError = `An AI key hit its limit (${detail.slice(0, 120)}) — switched to the next key.`
    } else {
      // Anything else (bad model name, malformed request, 5xx): keep the key
      // usable but still try the remaining keys.
      lastError = `AI request failed (${res.status}). ${detail.slice(0, 160)}`
    }

    reasons.push(`${maskKey(key.api_key)}: ${detail.slice(0, 120)}`)
  }

  // Every key was tried and none worked - tell the user exactly why.
  const unique = Array.from(new Set(reasons.map((r) => r.split(": ").slice(1).join(": "))))
  const why = unique.length === 1 ? unique[0] : reasons.join(" | ")
  throw new AiKeyError(
    `All ${keys.length} AI key(s) failed — ${why || lastError}. ` +
      `Add a working Groq API key in the Api section (Ai Api tab).`,
  )
}
