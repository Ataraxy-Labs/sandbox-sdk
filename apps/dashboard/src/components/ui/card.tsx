import { splitProps, type Component, type JSX } from "solid-js"
import { cn } from "@/lib/utils"

const Card: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]",
        local.class
      )}
      {...others}
    />
  )
}

const CardHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("flex flex-col space-y-1.5 p-5", local.class)} {...others} />
}

const CardTitle: Component<JSX.HTMLAttributes<HTMLHeadingElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <h3
      class={cn("text-sm font-semibold leading-none tracking-tight", local.class)}
      {...others}
    />
  )
}

const CardDescription: Component<JSX.HTMLAttributes<HTMLParagraphElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <p class={cn("text-xs text-[var(--color-text-muted)]", local.class)} {...others} />
}

const CardContent: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("p-5 pt-0", local.class)} {...others} />
}

const CardFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("flex items-center p-5 pt-0", local.class)} {...others} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
