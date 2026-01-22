import { For, Show } from "solid-js"
import type { Language, RuntimeKind } from "../types"
import { runtimeFromImage } from "../types"

interface ExamplesProps {
  image: string
  onSelect: (code: string) => void
}

export const DEFAULT_CODE: Record<Language, string> = {
  python: `# Welcome to Sandbox Playground!
# Write your code here and click Run to execute it.

def fibonacci(n):
    """Generate fibonacci sequence up to n numbers"""
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print("Fibonacci sequence (first 10 numbers):")
print(fibonacci(10))`,
  javascript: `// Welcome to Sandbox Playground!
// Write your code here and click Run to execute it.

function fibonacci(n) {
  const result = [];
  let a = 0, b = 1;
  for (let i = 0; i < n; i++) {
    result.push(a);
    [a, b] = [b, a + b];
  }
  return result;
}

console.log("Fibonacci sequence (first 10 numbers):");
console.log(fibonacci(10));`,
  bash: `#!/bin/bash
# Welcome to Sandbox Playground!
# Write your code here and click Run to execute it.

echo "Hello from the cloud sandbox!"
echo ""
echo "System info:"
uname -a`,
}

const EXAMPLES: Record<RuntimeKind, Array<{ name: string; code: string }>> = {
  python: [
    {
      name: "Hello World",
      code: `print("Hello from the cloud sandbox!")`,
    },
    {
      name: "Fibonacci",
      code: `def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        print(a, end=" ")
        a, b = b, a + b
    print()

fibonacci(15)`,
    },
    {
      name: "HTTP Request",
      code: `import urllib.request
import json

url = "https://api.github.com/repos/python/cpython"
response = urllib.request.urlopen(url)
data = json.loads(response.read())

print(f"Repository: {data['full_name']}")
print(f"Stars: {data['stargazers_count']:,}")
print(f"Language: {data['language']}")`,
    },
    {
      name: "File Operations",
      code: `import os

# Create a file
with open("/tmp/hello.txt", "w") as f:
    f.write("Hello from Python!\\n")
    f.write("This file was created in a cloud sandbox.")

# Read and print
with open("/tmp/hello.txt", "r") as f:
    print(f.read())

# List directory
print("\\nFiles in /tmp:")
for f in os.listdir("/tmp"):
    print(f"  {f}")`,
    },
    {
      name: "System Info",
      code: `import platform
import os

print(f"Python: {platform.python_version()}")
print(f"OS: {platform.system()} {platform.release()}")
print(f"Architecture: {platform.machine()}")
print(f"CPU cores: {os.cpu_count()}")
print(f"User: {os.getenv('USER', 'unknown')}")
print(f"PWD: {os.getcwd()}")`,
    },
  ],
  node: [
    {
      name: "Hello World",
      code: `console.log("Hello from the cloud sandbox!")`,
    },
    {
      name: "Async/Await",
      code: `async function fetchRepo() {
  const response = await fetch("https://api.github.com/repos/nodejs/node");
  const data = await response.json();
  
  console.log(\`Repository: \${data.full_name}\`);
  console.log(\`Stars: \${data.stargazers_count.toLocaleString()}\`);
  console.log(\`Language: \${data.language}\`);
}

fetchRepo();`,
    },
    {
      name: "File System",
      code: `const fs = require('fs');
const path = require('path');

// Write a file
fs.writeFileSync('/tmp/hello.txt', 'Hello from Node.js!\\n');

// Read it back
const content = fs.readFileSync('/tmp/hello.txt', 'utf8');
console.log('File content:', content);

// List directory
console.log('\\nFiles in /tmp:');
fs.readdirSync('/tmp').forEach(f => console.log('  ' + f));`,
    },
    {
      name: "Process Info",
      code: `const os = require('os');

console.log('Node.js:', process.version);
console.log('Platform:', os.platform());
console.log('Architecture:', os.arch());
console.log('CPUs:', os.cpus().length);
console.log('Total Memory:', (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB');
console.log('Free Memory:', (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB');
console.log('Uptime:', os.uptime() + ' seconds');`,
    },
  ],
  bash: [
    {
      name: "Hello World",
      code: `echo "Hello from the cloud sandbox!"`,
    },
    {
      name: "System Info",
      code: `echo "=== System Information ==="
echo "Hostname: $(hostname)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo "Uptime: $(uptime -p 2>/dev/null || uptime)"
echo ""
echo "=== Memory ==="
cat /proc/meminfo | head -3
echo ""
echo "=== Disk Space ==="
df -h /`,
    },
    {
      name: "File Operations",
      code: `# Create a directory
mkdir -p /tmp/sandbox-test

# Create files
echo "File 1 content" > /tmp/sandbox-test/file1.txt
echo "File 2 content" > /tmp/sandbox-test/file2.txt
date > /tmp/sandbox-test/timestamp.txt

# List files
echo "Created files:"
ls -la /tmp/sandbox-test/

# Read a file
echo ""
echo "Timestamp content:"
cat /tmp/sandbox-test/timestamp.txt`,
    },
    {
      name: "Network Check",
      code: `echo "=== Network Information ==="
echo "IP addresses:"
ip addr 2>/dev/null || ifconfig 2>/dev/null || echo "Network tools not available"

echo ""
echo "=== DNS Resolution ==="
nslookup github.com 2>/dev/null || host github.com 2>/dev/null || echo "DNS tools not available"

echo ""
echo "=== Connectivity Test ==="
wget -q -O - https://api.github.com/zen 2>/dev/null || curl -s https://api.github.com/zen 2>/dev/null || echo "HTTP tools not available"`,
    },
  ],
  generic: [
    {
      name: "Hello World",
      code: `echo "Hello from the cloud sandbox!"`,
    },
    {
      name: "System Info",
      code: `echo "=== System Information ==="
echo "Hostname: $(hostname)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
cat /etc/os-release 2>/dev/null | head -5 || echo "OS info not available"`,
    },
    {
      name: "List Files",
      code: `echo "Root directory contents:"
ls -la /
echo ""
echo "Current directory:"
pwd`,
    },
  ],
}

export function Examples(props: ExamplesProps) {
  const runtime = () => runtimeFromImage(props.image)
  const examples = () => EXAMPLES[runtime()] || EXAMPLES.generic

  return (
    <div class="flex items-center gap-3 h-11 px-4 border-b border-[var(--color-border)]">
      <div class="flex items-center gap-2 text-[var(--color-text-dim)]">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span class="text-[12px] font-medium">Examples</span>
      </div>
      <div class="w-px h-5 bg-[var(--color-border)]" />
      <Show
        when={examples().length > 0}
        fallback={<span class="text-[12px] text-[var(--color-text-dim)]">No examples available</span>}
      >
        <div class="flex items-center gap-1 overflow-x-auto">
          <For each={examples()}>
            {(example) => (
              <button
                class="px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-elevated)] rounded-md transition-all whitespace-nowrap"
                onClick={() => props.onSelect(example.code)}
              >
                {example.name}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
