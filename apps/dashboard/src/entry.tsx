/* @refresh reload */
import { render } from "solid-js/web"
import { Router, Route } from "@solidjs/router"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import AppLayout from "./components/layout/AppLayout"
import Landing from "./pages/Landing"
import SignIn from "./pages/SignIn"
import SignUp from "./pages/SignUp"
import Playground from "./pages/app/Playground"
import AgentRuns from "./pages/app/AgentRuns"
import History from "./pages/app/History"
import Settings from "./pages/app/Settings"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/sign-in" component={SignIn} />
        <Route path="/sign-up" component={SignUp} />
        <Route path="/app" component={AppLayout}>
          <Route path="/playground" component={Playground} />
          <Route path="/agent" component={AgentRuns} />
          <Route path="/history" component={History} />
          <Route path="/settings" component={Settings} />
        </Route>
      </Router>
    </QueryClientProvider>
  ),
  root,
)
