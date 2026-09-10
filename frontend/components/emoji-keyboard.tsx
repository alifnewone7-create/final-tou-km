"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { EMOJI_CATEGORIES, TELEGRAM_REACTIONS } from "@/lib/emoji-data"
import {
  Star,
  Smile,
  Hand,
  Leaf,
  Pizza,
  Trophy,
  Plane,
  Lightbulb,
  Hash,
  Flag,
  X,
} from "lucide-react"

// Extracts ONLY emoji characters from an arbitrary string.
export function keepEmojiOnly(input: string): string {
  if (!input) return ""
  const emojiPattern =
    /(\p{RI}\p{RI}|\p{Extended_Pictographic}(\u{FE0F}|\u{20E3})?(\u200D\p{Extended_Pictographic}(\u{FE0F}|\u{20E3})?)*|[0-9#*]\u{FE0F}?\u{20E3})/gu
  const matches = input.match(emojiPattern)
  return matches ? matches.join("") : ""
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  popular: Star,
  smileys: Smile,
  people: Hand,
  nature: Leaf,
  food: Pizza,
  activity: Trophy,
  travel: Plane,
  objects: Lightbulb,
  symbols: Hash,
  flags: Flag,
}

const TABS = [
  { id: "popular", label: "Telegram", emojis: TELEGRAM_REACTIONS },
  ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: c.label, emojis: c.emojis })),
]

export function EmojiKeyboard({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[]
  onToggle: (emoji: string) => void
  onClear?: () => void
}) {
  const [tab, setTab] = useState("popular")

  const active = useMemo(() => TABS.find((t) => t.id === tab) ?? TABS[0], [tab])

  return (
    <div className="flex flex-col gap-2">
      {/* Selected chips */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2">
          {selected.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onToggle(e)}
              title="Remove"
              className="flex items-center gap-1 rounded-md bg-background px-2 py-1 text-base leading-none shadow-sm transition-colors hover:bg-destructive/10"
            >
              <span>{e}</span>
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Keyboard */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Category tabs — horizontally scrollable on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-1.5 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const Icon = ICONS[t.id] ?? Smile
            const isActive = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                title={t.label}
                aria-label={t.label}
                aria-pressed={isActive}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors",
                  isActive
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>

        <div className="px-2.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {active.label}
        </div>

        {/* Emoji grid */}
        <div className="max-h-56 overflow-y-auto overscroll-contain p-2 sm:max-h-64">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1">
            {active.emojis.map((e, i) => {
              const isSel = selected.includes(e)
              return (
                <button
                  key={`${e}-${i}`}
                  type="button"
                  onClick={() => onToggle(e)}
                  aria-pressed={isSel}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border text-xl leading-none transition-colors active:scale-95",
                    isSel
                      ? "border-primary bg-primary/15"
                      : "border-transparent hover:border-border hover:bg-muted",
                  )}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
