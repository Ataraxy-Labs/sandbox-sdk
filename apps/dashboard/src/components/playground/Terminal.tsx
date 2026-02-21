import { For, createSignal, createEffect } from "solid-js"

interface TerminalProps {
  lines: string[]
  onCommand: (cmd: string) => void
  disabled: boolean
}

export function Terminal(props: TerminalProps) {
  let containerRef!: HTMLDivElement
  let inputRef!: HTMLInputElement
  const [input, setInput] = createSignal("")
  const [history, setHistory] = createSignal<string[]>([])
  const [historyIndex, setHistoryIndex] = createSignal(-1)

  createEffect(() => {
    props.lines
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight
    }
  })

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const cmd = input().trim()
    if (!cmd) return

    setHistory((h) => [...h, cmd])
    setHistoryIndex(-1)
    props.onCommand(cmd)
    setInput("")
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      const h = history()
      const newIndex = historyIndex() + 1
      if (newIndex < h.length) {
        setHistoryIndex(newIndex)
        setInput(h[h.length - 1 - newIndex])
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      const h = history()
      const newIndex = historyIndex() - 1
      if (newIndex >= 0) {
        setHistoryIndex(newIndex)
        setInput(h[h.length - 1 - newIndex])
      } else {
        setHistoryIndex(-1)
        setInput("")
      }
    }
  }

  const getLineStyle = (line: string) => {
    if (line.startsWith("[error]")) return "text-[var(--color-error)]"
    if (line.startsWith("[stderr]")) return "text-[var(--color-warning)]"
    if (line.startsWith("[system]")) return "text-[var(--color-accent)]"
    if (line.startsWith("[run]")) return "text-[var(--color-success)]"
    if (line.startsWith("[stdout]")) return "text-[var(--color-text)]"
    if (line.startsWith("$")) return "text-[var(--color-success)]"
    return "text-[var(--color-text-secondary)]"
  }

  return (
    <div class="h-full flex flex-col bg-[var(--color-bg)]">
      {/* Terminal Output */}
      <div ref={containerRef} class="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
        <For each={props.lines}>
          {(line) => <div class={`${getLineStyle(line)} whitespace-pre-wrap break-all`}>{line}</div>}
        </For>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} class="border-t border-[var(--color-border)]">
        <div class="flex items-center px-4 py-3 gap-3">
          <span class="text-[var(--color-success)] font-mono text-sm">&#10095;</span>
          <input
            ref={inputRef}
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={props.disabled ? "Select a container to run commands" : "Type a command..."}
            disabled={props.disabled}
            class="flex-1 bg-transparent text-[var(--color-text)] font-mono text-[13px] outline-none placeholder:text-[var(--color-text-dim)] disabled:opacity-50"
          />
        </div>
      </form>
    </div>
  )
}
