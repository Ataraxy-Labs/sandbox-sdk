import { Component, For, Show, createMemo, createSignal, createEffect, onCleanup } from "solid-js"
import type { 
  OpenCodeMessageWithParts, 
  OpenCodePart, 
  OpenCodeTextPart, 
  OpenCodeToolPart,
  OpenCodeReasoningPart 
} from "../hooks/useOpenCodeSessions"

interface SessionChatViewProps {
  messages: OpenCodeMessageWithParts[]
  loading: boolean
  sessionTitle?: string
  onBack?: () => void
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const ToolStatusBadge: Component<{ status: string }> = (props) => {
  const statusColors = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    running: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
  }
  const statusIcons = {
    pending: "⏳",
    running: "⚙️",
    completed: "✅",
    error: "❌",
  }
  
  return (
    <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusColors[props.status as keyof typeof statusColors] || statusColors.pending}`}>
      <span>{statusIcons[props.status as keyof typeof statusIcons] || "⏳"}</span>
      {props.status}
    </span>
  )
}

const ToolPart: Component<{ part: OpenCodeToolPart }> = (props) => {
  const [expanded, setExpanded] = createSignal(false)
  
  const toolTitle = createMemo(() => {
    const title = props.part.state.title || props.part.tool
    return title.charAt(0).toUpperCase() + title.slice(1)
  })
  
  const hasOutput = createMemo(() => 
    props.part.state.status === "completed" && props.part.state.output
  )
  
  const hasInput = createMemo(() => 
    props.part.state.input && Object.keys(props.part.state.input).length > 0
  )

  return (
    <div class="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
      <button
        class="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">🔧</span>
          <span class="font-medium text-gray-200">{toolTitle()}</span>
          <ToolStatusBadge status={props.part.state.status} />
        </div>
        <svg 
          class={`w-4 h-4 text-gray-400 transition-transform ${expanded() ? "rotate-180" : ""}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      <Show when={expanded()}>
        <div class="px-3 py-2 border-t border-gray-700 space-y-2">
          <Show when={hasInput()}>
            <div>
              <p class="text-xs text-gray-500 mb-1">Input:</p>
              <pre class="text-xs bg-gray-900 p-2 rounded overflow-x-auto text-gray-300">
                {JSON.stringify(props.part.state.input, null, 2)}
              </pre>
            </div>
          </Show>
          <Show when={hasOutput()}>
            <div>
              <p class="text-xs text-gray-500 mb-1">Output:</p>
              <pre class="text-xs bg-gray-900 p-2 rounded overflow-x-auto text-gray-300 max-h-60 overflow-y-auto">
                {props.part.state.output}
              </pre>
            </div>
          </Show>
          <Show when={props.part.state.error}>
            <div>
              <p class="text-xs text-gray-500 mb-1">Error:</p>
              <pre class="text-xs bg-red-900/30 p-2 rounded text-red-300">
                {props.part.state.error}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

const TextPart: Component<{ part: OpenCodeTextPart }> = (props) => {
  return (
    <div class="text-gray-200 whitespace-pre-wrap leading-relaxed">
      {props.part.text}
    </div>
  )
}

const ReasoningPart: Component<{ part: OpenCodeReasoningPart }> = (props) => {
  const [expanded, setExpanded] = createSignal(false)
  
  return (
    <div class="bg-purple-900/20 border border-purple-700/30 rounded-lg overflow-hidden">
      <button
        class="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">💭</span>
          <span class="text-sm text-purple-300">Thinking...</span>
        </div>
        <svg 
          class={`w-4 h-4 text-gray-400 transition-transform ${expanded() ? "rotate-180" : ""}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <Show when={expanded()}>
        <div class="px-3 py-2 border-t border-purple-700/30">
          <p class="text-sm text-purple-200/80 whitespace-pre-wrap">{props.part.text}</p>
        </div>
      </Show>
    </div>
  )
}

const PartRenderer: Component<{ part: OpenCodePart }> = (props) => {
  return (
    <Show when={props.part}>
      {(() => {
        switch (props.part.type) {
          case "text":
            return <TextPart part={props.part as OpenCodeTextPart} />
          case "tool":
            return <ToolPart part={props.part as OpenCodeToolPart} />
          case "reasoning":
            return <ReasoningPart part={props.part as OpenCodeReasoningPart} />
          default:
            return null
        }
      })()}
    </Show>
  )
}

const MessageBubble: Component<{ message: OpenCodeMessageWithParts }> = (props) => {
  const isUser = () => props.message.info.role === "user"
  
  const title = createMemo(() => {
    if (isUser() && "summary" in props.message.info) {
      return props.message.info.summary?.title || "User"
    }
    return props.message.info.agent || "Assistant"
  })
  
  const timestamp = createMemo(() => formatTime(props.message.info.time.created))
  
  const hasError = createMemo(() => {
    if (!isUser() && "error" in props.message.info) {
      return !!props.message.info.error
    }
    return false
  })
  
  // Filter out step-start, step-finish, snapshot parts as they're not user-facing content
  const visibleParts = createMemo(() => 
    props.message.parts.filter(p => 
      ["text", "tool", "reasoning"].includes(p.type)
    )
  )

  return (
    <div class={`flex flex-col gap-2 ${isUser() ? "items-end" : "items-start"}`}>
      {/* Header */}
      <div class={`flex items-center gap-2 ${isUser() ? "flex-row-reverse" : ""}`}>
        <div class={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
          isUser() 
            ? "bg-blue-600" 
            : "bg-gradient-to-br from-emerald-500 to-teal-600"
        }`}>
          {isUser() ? "👤" : "🤖"}
        </div>
        <div class={`flex flex-col ${isUser() ? "items-end" : "items-start"}`}>
          <span class="text-sm font-medium text-gray-200">{title()}</span>
          <span class="text-xs text-gray-500">{timestamp()}</span>
        </div>
      </div>
      
      {/* Message Content */}
      <div class={`max-w-[85%] rounded-2xl ${
        isUser() 
          ? "bg-blue-600 text-white rounded-tr-md" 
          : "bg-gray-800 border border-gray-700 rounded-tl-md"
      } ${hasError() ? "border-red-500/50" : ""}`}>
        <div class="p-4 space-y-3">
          <Show when={visibleParts().length === 0}>
            <p class="text-gray-400 italic">No content</p>
          </Show>
          <For each={visibleParts()}>
            {(part) => <PartRenderer part={part} />}
          </For>
          <Show when={hasError() && !isUser() && "error" in props.message.info}>
            <div class="mt-2 p-2 bg-red-900/30 rounded border border-red-700/50">
              <p class="text-xs text-red-300">
                Error: {(props.message.info as any).error?.data?.message || "Unknown error"}
              </p>
            </div>
          </Show>
        </div>
      </div>
      
      {/* Token info for assistant messages */}
      <Show when={!isUser() && "tokens" in props.message.info && props.message.info.tokens}>
        <div class="text-xs text-gray-500 flex items-center gap-2">
          <span>📊 {(props.message.info as any).tokens?.input || 0} in / {(props.message.info as any).tokens?.output || 0} out</span>
          <Show when={(props.message.info as any).cost}>
            <span>💰 ${((props.message.info as any).cost || 0).toFixed(4)}</span>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export const SessionChatView: Component<SessionChatViewProps> = (props) => {
  let scrollRef: HTMLDivElement | undefined
  
  // Auto-scroll to bottom when new messages arrive
  createEffect(() => {
    const _ = props.messages.length  // Track changes
    if (scrollRef) {
      setTimeout(() => {
        scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
      }, 100)
    }
  })
  
  return (
    <div class="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div class="px-4 py-3 border-b border-gray-800 bg-black/30">
        <div class="flex items-center gap-3">
          <Show when={props.onBack}>
            <button
              class="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
              onClick={props.onBack}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Show>
          <div class="flex-1">
            <h3 class="text-sm font-medium text-white">
              {props.sessionTitle || "Session Chat"}
            </h3>
            <p class="text-xs text-gray-500">
              {props.messages.length} messages
            </p>
          </div>
          <Show when={props.loading}>
            <div class="flex items-center gap-1.5 text-xs text-blue-400">
              <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Loading...
            </div>
          </Show>
        </div>
      </div>
      
      {/* Messages */}
      <div ref={scrollRef} class="flex-1 overflow-y-auto p-4 space-y-6">
        <Show when={props.loading}>
          <div class="flex items-center justify-center py-8">
            <div class="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        </Show>
        
        <Show when={!props.loading && props.messages.length === 0}>
          <div class="flex items-center justify-center h-full text-gray-500">
            <div class="text-center">
              <span class="text-3xl block mb-2">💬</span>
              <p>No messages in this session</p>
            </div>
          </div>
        </Show>
        
        <For each={props.messages}>
          {(msg) => <MessageBubble message={msg} />}
        </For>
      </div>
    </div>
  )
}
