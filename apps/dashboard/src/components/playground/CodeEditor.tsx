import { onMount, onCleanup, createEffect } from "solid-js"
import type { Language } from "@/types"
import type * as Monaco from "monaco-editor"

interface CodeEditorProps {
  code: string
  language: Language
  onChange: (code: string) => void
}

const LANGUAGE_MAP: Record<Language, string> = {
  python: "python",
  javascript: "javascript",
  bash: "shell",
}

export function CodeEditor(props: CodeEditorProps) {
  let containerRef!: HTMLDivElement
  let editor: Monaco.editor.IStandaloneCodeEditor | null = null
  let monacoModule: typeof Monaco | null = null
  let isUpdatingFromProps = false

  onMount(async () => {
    monacoModule = await import("monaco-editor")

    monacoModule.editor.defineTheme("sandbox-premium", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "525252", fontStyle: "italic" },
        { token: "keyword", foreground: "ff7b72" },
        { token: "keyword.control", foreground: "ff7b72" },
        { token: "string", foreground: "a5d6ff" },
        { token: "string.quoted", foreground: "a5d6ff" },
        { token: "number", foreground: "79c0ff" },
        { token: "function", foreground: "d2a8ff" },
        { token: "function.declaration", foreground: "d2a8ff" },
        { token: "variable", foreground: "ffa657" },
        { token: "variable.parameter", foreground: "ffa657" },
        { token: "type", foreground: "7ee787" },
        { token: "type.identifier", foreground: "7ee787" },
        { token: "class", foreground: "7ee787" },
        { token: "operator", foreground: "ff7b72" },
        { token: "delimiter", foreground: "8b949e" },
        { token: "constant", foreground: "79c0ff" },
      ],
      colors: {
        "editor.background": "#0a0a0a",
        "editor.foreground": "#e6edf3",
        "editor.lineHighlightBackground": "#161616",
        "editor.lineHighlightBorder": "#1f1f1f",
        "editor.selectionBackground": "#264f7866",
        "editor.inactiveSelectionBackground": "#264f7833",
        "editorCursor.foreground": "#0070f3",
        "editorCursor.background": "#000000",
        "editorLineNumber.foreground": "#3d3d3d",
        "editorLineNumber.activeForeground": "#737373",
        "editorIndentGuide.background1": "#1f1f1f",
        "editorIndentGuide.activeBackground1": "#333333",
        "editor.selectionHighlightBackground": "#264f7833",
        "editorBracketMatch.background": "#0070f322",
        "editorBracketMatch.border": "#0070f3",
        "editorWhitespace.foreground": "#2d2d2d",
        "editorOverviewRuler.border": "#0a0a0a",
        "scrollbar.shadow": "#00000000",
        "scrollbarSlider.background": "#3d3d3d55",
        "scrollbarSlider.hoverBackground": "#3d3d3d88",
        "scrollbarSlider.activeBackground": "#3d3d3daa",
      },
    })

    editor = monacoModule.editor.create(containerRef, {
      value: props.code,
      language: LANGUAGE_MAP[props.language],
      theme: "sandbox-premium",
      fontSize: 13,
      fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace",
      fontLigatures: true,
      lineHeight: 24,
      letterSpacing: 0.2,
      padding: { top: 20, bottom: 20 },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
      lineNumbers: "on",
      lineNumbersMinChars: 4,
      renderLineHighlight: "all",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      cursorWidth: 2,
      cursorStyle: "line",
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      guides: {
        indentation: true,
        bracketPairs: true,
        highlightActiveBracketPair: true,
        highlightActiveIndentation: true,
      },
      scrollbar: {
        vertical: "auto",
        horizontal: "auto",
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      renderWhitespace: "none",
      contextmenu: false,
      folding: true,
      foldingHighlight: false,
      showFoldingControls: "mouseover",
      glyphMargin: false,
      stickyScroll: { enabled: false },
    })

    editor.onDidChangeModelContent(() => {
      if (!isUpdatingFromProps && editor) {
        props.onChange(editor.getValue())
      }
    })
  })

  createEffect(() => {
    const newCode = props.code
    if (editor && editor.getValue() !== newCode) {
      isUpdatingFromProps = true
      editor.setValue(newCode)
      isUpdatingFromProps = false
    }
  })

  createEffect(() => {
    const lang = props.language
    if (editor && monacoModule) {
      const model = editor.getModel()
      if (model) {
        monacoModule.editor.setModelLanguage(model, LANGUAGE_MAP[lang])
      }
    }
  })

  onCleanup(() => {
    editor?.dispose()
  })

  return <div ref={containerRef} class="h-full w-full" />
}
