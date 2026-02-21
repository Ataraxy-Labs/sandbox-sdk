import { splitProps, type Component, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {}

const Input: Component<InputProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "type"])
  return (
    <input
      type={local.type}
      class={cn(
        "flex h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-subtle)] focus-visible:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50",
        local.class
      )}
      {...others}
    />
  )
}

export { Input }
