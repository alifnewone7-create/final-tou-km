import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { isAuthenticated } from "@/lib/auth"
import type { ProfileAccountRow } from "@/lib/types"

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Each account with its MOST RECENT profile EDIT and, separately, its most
  // recent photo DELETE. They are kept apart on purpose: a name/photo update in
  // the Profile section must never show up as "Deleted" in Prp Delete, and vice
  // versa. Each section reads only its own status columns.
  const accounts = await query<ProfileAccountRow>(
    `SELECT
       a.id,
       a.label,
       a.phone_number,
       a.status,
       pu.status     AS profile_status,
       pu.last_error AS profile_error,
       pu.updated_at AS profile_updated_at,
       pd.status     AS delete_status,
       pd.last_error AS delete_error,
       pd.updated_at AS delete_updated_at
     FROM telegram_accounts a
     LEFT JOIN LATERAL (
       SELECT status, last_error, updated_at
       FROM profile_updates
       WHERE account_id = a.id AND kind = 'update'
       ORDER BY id DESC
       LIMIT 1
     ) pu ON true
     LEFT JOIN LATERAL (
       SELECT status, last_error, updated_at
       FROM profile_updates
       WHERE account_id = a.id AND kind = 'delete'
       ORDER BY id DESC
       LIMIT 1
     ) pd ON true
     WHERE a.status = 'logged_in'
     ORDER BY a.created_at DESC`,
  )

  return NextResponse.json({ accounts })
}
