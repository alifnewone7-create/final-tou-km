// Server-side tg-lion.net API client used by the website for the "Buy account"
// panel (balance, available countries, buying a number). Reading login codes
// happens on the Python agent (see LS_Python/agent/tglion.py); the website only
// needs balance / countries / getNumber.
//
// Config:
//   Buy Api section (stored in Neon): tg-lion API key + user id (`YourID`)
//   TGLION_BASE_URL  (.env, optional)  -> defaults to https://tg-lion.net
//
// IMPORTANT: use the APEX domain (tg-lion.net). The www. host serves the docs
// HTML page, not the JSON API, which is why get_balance was returning HTML.
//
// Every call parses JSON defensively so an empty body or HTML error page raises
// a clear error instead of the cryptic "Expecting value: line 1 column 1".

import { getTgLionCreds } from "@/lib/api-config"

const BASE_URL = (process.env.TGLION_BASE_URL || "https://tg-lion.net").replace(/\/+$/, "")

export class TgLionError extends Error {}

export interface TgLionCountry {
  name: string
  code_Num: string
  code: string
  qty: number
  price: string
}

async function creds() {
  const { apiKey, userId } = await getTgLionCreds()
  if (!apiKey || !userId) {
    throw new TgLionError("IMH Store API key and user ID are not set. Add them in the Api section (Buy Api tab).")
  }
  return { apiKey, userId }
}

async function call(action: string, extra: Record<string, string | undefined> = {}): Promise<any> {
  // Lazily check credentials only when actually making a call, not on module import.
  // This prevents the error from appearing at startup if the feature isn't being used.
  const { apiKey, userId } = await creds()
  const url = new URL(BASE_URL)
  url.searchParams.set("action", action)
  url.searchParams.set("apiKey", apiKey)
  url.searchParams.set("YourID", userId)
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") url.searchParams.set(k, v)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { cache: "no-store" })
  } catch (e: any) {
    throw new TgLionError(`IMH Store request failed (${action}): ${e?.message ?? e}`)
  }
  if (!res.ok) throw new TgLionError(`IMH Store ${action} failed: HTTP ${res.status}`)

  const body = (await res.text()).trim()
  if (!body) {
    throw new TgLionError(`IMH Store returned an empty response for ${action} (rate-limited or bad key). Try again.`)
  }
  let data: any
  try {
    data = JSON.parse(body)
  } catch {
    throw new TgLionError(`IMH Store did not return JSON for ${action} (blocked/maintenance?): ${body.slice(0, 200)}`)
  }
  const status = String(data?.status ?? "").toLowerCase()
  if (status && status !== "ok" && status !== "success") {
    const msg = data?.error || data?.message || body.slice(0, 200)
    throw new TgLionError(`IMH Store ${action} error: ${msg}`)
  }
  return data
}

export async function getBalance(): Promise<string> {
  const data = await call("get_balance")
  return String(data?.balance ?? "").trim()
}

export async function availableCountries(): Promise<Record<string, TgLionCountry>> {
  const data = await call("available_countries")
  return (data?.countries ?? {}) as Record<string, TgLionCountry>
}

export interface BuyNumberResult {
  name?: string
  Number: string
  price?: string
  new_balance?: number
}

export async function buyNumber(countryCode: string, maxPrice?: string): Promise<BuyNumberResult> {
  if (!countryCode) throw new TgLionError("A country is required to buy a number.")
  const data = await call("getNumber", { country_code: countryCode, maxPrice })
  const number = String(data?.Number ?? "").trim()
  if (!number) throw new TgLionError(`IMH Store did not return a number: ${JSON.stringify(data).slice(0, 200)}`)
  return data as BuyNumberResult
}
