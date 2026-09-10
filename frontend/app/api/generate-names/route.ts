import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { AiKeyError, groqChat } from "@/lib/api-config"

// Groq is OpenAI-compatible. Keys come from the Api section (Neon); the model
// name is fixed in lib/api-config.ts.

const SYSTEM = `You generate Telegram display names for userbot accounts.
Return ONLY JSON: {"names": ["...", "..."]}.
Rules:
- Exactly the requested amount of names, no numbering, no explanations.
- Every name must be different from the others.
- Keep each name short enough for Telegram (max 60 characters).
- Follow the user's style instructions closely and mix the styles they list.`

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const quantity = Math.min(500, Math.max(1, Number.parseInt(String(body?.quantity ?? "0"), 10) || 0))
  const prompt = String(body?.prompt ?? "").trim()
  if (!quantity) return NextResponse.json({ error: "Enter how many names you need." }, { status: 400 })
  if (!prompt) return NextResponse.json({ error: "Enter a prompt describing the name styles." }, { status: 400 })

  let data: any
  try {
    data = await groqChat({
      temperature: 1,
      max_completion_tokens: Math.min(16000, 300 + quantity * 40),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Generate exactly ${quantity} names.\n\nStyle instructions:\n${prompt}` },
      ],
    })
  } catch (e: any) {
    const message = e instanceof AiKeyError ? e.message : (e?.message ?? "Could not reach the AI service.")
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const content = data?.choices?.[0]?.message?.content
  let names: string[] = []
  try {
    const parsed = JSON.parse(String(content ?? "{}"))
    const raw = Array.isArray(parsed) ? parsed : (parsed.names ?? parsed.list ?? [])
    names = (Array.isArray(raw) ? raw : [])
      .map((n: unknown) => String(n).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, quantity)
  } catch {
    return NextResponse.json({ error: "AI returned an unreadable answer. Try again." }, { status: 502 })
  }

  // Drop duplicates (case-insensitive) so the pool stays usable.
  const seen = new Set<string>()
  names = names.filter((n) => {
    const k = n.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  if (names.length === 0) {
    return NextResponse.json({ error: "AI returned no names. Try again." }, { status: 502 })
  }
  return NextResponse.json({ names })
}
