import { A } from "@solidjs/router"

export default function SignUp() {
  return (
    <div class="h-full flex items-center justify-center">
      <div class="w-full max-w-sm p-6">
        <h1 class="text-xl font-semibold mb-1">Create account</h1>
        <p class="text-sm text-[var(--color-text-muted)] mb-6">
          Sign up to start running sandboxes.
        </p>
        {/* Clerk will mount here */}
        <div id="clerk-sign-up" />
        <p class="mt-4 text-xs text-[var(--color-text-muted)] text-center">
          Already have an account?{" "}
          <A href="/sign-in" class="text-[var(--color-accent)]">
            Sign in
          </A>
        </p>
      </div>
    </div>
  )
}
