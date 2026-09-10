import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { addAiKeys, deleteAiKey, listAiKeys, maskKey, updateAiKey } from "@/lib/api-config"

// Ai Api keys (Groq). Multiple keys are supported: the app uses them one after
// another and automatically switches when a key's credit / rate limit runs out.
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const rows = await listAiKeys()
    return NextResponse.json({
      keys: rows.map((r) => ({
        id: r.id,
        label: r.label,
        masked: maskKey(r.api_key),
        status: r.status,
        cooldown_until: r.cooldown_until,
        last_error: r.last_error,
        last_used_at: r.last_used_at,
        uses: r.uses,
        created_at: r.created_at,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load AI keys." }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const raw = String(body?.keys ?? body?.apiKey ?? "").trim()
  if (!raw) return NextResponse.json({ error: "Paste at least one Groq API key." }, { status: 400 })
  try {
    const added = await addAiKeys(raw, body?.label ? String(body.label) : undefined)
    if (added === 0) {
      return NextResponse.json({ error: "Nothing added — those keys are already saved." }, { status: 400 })
    }
    return NextResponse.json({ ok: true, added })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to add keys." }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = Number.parseInt(String(body?.id ?? ""), 10)
  const action = String(body?.action ?? "")
  if (!id || !["enable", "disable", "reset"].includes(action)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  try {
    await updateAiKey(id, action as "enable" | "disable" | "reset", body?.label ?? null)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to update the key." }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = Number.parseInt(new URL(req.url).searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "Missing key id." }, { status: 400 })
  try {
    await deleteAiKey(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to delete the key." }, { status: 500 })
  }
}
