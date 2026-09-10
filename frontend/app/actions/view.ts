"use server"

import { query, queryOne } from "@/lib/db"
import { isAuthenticated } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { isTelegramLink } from "@/lib/validation"
import type { SpeedMode, ViewTarget } from "@/lib/types"

const VALID_MODES: SpeedMode[] = ["slow", "medium", "fast"]

async function requireAuth() {
  if (!(await isAuthenticated())) throw new Error("Unauthorized")
}

/** Parse + validate the shared fields coming from the add/edit form. */
function parseFields(formData: FormData) {
  const link = String(formData.get("channel_link") ?? "").trim()

  // Optional chat_id. Lets the agent detect the channel instantly/reliably
  // instead of resolving it from the link. Channel ids are negative (e.g.
  // -1001234567890), so keep the sign. Blank -> null (auto-resolve).
  const chatIdRaw = String(formData.get("chat_id") ?? "").trim()
  let chatId: number | null = null
  if (chatIdRaw) {
    const n = Number.parseInt(chatIdRaw, 10)
    if (!Number.isNaN(n)) chatId = n
  }

  // "Low to high" per-post view count. 0/0 means "all userbots view".
  const viewMin = Math.max(0, Number.parseInt(String(formData.get("view_min") ?? "0"), 10) || 0)
  const viewMax = Math.max(0, Number.parseInt(String(formData.get("view_max") ?? "0"), 10) || 0)

  // Speed: how big a gap the agent leaves between two userbots on a post.
  const modeRaw = String(formData.get("mode") ?? "fast")
  const mode: SpeedMode = VALID_MODES.includes(modeRaw as SpeedMode) ? (modeRaw as SpeedMode) : "fast"

  return { link, chatId, viewMin, viewMax, mode }
}

function rangeError(fields: { viewMin: number; viewMax: number }): string | null {
  if (fields.viewMax > 0 && fields.viewMin > fields.viewMax) {
    return "View range: the low amount cannot be greater than the high amount."
  }
  return null
}

/**
 * Add a channel to the Live View watch list. The Python agent picks it up,
 * sets a future-only baseline, then auto-views every NEW post. When a view
 * range is set, each post gets a random number of viewers in [view_min,
 * view_max] so the count climbs gradually like real viewers arriving.
 */
export async function addViewTarget(formData: FormData) {
  await requireAuth()
  const fields = parseFields(formData)
  if (!fields.link) return { error: "Channel link is required." }
  if (!isTelegramLink(fields.link)) return { error: "Enter a valid Telegram link." }
  const err = rangeError(fields)
  if (err) return { error: err }

  const existing = await queryOne<ViewTarget>(`SELECT * FROM view_targets WHERE channel_link = $1`, [fields.link])
  if (existing) return { error: "That channel is already being watched." }

  await query(
    `INSERT INTO view_targets (channel_link, chat_id, view_min, view_max, mode, status, last_seen_message_id)
     VALUES ($1, $2, $3, $4, $5, 'active', 0)`,
    [fields.link, fields.chatId, fields.viewMin, fields.viewMax, fields.mode],
  )

  revalidatePath("/")
  return { ok: true }
}

/** Edit an existing target's chat_id / view count range. */
export async function updateViewTarget(targetId: number, formData: FormData) {
  await requireAuth()
  const fields = parseFields(formData)
  const err = rangeError(fields)
  if (err) return { error: err }

  await query(
    `UPDATE view_targets
     SET chat_id = $1, view_min = $2, view_max = $3, mode = $4, updated_at = now()
     WHERE id = $5`,
    [fields.chatId, fields.viewMin, fields.viewMax, fields.mode, targetId],
  )

  revalidatePath("/")
  return { ok: true }
}

/** Pause or resume auto-viewing for a channel. */
export async function toggleViewTarget(targetId: number, status: "active" | "paused") {
  await requireAuth()
  await query(`UPDATE view_targets SET status = $1, updated_at = now() WHERE id = $2`, [status, targetId])
  revalidatePath("/")
  return { ok: true }
}

/** Stop watching a channel and remove it. */
export async function removeViewTarget(targetId: number) {
  await requireAuth()
  await query(`DELETE FROM view_targets WHERE id = $1`, [targetId])
  revalidatePath("/")
  return { ok: true }
}
