import { splitProps, type Component, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea: Component<TextareaProps> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <textarea
      class={cn(
        "flex min-h-[80px] w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm ring-offset-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        local.class
      )}
      {...others}
    />
  )
}

export { Textarea }
