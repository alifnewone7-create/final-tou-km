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

// Default style brief — editable before every run.
const DEFAULT_PROMPT = `Mix these styles across the list:
- Bangladeshi boy names
- Anime names and anime-style names
- Some names spelled correctly, some intentionally misspelled (stylish wrong spelling)
- Trading style names (trading only — no forex or other niches)
- Some names with emoji, some without
- Some first name only, some first + last name
- Random stylish names`

export function GenerateNamesDialog({ onNames }: { onNames: (names: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(20)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch("/api/generate-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, prompt }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? `Name generation failed (${res.status}).`)
        return
      }
      onNames(data.names as string[])
      toast.success(`${data.names.length} name(s) generated.`)
      setOpen(false)
    } catch (e: any) {
      toast.error(e?.message ? `Name generation failed: ${e.message}` : "Name generation failed. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        data-testid="generate-names-open"
      >
        <Sparkles className="size-3.5 text-primary" />
        Generate with AI
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Generate names with AI
          </DialogTitle>
          <DialogDescription>
            Pick how many names you need and describe the styles. The names are added to your list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name_quantity">Name quantity</Label>
            <Input
              id="name_quantity"
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
              data-testid="generate-names-quantity"
            />
            <p className="text-xs text-muted-foreground">1 to 500 names per run.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name_prompt">Prompt</Label>
            <Textarea
              id="name_prompt"
              rows={9}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="text-sm"
              data-testid="generate-names-prompt"
            />
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
            data-testid="generate-names-submit"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Generating…" : "Generate names"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
