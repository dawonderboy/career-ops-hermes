#!/usr/bin/env node
/**
 * pipeline-run.mjs — Wrapper to invoke `/career-ops pipeline` via Claude Code CLI.
 *
 * Called by both dashboards when the "run pipeline" button is clicked.
 * Uses Claude Code CLI to execute the /career-ops pipeline skill.
 *
 * Exit code reflects pipeline success/failure.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Invoke Claude Code CLI with the /career-ops pipeline skill
// Using the full prompt format to trigger the skill
const proc = spawn('claude', [
  '-p',
  'Run /career-ops pipeline',
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
