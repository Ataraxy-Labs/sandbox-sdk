import { splitProps, type Component, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

export interface LabelProps extends JSX.LabelHTMLAttributes<HTMLLabelElement> {}

const Label: Component<LabelProps> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <label
      class={cn(
        "text-xs font-medium leading-none text-[var(--color-text-secondary)]",
        local.class
      )}
      {...others}
    />
  )
}

export { Label }
