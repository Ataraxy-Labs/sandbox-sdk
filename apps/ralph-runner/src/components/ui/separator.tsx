import { splitProps, type Component, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

export interface SeparatorProps extends JSX.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}

const Separator: Component<SeparatorProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "orientation", "decorative"])
  const orientation = local.orientation ?? "horizontal"
  
  return (
    <div
      role={local.decorative ? "none" : "separator"}
      aria-orientation={local.decorative ? undefined : orientation}
      class={cn(
        "shrink-0 bg-[hsl(var(--border))]",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        local.class
      )}
      {...others}
    />
  )
}

export { Separator }
