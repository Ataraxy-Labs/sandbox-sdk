import { Component, createEffect, createSignal, onCleanup, onMount, For, createMemo } from "solid-js"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import type { AgentEvent, ToolCall, ToolResult } from "../types"

interface TerminalPanelProps {
  events: AgentEvent[]
}

interface CommandOutput {
  id: string
  command: string
  output: string
  exitCode?: number
  timestamp: number
}

export const TerminalPanel: Component<TerminalPanelProps> = (props) => {
  let terminalRef: HTMLDivElement | undefined
  let terminal: Terminal | null = null
  let fitAddon: FitAddon | null = null
  
  const [isCopied, setIsCopied] = createSignal(false)
  const [processedCount, setProcessedCount] = createSignal(0)

  const commandOutputs = createMemo<CommandOutput[]>(() => {
    const outputs: CommandOutput[] = []
    const events = props.events
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i]
      
      if (event.type === "tool_call") {
        const toolCall = event.data as ToolCall
        if (toolCall?.name === "run_command") {
          const command = String(toolCall.arguments?.command || "")
          
          const resultEvent = events.slice(i + 1).find(
            (e) => e.type === "tool_result" && (e.data as ToolResult)?.name === "run_command"
          )
          
          let output = ""
          let exitCode: number | undefined = undefined
          
          if (resultEvent) {
            const result = resultEvent.data as ToolResult
            if (result?.error) {
              output = result.error
              exitCode = 1
            } else if (result?.result) {
              const res = result.result as { stdout?: string; stderr?: string; exitCode?: number }
              if (typeof res === "string") {
                output = res
              } else {
                if (res.stdout) output += res.stdout
                if (res.stderr) output += (output ? "\n" : "") + res.stderr
                exitCode = res.exitCode
              }
            }
          }
          
          outputs.push({
            id: event.id,
            command,
            output,
            exitCode,
            timestamp: event.timestamp,
          })
        }
      }
    }
    
    return outputs
  })

  const allOutput = createMemo(() => {
    return commandOutputs()
      .map((cmd) => {
        let result = `$ ${cmd.command}\n${cmd.output}`
        if (cmd.exitCode !== undefined && cmd.exitCode !== 0) {
          result += `\n[exit code: ${cmd.exitCode}]`
        }
        return result
      })
      .join("\n\n")
  })

  onMount(() => {
    if (!terminalRef) return

    terminal = new Terminal({
      theme: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        cursor: "#fafafa",
        cursorAccent: "#0a0a0a",
        selectionBackground: "rgba(59, 130, 246, 0.3)",
        black: "#0a0a0a",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#fafafa",
        brightBlack: "#525252",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 10000,
    })

    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef)
    
    setTimeout(() => {
      fitAddon?.fit()
    }, 0)

    const resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
    })
    resizeObserver.observe(terminalRef)

    onCleanup(() => {
      resizeObserver.disconnect()
      terminal?.dispose()
    })
  })

  createEffect(() => {
    if (!terminal) return
    
    const outputs = commandOutputs()
    const processed = processedCount()
    
    if (outputs.length > processed) {
      for (let i = processed; i < outputs.length; i++) {
        const cmd = outputs[i]
        
        terminal.writeln(`\x1b[36m$\x1b[0m \x1b[1m${cmd.command}\x1b[0m`)
        
        if (cmd.output) {
          const lines = cmd.output.split("\n")
          for (const line of lines) {
            terminal.writeln(line)
          }
        }
        
        if (cmd.exitCode !== undefined && cmd.exitCode !== 0) {
          terminal.writeln(`\x1b[31m[exit code: ${cmd.exitCode}]\x1b[0m`)
        }
        
        terminal.writeln("")
      }
      
      setProcessedCount(outputs.length)
    }
  })

  const handleClear = () => {
    if (terminal) {
      terminal.clear()
      setProcessedCount(0)
    }
  }

  const handleCopyAll = async () => {
    const text = allOutput()
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <div class="flex flex-col h-full bg-[var(--color-bg)]">
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div class="flex items-center gap-3">
          <h3 class="text-sm font-medium text-[var(--color-text)]">Terminal Output</h3>
          <span class="text-xs text-[var(--color-text-muted)]">
            {commandOutputs().length} command{commandOutputs().length !== 1 ? "s" : ""}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border)] transition-colors flex items-center gap-1.5"
            onClick={handleClear}
            title="Clear terminal"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
          <button
            class="px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border)] transition-colors flex items-center gap-1.5"
            onClick={handleCopyAll}
            title="Copy all output"
          >
            {isCopied() ? (
              <>
                <svg class="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy All
              </>
            )}
          </button>
        </div>
      </div>

      <div class="flex-1 relative overflow-hidden">
        <div 
          ref={terminalRef} 
          class="absolute inset-0"
          style={{ padding: "8px" }}
        />
        
        {commandOutputs().length === 0 && (
          <div class="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] pointer-events-none">
            <svg class="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p class="text-sm">Terminal output will appear here</p>
            <p class="text-xs mt-1">Waiting for run_command tool calls...</p>
          </div>
        )}
      </div>
    </div>
  )
}
