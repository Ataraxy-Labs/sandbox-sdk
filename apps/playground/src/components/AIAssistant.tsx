import { createSignal, For, Show, createEffect } from "solid-js"
import type { Language } from "../types"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface AIAssistantProps {
  code: string
  language: Language
}

export function AIAssistant(props: AIAssistantProps) {
  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal("")
  const [isLoading, setIsLoading] = createSignal(false)
  let messagesEndRef!: HTMLDivElement

  createEffect(() => {
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" })
    }
  })

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading()) return

    const userMessage: Message = { role: "user", content: question }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: props.code,
          language: props.language,
          question: question,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const assistantMessage: Message = { role: "assistant", content: "" }
      setMessages((prev) => [...prev, assistantMessage])

      const decoder = new TextDecoder()
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone

        if (value) {
          const chunk = decoder.decode(value, { stream: true })
          setMessages((prev) => {
            const updated = [...prev]
            const lastIdx = updated.length - 1
            if (updated[lastIdx].role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: updated[lastIdx].content + chunk,
              }
            }
            return updated
          })
        }
      }
    } catch (err) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    sendMessage(input())
  }

  const quickActions = [
    { label: "Explain", prompt: "Explain what this code does step by step." },
    { label: "Find Bugs", prompt: "Analyze this code for potential bugs or issues." },
    { label: "Optimize", prompt: "Suggest optimizations to improve this code." },
  ]

  const renderMarkdown = (content: string) => {
    return content
      .replace(
        /```(\w+)?\n([\s\S]*?)```/g,
        '<pre class="bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] p-3 rounded-lg overflow-x-auto my-2 text-xs"><code class="font-mono">$2</code></pre>',
      )
      .replace(/`([^`]+)`/g, '<code class="bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 rounded text-xs font-mono text-[var(--color-accent)]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong class='text-white'>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>")
  }

  return (
    <div class="h-full flex flex-col bg-[var(--color-bg)]">
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <Show
          when={messages().length > 0}
          fallback={
            <div class="h-full flex flex-col items-center justify-center text-center px-4">
              <div class="w-12 h-12 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center mb-4">
                <svg class="w-5 h-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 class="text-sm font-medium text-white mb-1">AI Assistant</h3>
              <p class="text-xs text-[var(--color-text-dim)] mb-6 max-w-[200px]">
                Ask questions about your code or use quick actions
              </p>
              <div class="flex flex-wrap gap-2 justify-center">
                <For each={quickActions}>
                  {(action) => (
                    <button
                      class="px-3 py-1.5 text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-elevated)] rounded-md transition-all"
                      onClick={() => sendMessage(action.prompt)}
                    >
                      {action.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          }
        >
          <For each={messages()}>
            {(message) => (
              <div class={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-slideUp`}>
                <div
                  class={`max-w-[85%] rounded-lg px-3 py-2.5 ${
                    message.role === "user"
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)]"
                  }`}
                >
                  <Show
                    when={message.role === "assistant"}
                    fallback={<p class="text-xs leading-relaxed whitespace-pre-wrap">{message.content}</p>}
                  >
                    <div
                      class="text-xs leading-relaxed prose prose-invert prose-sm max-w-none"
                      innerHTML={renderMarkdown(message.content)}
                    />
                  </Show>
                </div>
              </div>
            )}
          </For>
          <Show when={isLoading()}>
            <div class="flex justify-start animate-slideUp">
              <div class="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-3">
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-pulse" />
                  <div class="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-pulse" style="animation-delay: 0.15s" />
                  <div class="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-pulse" style="animation-delay: 0.3s" />
                </div>
              </div>
            </div>
          </Show>
          <div ref={messagesEndRef} />
        </Show>
      </div>

      <Show when={messages().length > 0}>
        <div class="px-4 pb-3">
          <div class="flex flex-wrap gap-1.5">
            <For each={quickActions}>
              {(action) => (
                <button
                  class="px-2 py-1 text-[10px] font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-dim)] hover:text-white hover:bg-[var(--color-bg-elevated)] rounded transition-all disabled:opacity-50"
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isLoading()}
                >
                  {action.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <form onSubmit={handleSubmit} class="border-t border-[var(--color-border)] p-3">
        <div class="flex gap-2">
          <input
            type="text"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="Ask about your code..."
            disabled={isLoading()}
            class="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-md px-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={!input().trim() || isLoading()}
            class="px-3 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
