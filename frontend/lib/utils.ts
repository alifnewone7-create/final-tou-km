import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Technical / transient worker errors that should never be surfaced in the UI
// (e.g. "resolve failed, retrying in ~300s: Telegram says: [400 CHANNEL_INVALID] ... Pyrogram ...")
const HIDDEN_ERROR_PATTERNS = [
  /resolve failed/i,
  /retrying in/i,
  /pyrogram/i,
  /telegram says/i,
  /channel_invalid/i,
  /caused by/i,
  /peer_id_invalid/i,
  /username_invalid/i,
  /username_not_occupied/i,
  /getchannels/i,
  /traceback/i,
]

export function visibleError(message?: string | null): string | null {
  if (!message) return null
  const msg = String(message).trim()
  if (!msg) return null
  if (HIDDEN_ERROR_PATTERNS.some((re) => re.test(msg))) return null
  return msg
}
