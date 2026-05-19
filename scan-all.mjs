#!/usr/bin/env node

/**
 * scan-all.mjs — Combined Career-Ops scan entrypoint.
 *
 * Runs both discovery layers sequentially:
 *   1. Provider/company scan      (scan.mjs)
 *   2. Job-board aggregator scan  (scan-job-boards.mjs)
 *
 * Any CLI args are forwarded to both scripts. This keeps shared flags like
 * `--dry-run` working across the full scan workflow while allowing each child
 * script to ignore flags it doesn't understand.
 */

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`Usage: node scan-all.mjs [options]

Runs both Career-Ops scan layers in sequence:
  1. scan.mjs             provider/company ATS scan
  2. scan-job-boards.mjs  job-board aggregator scan

Options are forwarded to both child scanners. Use --help here to show this
summary without running either scanner.`);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

function runNodeScript(script, forwardedArgs) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [script, ...forwardedArgs], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    proc.on('error', (err) => {
      console.error(`\n[scan-all] Failed to start ${script}: ${err.message}`);
      resolve(1);
    });

    proc.on('exit', (code, signal) => {
      if (signal) {
        console.error(`\n[scan-all] ${script} exited via signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
  });
}

async function main() {
  const steps = [
    { label: 'Provider/company scan', script: 'scan.mjs' },
    { label: 'Job-board aggregator scan', script: 'scan-job-boards.mjs' },
  ];

  let failed = false;

  for (const step of steps) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${step.label} → node ${step.script}${args.length ? ` ${args.join(' ')}` : ''}`);
    console.log(`${'='.repeat(60)}`);

    const code = await runNodeScript(step.script, args);
    if (code !== 0) {
      failed = true;
      console.error(`[scan-all] ${step.script} exited with code ${code}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`[scan-all] ${err.stack || err.message}`);
  process.exit(1);
});
