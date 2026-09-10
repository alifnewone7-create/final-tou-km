"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Default style brief for review generation — fully editable before every run.
const DEFAULT_PROMPT = `Ultra-realistic user reviews for a binary trading / signal provider channel.

LANGUAGE (STRICT):
- Natural mix of Bangla (বাংলা script) + Banglish (Roman Bangla)
- At least 40% FULLY Bangla script
- At least 30% mostly Bangla with a little Banglish
- The rest Banglish
- বাংলা অবশ্যই থাকতে হবে — never generate Banglish only, never English only

NAME USAGE (only in SOME reviews, not all):
- km nishat bhai / nishat vai / nishat ভাই
- Must feel real, e.g. "nishat bhai ajke bachaise 😭", "km nishat ভাই না থাকলে আজও লসেই থাকতাম"

WRITING STYLE (ULTRA HUMAN):
- Real typos: signal -> singal / signl, profit -> profitt / proft, bhai -> vai / vhai
- Casual slang: korsi, paisi, hoise, lagse, dhukbo, nibo, hoye gese
- Broken / incomplete sentences, some messy informal lines
- Occasional over-emotion: "bhaiiii 😭", "onek onek thanks"
- Some lines like a voice message converted to text

LENGTH (MUST MIX ALL):
- Short 1-line quick reactions
- Medium 1-2 lines
- Long 3-4 lines
- Large long 4-6 lines emotional / story type
- Never all the same length; mix randomly

TONE: excited 🔥, emotional 😭, grateful 🙏, shocked 😳, relief after loss

CONTENT IDEAS:
- Profit amounts: 30$, 50$, 100$, 150$+ (sometimes written as 100 dollar / ১০০$)
- Previously in loss -> now in profit
- VIP join interest, mentor respect
- "signal king", "market hacker", "boss", "legend"
- Beginner -> earning journey
- Real chat / voice style lines: "bhai sotti boltesi...", "ami usually comment kori na but ajke korte holo",
  "voice dile bujhate partam 😭", "ajke pura shock", "eta legit na hoile ami nai 😅"

HASHTAG FOLLOW-UPS (same person's extra line):
- Most reviews: no hashtags
- Some: 1, 2 or 3 short follow-ups, e.g. "vip e dhukte chai", "ki korte hobe", "আরো শিখতে চাই"

REALISM:
- Some with emoji, some without
- Some with double spaces / no punctuation / all lowercase
- No repetition — every review is a different person`

export function GenerateReviewsDialog({
  startAt,
  onText,
}: {
  // First list number to use, so generated reviews continue the existing list.
  startAt: number
  onText: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(100)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch("/api/generate-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, prompt, startAt }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? `Review generation failed (${res.status}).`)
        return
      }
      onText(String(data.text))
      toast.success(`${data.count} review(s) generated and added to the list.`)
      setOpen(false)
    } catch (e: any) {
      toast.error(e?.message ? `Review generation failed: ${e.message}` : "Review generation failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (loading ? null : setOpen(o))}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        data-testid="generate-reviews-open"
      >
        <Sparkles className="size-3.5 text-primary" />
        Generate with AI
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Generate reviews with AI
          </DialogTitle>
          <DialogDescription>
            Choose how many reviews you need and tune the style brief. They are added to the bulk list already
            numbered, with some reviews carrying #follow-up lines.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="review_quantity">Review quantity</Label>
            <Input
              id="review_quantity"
              type="number"
              min={1}
              max={500}
              value={quantity || ""}
              onChange={(e) => setQuantity(Math.min(500, Math.max(0, Number.parseInt(e.target.value || "0", 10))))}
              onBlur={(e) => {
                const n = Number.parseInt(e.target.value || "0", 10)
                setQuantity(Math.min(500, Math.max(1, Number.isNaN(n) ? 1 : n)))
              }}
              className="w-32"
              data-testid="generate-reviews-quantity"
            />
            <p className="text-xs text-muted-foreground">
              1 to 500 per run. Numbering starts at {startAt}. Big runs are generated in batches, so 100+ reviews
              take a little longer but never come back truncated.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="review_prompt">Prompt</Label>
            <Textarea
              id="review_prompt"
              rows={14}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="font-mono text-xs sm:text-sm"
              data-testid="generate-reviews-prompt"
            />
            <p className="text-xs text-muted-foreground">
              Edit freely — language ratios, names, typos, lengths and hashtag rules are all just text here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={generate}
            disabled={loading || !quantity || !prompt.trim()}
            className="gap-2"
            data-testid="generate-reviews-submit"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Generating…" : "Generate reviews"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
