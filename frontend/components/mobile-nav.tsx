"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Menu, X, Users, LogOut, Eye, Vote, Smile, UserCog, UserPlus, Trash2, MessageSquare, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logoutAction } from "@/app/actions/auth"
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

interface Tab {
  value: string
  label: string
  icon: React.ReactNode
}

const TABS: Tab[] = [
  { value: "accounts", label: "Users", icon: <Users className="size-[18px]" /> },
  { value: "channel-join", label: "Channel Join", icon: <UserPlus className="size-[18px]" /> },
  { value: "view", label: "Live View", icon: <Eye className="size-[18px]" /> },
  { value: "vote", label: "Vote", icon: <Vote className="size-[18px]" /> },
  { value: "reactions", label: "Reactions", icon: <Smile className="size-[18px]" /> },
  { value: "profile", label: "Profile", icon: <UserCog className="size-[18px]" /> },
  { value: "prp-delete", label: "Prp Delete", icon: <Trash2 className="size-[18px]" /> },
  { value: "review", label: "Review", icon: <MessageSquare className="size-[18px]" /> },
  { value: "api", label: "Api", icon: <KeyRound className="size-[18px]" /> },
]

interface MobileNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Lock body scroll when the sidebar is open (avoids iOS background scroll bleed)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  const overlay = (
    <>
      {/* Backdrop - tap outside to close */}
      <div
        className={`fixed inset-0 z-[100] bg-black/60 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden={!isOpen}
      />

      {/* Left-side sliding sidebar */}
      <aside
        data-testid="mobile-nav-sheet"
        className={`fixed inset-y-0 left-0 z-[101] flex w-[85vw] max-w-xs flex-col border-r border-border/60 bg-card shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Sidebar header with logo + close */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-xl bg-primary/40 blur-md" aria-hidden />
              <img
                src="/telegram-ultra.png"
                alt="Telegram Ultra"
                className="relative size-10 rounded-xl object-cover ring-1 ring-white/10"
              />
            </div>
            <div>
              <p className="font-heading text-sm font-bold leading-tight tracking-tight">Telegram Ultra</p>
              <p className="text-xs text-muted-foreground">Control Panel</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Close menu" data-testid="mobile-nav-close">
            <X className="size-5" />
          </Button>
        </div>

        {/* Nav items */}
        <nav className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Sections
          </p>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value
            return (
              <button
                key={tab.value}
                onClick={() => {
                  onTabChange(tab.value)
                  setIsOpen(false)
                }}
                data-testid={`mobile-nav-${tab.value}`}
                className={`group flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-all active:scale-[0.98] ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "text-foreground/90 hover:bg-accent"
                }`}
              >
                <span className={isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            )
          })}
        </nav>

        {/* Logout with confirmation */}
        <div className="border-t border-border/60 p-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-2" data-testid="mobile-sign-out-button">
                <LogOut className="size-4" />
                Sign out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be signed out of the Telegram Ultra control panel and returned to the login screen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <form action={logoutAction}>
                  <AlertDialogAction type="submit" className="w-full">
                    Sign out
                  </AlertDialogAction>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </aside>
    </>
  )

  return (
    <div className="md:hidden">
      {/* Hamburger (3-line) button - top left corner, mobile only */}
      <Button
        variant="ghost"
        size="icon"
        className="-ml-1.5 size-10"
        onClick={() => setIsOpen(true)}
        aria-label="Open menu"
        aria-expanded={isOpen}
        data-testid="mobile-menu-trigger"
      >
        <Menu className="size-6" />
      </Button>

      {/* Render overlay via portal to escape the glass header's backdrop-filter
          containing block (fixes iOS Safari where the sidebar was clipped/hidden) */}
      {mounted ? createPortal(overlay, document.body) : null}
    </div>
  )
}
