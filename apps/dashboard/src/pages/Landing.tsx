import { A } from "@solidjs/router"

export default function Landing() {
  return (
    <div class="h-full overflow-y-auto">
      {/* Hero */}
      <section class="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
        <h1 class="text-5xl font-bold tracking-tight max-w-2xl leading-tight">
          Run code anywhere.
          <br />
          <span class="text-[var(--color-text-muted)]">One SDK, seven providers.</span>
        </h1>
        <p class="mt-4 text-lg text-[var(--color-text-secondary)] max-w-lg">
          Spin up sandboxes on Modal, E2B, Daytona, Blaxel, Cloudflare, Vercel, or Docker. Same API, your choice of infra.
        </p>
        <div class="mt-8 flex gap-3">
          <A
            href="/sign-up"
            class="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Get Started
          </A>
          <A
            href="/app/playground"
            class="px-5 py-2.5 border border-[var(--color-border)] text-sm font-medium rounded-lg hover:border-[var(--color-border-hover)] transition-colors"
          >
            Try Playground
          </A>
        </div>
      </section>

      {/* Providers */}
      <section class="max-w-4xl mx-auto px-6 py-20">
        <h2 class="text-2xl font-semibold text-center mb-10">Seven providers, one interface</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { name: "Modal", desc: "GPU-ready serverless" },
            { name: "E2B", desc: "Code interpreter sandbox" },
            { name: "Daytona", desc: "Dev environment platform" },
            { name: "Blaxel", desc: "AI-native compute" },
            { name: "Cloudflare", desc: "Edge containers" },
            { name: "Vercel", desc: "Serverless sandbox" },
            { name: "Docker", desc: "Local containers" },
          ].map((p) => (
            <div class="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              <div class="text-sm font-medium">{p.name}</div>
              <div class="text-xs text-[var(--color-text-muted)] mt-1">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section class="max-w-4xl mx-auto px-6 py-20">
        <h2 class="text-2xl font-semibold text-center mb-10">What you can do</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Sandbox Playground",
              desc: "Monaco editor, terminal, file browser. Write code, run it in any provider, see results instantly.",
            },
            {
              title: "Agent Runner",
              desc: "Point an AI agent at a GitHub repo with a task. Watch it clone, install, and work across multiple providers.",
            },
            {
              title: "Multi-Provider Race",
              desc: "Run the same task on multiple providers side-by-side. Compare speed, reliability, and output.",
            },
          ].map((f) => (
            <div class="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              <div class="text-sm font-semibold mb-2">{f.title}</div>
              <div class="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section class="flex flex-col items-center py-20 px-6 text-center">
        <h2 class="text-2xl font-semibold">Ready to start?</h2>
        <p class="mt-2 text-sm text-[var(--color-text-secondary)]">
          Sign up and run your first sandbox in under a minute.
        </p>
        <A
          href="/sign-up"
          class="mt-6 px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          Create Account
        </A>
      </section>

      <footer class="border-t border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-dim)]">
        Sandbox SDK by Ataraxy Labs
      </footer>
    </div>
  )
}
