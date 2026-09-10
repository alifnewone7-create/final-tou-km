import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { AiKeyError, groqChat } from "@/lib/api-config"

// Groq is OpenAI-compatible. Keys come from the Api section (Neon); the model
// name is fixed in lib/api-config.ts.

// Reviews are generated in small batches so a 100-500 review run never hits the
// model's output limit (which used to truncate the JSON and fail the whole run).
const BATCH = 20
// How many batches run at the same time. Kept low so Groq's rate limit is safe.
const PARALLEL = 3

const SYSTEM = `You write ultra-realistic Telegram channel reviews written by REAL Bangladeshi people.

Return ONLY valid JSON in this exact shape:
{"reviews":[{"text":"...","hashtags":["..."]}]}

Hard rules:
- Produce EXACTLY the requested number of review objects.
- "text" is the review itself. NEVER put a number, "1." prefix, quotes or a # inside "text".
- "hashtags" is a follow-up written by the SAME person (short extra lines). Most reviews should have an EMPTY array; only some get 1, 2 or 3.
- Every review must read like a DIFFERENT person. No repeated sentences, no template feeling.
- Mix lengths on purpose: some 1 short line, some 1-2 lines, some 3-4 lines, some 4-6 line emotional/story type.
- Follow the user's language, tone and style brief EXACTLY (Bangla script vs Banglish ratios, typos, slang, emoji usage).
- Real people type messy: keep some lines without punctuation, some with double spaces, some ALL lowercase, a few with spelling mistakes. Never make it look proofread.
- No English-only marketing copy, no AI voice, no disclaimers, no explanations outside the JSON.`

type Review = { text: string; hashtags: string[] }

async function generateBatch(
  prompt: string,
  count: number,
  batchNo: number,
  totalBatches: number,
): Promise<Review[]> {
  const data = await groqChat({
    temperature: 1.05,
    top_p: 0.95,
    max_completion_tokens: Math.min(16000, 800 + count * 260),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Generate EXACTLY ${count} reviews.\n` +
          `This is batch ${batchNo} of ${totalBatches} for the same channel, so make this batch's wording, ` +
          `names, amounts, lengths and emotions clearly different from any other batch.\n\n` +
          `STYLE BRIEF (follow strictly):\n${prompt}`,
      },
    ],
  })

  const content = data?.choices?.[0]?.message?.content
  const parsed = JSON.parse(String(content ?? "{}"))
  const raw = Array.isArray(parsed) ? parsed : (parsed.reviews ?? parsed.list ?? parsed.items ?? [])

  return (Array.isArray(raw) ? raw : [])
    .map((r: any) => {
      const text = String(typeof r === "string" ? r : (r?.text ?? r?.review ?? ""))
        // Strip any numbering / stray # the model may still add.
        .replace(/^\s*\d{1,3}[.)]\s*/, "")
        .replace(/^#+\s*/gm, "")
        .trim()
      const tags = Array.isArray(r?.hashtags) ? r.hashtags : []
      const hashtags = tags
        .map((t: unknown) => String(t).replace(/^#+\s*/, "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 3)
      return { text, hashtags }
    })
    .filter((r: Review) => r.text.length > 0)
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const quantity = Math.min(500, Math.max(1, Number.parseInt(String(body?.quantity ?? "0"), 10) || 0))
  const prompt = String(body?.prompt ?? "").trim()
  const startAt = Math.max(1, Number.parseInt(String(body?.startAt ?? "1"), 10) || 1)
  if (!quantity) return NextResponse.json({ error: "Enter how many reviews you need." }, { status: 400 })
  if (!prompt) return NextResponse.json({ error: "Enter a prompt describing the review style." }, { status: 400 })

  // Split into batches of BATCH and run a few at a time.
  const sizes: number[] = []
  for (let left = quantity; left > 0; left -= BATCH) sizes.push(Math.min(BATCH, left))

  const collected: Review[] = []
  let lastError = ""
  for (let i = 0; i < sizes.length; i += PARALLEL) {
    const slice = sizes.slice(i, i + PARALLEL)
    const results = await Promise.all(
      slice.map((count, k) =>
        generateBatch(prompt, count, i + k + 1, sizes.length).catch((e) => {
          lastError = e instanceof AiKeyError || e instanceof Error ? e.message : String(e)
          return [] as Review[]
        }),
      ),
    )
    for (const part of results) collected.push(...part)
  }

  // Drop duplicates (case-insensitive) so every account posts something unique.
  const seen = new Set<string>()
  const reviews = collected
    .filter((r) => {
      const k = r.text.toLowerCase().replace(/\s+/g, " ")
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, quantity)

  if (reviews.length === 0) {
    return NextResponse.json(
      { error: lastError || "AI returned no reviews. Try again." },
      { status: 502 },
    )
  }

  // Format straight into the Bulk list syntax: "N. review" + "#follow-up" lines,
  // which the Review section already parses into per-account messages.
  const text = reviews
    .map((r, idx) => {
      const lines = [`${startAt + idx}. ${r.text.replace(/\n{3,}/g, "\n\n")}`]
      for (const tag of r.hashtags) lines.push(`#${tag}`)
      return lines.join("\n")
    })
    .join("\n")

  return NextResponse.json({ text, count: reviews.length })
}
