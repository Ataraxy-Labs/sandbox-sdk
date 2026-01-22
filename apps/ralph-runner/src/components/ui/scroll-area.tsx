import { splitProps, type Component, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

export interface ScrollAreaProps extends JSX.HTMLAttributes<HTMLDivElement> {}

const ScrollArea: Component<ScrollAreaProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"])
  return (
    <div class={cn("relative overflow-hidden", local.class)} {...others}>
      <div class="h-full w-full overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[hsl(var(--border))]">
        {local.children}
      </div>
    </div>
  )
}

export { ScrollArea }
