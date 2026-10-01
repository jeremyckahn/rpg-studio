#!/usr/bin/env node
import { CompanionServer } from './server.js';

export const runCompanionCli = async (port = 8080) => {
  console.log(`Starting RPG Studio AI Companion Server on port ${port}...`);
  const server = new CompanionServer({ port });

  await server.start();
  console.log(`Companion Server listening on ws://localhost:${port}`);
  console.log('Waiting for RPG Studio Editor connection...');

  return server;
};

// If executed directly from CLI
if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts')) {
  runCompanionCli().catch((err) => {
    console.error('Fatal companion error:', err);
    process.exit(1);
  });
}
