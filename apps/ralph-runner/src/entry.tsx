/* @refresh reload */
import { render } from "solid-js/web"
import { Router, Route } from "@solidjs/router"
import { ConvexProvider } from "./providers/ConvexProvider"
import App from "./App"
import "./index.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Root element not found")
}

render(
  () => (
    <ConvexProvider>
      <Router>
        <Route path="/*" component={App} />
      </Router>
    </ConvexProvider>
  ),
  root,
)
