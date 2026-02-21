import { ParentProps } from "solid-js"
import { A, useLocation } from "@solidjs/router"

const navItems = [
  { href: "/app/playground", label: "Playground" },
  { href: "/app/agent", label: "Agent" },
  { href: "/app/history", label: "History" },
  { href: "/app/settings", label: "Settings" },
]

export default function AppLayout(props: ParentProps) {
  const location = useLocation()

  return (
    <div class="h-full flex flex-col">
      <header class="h-12 border-b border-[var(--color-border)] flex items-center px-4 gap-6 shrink-0">
        <A href="/" class="text-sm font-semibold tracking-tight text-[var(--color-text)]">
          Sandbox SDK
        </A>
        <nav class="flex items-center gap-1">
          {navItems.map((item) => (
            <A
              href={item.href}
              class={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                location.pathname === item.href
                  ? "bg-[var(--color-bg-elevated)] text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {item.label}
            </A>
          ))}
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <div class="w-7 h-7 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)]" />
        </div>
      </header>
      <main class="flex-1 overflow-hidden">
        {props.children}
      </main>
    </div>
  )
}
