import { splitProps, type Component, type JSX } from "solid-js"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-white text-black hover:bg-gray-100",
        destructive: "bg-[var(--color-error)] text-white hover:bg-red-600",
        outline: "border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-hover)]",
        secondary: "bg-[var(--color-bg-elevated)] text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]",
        ghost: "hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text)]",
        link: "text-[var(--color-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button: Component<ButtonProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant", "size"])
  return (
    <button
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...others}
    />
  )
}

export { Button, buttonVariants }
