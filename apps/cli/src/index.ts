#!/usr/bin/env node
/**
 * MCP Router CLI
 * Command-line interface for connecting to and managing MCP servers.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { connectCommand } from './commands/connect.js';
import { serveCommand } from './commands/serve.js';
import { listCommand } from './commands/list.js';
import { callCommand } from './commands/call.js';
import { configCommand } from './commands/config.js';

const program = new Command();

program
  .name('mcpr')
  .description('MCP Router CLI - Manage and connect to MCP servers')
  .version('1.0.0');

// Register commands
program.addCommand(connectCommand);
program.addCommand(serveCommand);
program.addCommand(listCommand);
program.addCommand(callCommand);
program.addCommand(configCommand);

// Handle errors
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});

// Parse arguments
program.parse();
