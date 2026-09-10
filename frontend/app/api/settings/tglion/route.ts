import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { clearTgLionCreds, getTgLionCreds, maskId, maskKey, saveTgLionCreds } from "@/lib/api-config"

// Buy Api credentials (IMH Store). Stored in Neon, editable + deletable from the
// panel. Neither the raw key nor the raw user id is ever sent to the browser —
// only masked previews.
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { apiKey, userId } = await getTgLionCreds()
    return NextResponse.json({
      configured: Boolean(apiKey && userId),
      apiKeyMasked: maskKey(apiKey),
      userIdMasked: maskId(userId),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load settings." }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const existing = await getTgLionCreds().catch(() => ({ apiKey: "", userId: "" }))
  // Leaving a field empty keeps whatever is already saved.
  const apiKey = String(body?.apiKey ?? "").trim() || existing.apiKey
  const userId = String(body?.userId ?? "").trim() || existing.userId
  if (!apiKey || !userId) {
    return NextResponse.json({ error: "Both the API key and user ID are required." }, { status: 400 })
  }
  try {
    await saveTgLionCreds(apiKey, userId)
    return NextResponse.json({
      ok: true,
      configured: true,
      apiKeyMasked: maskKey(apiKey),
      userIdMasked: maskId(userId),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to save." }, { status: 500 })
  }
}

export async function DELETE() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    await clearTgLionCreds()
    return NextResponse.json({ ok: true, configured: false })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to delete." }, { status: 500 })
  }
}
