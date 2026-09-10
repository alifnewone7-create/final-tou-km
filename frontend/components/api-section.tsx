"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  KeyRound,
  ShoppingCart,
  Sparkles,
  Loader2,
  Save,
  Trash2,
  Plus,
  RotateCcw,
  Ban,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react"
import { toast } from "sonner"

interface TgLionSettings {
  configured: boolean
  apiKeyMasked: string
  userIdMasked: string
}

interface AiKey {
  id: number
  label: string | null
  masked: string
  status: string
  cooldown_until: string | null
  last_error: string | null
  last_used_at: string | null
  uses: number
}

const STATUS_META: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: "Active", className: "bg-chart-3/20 text-chart-3 border-transparent", icon: CheckCircle2 },
  cooldown: { label: "Limit reached", className: "bg-chart-4/20 text-chart-4 border-transparent", icon: Clock },
  invalid: { label: "Invalid key", className: "bg-destructive/15 text-destructive border-transparent", icon: AlertCircle },
  disabled: { label: "Disabled", className: "bg-muted text-muted-foreground border-transparent", icon: Ban },
}

function relative(iso: string | null): string {
  if (!iso) return "never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(Math.abs(diff) / 60000)
  const label = mins < 1 ? "less than a minute" : mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`
  return diff >= 0 ? `${label} ago` : `in ${label}`
}

// ------------------------------------------------------------- Buy Api tab ---

function BuyApiTab() {
  const { data, mutate, isLoading } = useSWR<TgLionSettings>("/api/settings/tglion", fetcher)
  const [apiKey, setApiKey] = useState("")
  const [userId, setUserId] = useState("")
  const [saving, setSaving] = useState(false)

  const configured = Boolean(data?.configured)

  async function save() {
    const nextKey = apiKey.trim()
    const nextUser = userId.trim()
    if (!configured && (!nextKey || !nextUser)) {
      toast.error("Enter both the IMH Store API key and user ID.")
      return
    }
    if (!nextKey && !nextUser) {
      toast.error("Change the API key or the user ID first.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/settings/tglion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: nextKey, userId: nextUser }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Failed to save.")
      toast.success("Buy Api credentials saved.")
      setApiKey("")
      setUserId("")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    try {
      const res = await fetch("/api/settings/tglion", { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete.")
      toast.success("Buy Api credentials deleted.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4 text-primary" />
            IMH Store credentials
          </CardTitle>
          {isLoading ? null : (
            <Badge className={configured ? STATUS_META.active.className : STATUS_META.disabled.className}>
              {configured ? "Configured" : "Not set"}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tglion_key">Api key</Label>
              <Input
                id="tglion_key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={data?.apiKeyMasked || "Paste the IMH Store API key"}
                className="h-11 font-mono"
                autoComplete="off"
                data-testid="tglion-key-input"
              />
              {data?.apiKeyMasked ? (
                <p className="text-xs text-muted-foreground">
                  Saved key: <span className="font-mono">{data.apiKeyMasked}</span>
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tglion_user">User ID</Label>
              <Input
                id="tglion_user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={data?.userIdMasked || "e.g. 4931827506"}
                inputMode="numeric"
                type="password"
                className="h-11 font-mono"
                autoComplete="off"
                data-testid="tglion-user-input"
              />
              {data?.userIdMasked ? (
                <p className="text-xs text-muted-foreground">
                  Saved user ID: <span className="font-mono">{data.userIdMasked}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={save} disabled={saving} className="w-full gap-2 sm:w-auto" data-testid="tglion-save">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {configured ? "Update credentials" : "Save credentials"}
            </Button>

            {configured ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full gap-2 bg-transparent sm:w-auto" data-testid="tglion-delete">
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Buy Api credentials?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Buying numbers and reading login codes from IMH Store will stop working until you add them again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// -------------------------------------------------------------- Ai Api tab ---

function AiApiTab() {
  const { data, mutate } = useSWR<{ keys: AiKey[] }>("/api/settings/ai-keys", fetcher, { refreshInterval: 10000 })
  const keys = data?.keys ?? []
  const [raw, setRaw] = useState("")
  const [adding, setAdding] = useState(false)

  const activeCount = keys.filter((k) => k.status === "active").length

  async function add() {
    if (!raw.trim()) {
      toast.error("Paste at least one Groq API key.")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/settings/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: raw }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Failed to add keys.")
      toast.success(`${json.added} key${json.added === 1 ? "" : "s"} added.`)
      setRaw("")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add keys.")
    } finally {
      setAdding(false)
    }
  }

  async function patch(id: number, action: "enable" | "disable" | "reset") {
    try {
      const res = await fetch("/api/settings/ai-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Failed to update the key.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the key.")
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/api/settings/ai-keys?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete the key.")
      toast.success("Key deleted.")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete the key.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Groq api keys
          </CardTitle>
          <Badge className={activeCount > 0 ? STATUS_META.active.className : STATUS_META.disabled.className}>
            {activeCount} active / {keys.length} total
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="groq_keys">Add keys (one per line)</Label>
            <Textarea
              id="groq_keys"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={4}
              placeholder={"gsk_xxxxxxxxxxxxxxxx\ngsk_yyyyyyyyyyyyyyyy"}
              className="font-mono text-sm"
              data-testid="ai-keys-input"
            />
          </div>
          <Button onClick={add} disabled={adding} className="w-full gap-2 sm:w-auto" data-testid="ai-keys-add">
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add keys
          </Button>
          <p className="text-xs text-muted-foreground">
            Keys are used one at a time, top to bottom. When a key runs out of credit or hits its limit, the next key
            takes over automatically — and the parked key returns to rotation as soon as its limit resets.
          </p>
        </CardContent>
      </Card>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <KeyRound className="size-5" />
          </div>
          <p className="text-sm font-medium">No AI keys yet</p>
          <p className="text-xs text-muted-foreground">Add a Groq key to enable Generate with AI.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {keys.map((k, idx) => {
            const meta = STATUS_META[k.status] ?? STATUS_META.disabled
            return (
              <Card key={k.id} data-testid={`ai-key-card-${k.id}`}>
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
                        {idx + 1}
                      </span>
                      <span className="truncate font-mono text-sm">{k.masked}</span>
                    </div>
                    <Badge className={`gap-1 ${meta.className}`}>
                      <meta.icon className="size-3.5" />
                      {meta.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Used {k.uses} times</span>
                    <span>Last used {relative(k.last_used_at)}</span>
                    {k.status === "cooldown" && k.cooldown_until ? (
                      <span>Retries {relative(k.cooldown_until)}</span>
                    ) : null}
                  </div>

                  {k.last_error ? (
                    <p className="line-clamp-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {k.last_error}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {k.status === "disabled" ? (
                      <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => patch(k.id, "enable")}>
                        <CheckCircle2 className="size-3.5" />
                        Enable
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => patch(k.id, "disable")}>
                        <Ban className="size-3.5" />
                        Disable
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => patch(k.id, "reset")}>
                      <RotateCcw className="size-3.5" />
                      Reset
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5 bg-transparent text-destructive">
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this AI key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <span className="font-mono">{k.masked}</span> will be removed from rotation.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(k.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------- Api section ---

export function ApiSection() {
  const [tab, setTab] = useState<"buy" | "ai">("buy")

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 text-sm md:max-w-md">
        <button
          type="button"
          onClick={() => setTab("buy")}
          data-testid="api-tab-buy"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition-colors ${
            tab === "buy" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <ShoppingCart className="size-4" />
          Buy Api
        </button>
        <button
          type="button"
          onClick={() => setTab("ai")}
          data-testid="api-tab-ai"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition-colors ${
            tab === "ai" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Sparkles className="size-4" />
          Ai Api
        </button>
      </div>

      {tab === "buy" ? <BuyApiTab /> : <AiApiTab />}
    </div>
  )
}
