import { A } from "@solidjs/router"

export default function SignIn() {
  return (
    <div class="h-full flex items-center justify-center">
      <div class="w-full max-w-sm p-6">
        <h1 class="text-xl font-semibold mb-1">Sign in</h1>
        <p class="text-sm text-[var(--color-text-muted)] mb-6">
          Welcome back. Sign in to your account.
        </p>
        {/* Clerk will mount here */}
        <div id="clerk-sign-in" />
        <p class="mt-4 text-xs text-[var(--color-text-muted)] text-center">
          Don't have an account?{" "}
          <A href="/sign-up" class="text-[var(--color-accent)]">
            Sign up
          </A>
        </p>
      </div>
    </div>
  )
}
