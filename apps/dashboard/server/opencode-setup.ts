/**
 * OpenCode + Ralph container setup script
 *
 * This module provides the setup commands to run inside the sandbox:
 * 1. Clone the repository
 * 2. Install opencode
 * 3. Start opencode server on port 4096
 * 4. Start ralph loop in background
 */

export interface SetupOptions {
  repoUrl: string
  branch?: string
  maxIterations?: number
  prdContent?: string
  promptContent?: string
  anthropicApiKey?: string
  openaiApiKey?: string
}

export const OPENCODE_PORT = 4096
export const RALPH_STATE_DIR = ".opencode"

/**
 * Generate the shell script that sets up the container environment
 */
export function generateSetupScript(opts: SetupOptions): string {
  const { repoUrl, branch = "main", maxIterations = 10, anthropicApiKey, openaiApiKey } = opts

  const repoName = repoUrl.split("/").pop()?.replace(".git", "") || "repo"
  const workDir = `/workspace/${repoName}`

  return `#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════"
echo "  OpenCode + Ralph Setup"
echo "═══════════════════════════════════════════════════════"

# Environment setup
export HOME=/root
export PATH="/root/.opencode/bin:/root/.bun/bin:/root/.local/bin:$PATH"
${anthropicApiKey ? `export ANTHROPIC_API_KEY="${anthropicApiKey}"` : ""}
${openaiApiKey ? `export OPENAI_API_KEY="${openaiApiKey}"` : ""}

# Install Bun if not present
if ! command -v bun &> /dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="/root/.bun/bin:$PATH"
fi

# Install opencode if not present
if ! command -v opencode &> /dev/null; then
  echo "Installing OpenCode..."
  curl -fsSL https://opencode.ai/install | bash
  export PATH="/root/.opencode/bin:/root/.local/bin:$PATH"
fi

# Clone repository
echo "Cloning repository..."
mkdir -p /workspace
cd /workspace
git clone --depth 1 --branch ${branch} "${repoUrl}" ${repoName} || git clone --depth 1 "${repoUrl}" ${repoName}
cd ${workDir}

echo "Working directory: ${workDir}"

# Set password for opencode server (for auth)
export OPENCODE_SERVER_PASSWORD="ralph-$(date +%s)"
echo "$OPENCODE_SERVER_PASSWORD" > /tmp/opencode-password.txt

# Create opencode config with all permissions allowed (for headless/non-interactive use)
# This prevents the agent from asking questions or requiring user interaction
mkdir -p ${workDir}/.opencode
cat > ${workDir}/.opencode/opencode.json << 'EOCONFIG'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow",
    "edit": "allow",
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "bash": "allow",
    "task": "allow",
    "webfetch": "allow",
    "websearch": "allow",
    "codesearch": "allow",
    "todowrite": "allow",
    "todoread": "allow",
    "question": "deny",
    "lsp": "allow",
    "external_directory": "allow",
    "plan_enter": "deny",
    "plan_exit": "deny"
  }
}
EOCONFIG
export OPENCODE_CONFIG="${workDir}/.opencode/opencode.json"
echo "Created opencode config with permissions for headless mode"
echo "   Config path: \$OPENCODE_CONFIG"

# Start opencode server in background
echo "Starting OpenCode server on port ${OPENCODE_PORT}..."
nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 > /tmp/opencode-server.log 2>&1 &
OPENCODE_PID=$!
echo $OPENCODE_PID > /tmp/opencode.pid

# Wait for server to be ready
echo "Waiting for OpenCode server..."
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:${OPENCODE_PORT}/global/health > /dev/null 2>&1; then
    echo "OpenCode server is ready!"
    break
  fi
  sleep 1
done

# Verify server is running
if ! curl -fsS http://127.0.0.1:${OPENCODE_PORT}/global/health > /dev/null 2>&1; then
  echo "OpenCode server failed to start!"
  cat /tmp/opencode-server.log
  exit 1
fi

echo "═══════════════════════════════════════════════════════"
echo "  OpenCode server running on port ${OPENCODE_PORT}"
echo "  Password saved to /tmp/opencode-password.txt"
echo "  Working directory: ${workDir}"
echo "═══════════════════════════════════════════════════════"

# Keep container running
while true; do sleep 3600; done
`
}

/**
 * Generate the ralph loop script that runs inside the container
 */
export function generateRalphScript(opts: SetupOptions): string {
  const { maxIterations = 10 } = opts

  return `#!/bin/bash
# Ralph loop - runs opencode repeatedly until completion
set -e

MAX_ITERATIONS=${maxIterations}
OPENCODE_URL="http://127.0.0.1:${OPENCODE_PORT}"

echo "Starting Ralph loop - Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════════════"

  # Run opencode with the prompt
  OUTPUT=$(opencode run "$(cat prompt.md)" 2>&1 | tee /dev/stderr) || true

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"

    # Signal completion via a file
    echo "COMPLETE" > ${RALPH_STATE_DIR}/ralph-complete.txt
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
exit 1
`
}

/**
 * Generate the prompt.md file for ralph
 * @param task - The user's task description
 */
export function generatePromptFile(task: string): string {
  return `# Task

${task}

## Instructions

Complete the task above. When finished, output:

<promise>COMPLETE</promise>

## Guidelines
- Read relevant files to understand the codebase first
- Make focused, minimal changes
- Follow existing code patterns and conventions
- If tests exist, run them to verify your changes
`
}
