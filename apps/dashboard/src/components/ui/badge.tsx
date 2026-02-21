import { splitProps, type Component, type JSX } from "solid-js"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-white/10 text-[var(--color-text)]",
        secondary: "border-transparent bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]",
        destructive: "border-transparent bg-[var(--color-error-subtle)] text-[var(--color-error)]",
        outline: "text-[var(--color-text-secondary)] border-[var(--color-border)]",
        success: "border-transparent bg-[var(--color-success-subtle)] text-[var(--color-success)]",
        warning: "border-transparent bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends JSX.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant"])
  return (
    <div class={cn(badgeVariants({ variant: local.variant }), local.class)} {...others} />
  )
}

export { Badge, badgeVariants }
