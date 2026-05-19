#!/usr/bin/env node
/**
 * scan-run.mjs — Wrapper to invoke `/career-ops scan` via Claude Code CLI.
 *
 * Called by dashboards when the "scan" button is clicked.
 * Uses Claude Code CLI to execute the /career-ops scan skill.
 *
 * Exit code reflects scan success/failure.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Invoke Claude Code CLI with the /career-ops scan skill
const proc = spawn('claude', [
  '-p',
  'Run /career-ops scan',
  '--permission-mode', 'bypassPermissions',
  '--output-format', 'text'
], {
  cwd: process.cwd() || __dirname,
  stdio: 'inherit',
});

proc.on('exit', code => {
  process.exit(code || 0);
});

proc.on('error', err => {
  console.error(`Failed to spawn claude: ${err.message}`);
  process.exit(1);
});
