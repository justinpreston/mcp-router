/**
 * Connect command - Connect to a remote MCP Router instance.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { McpClient } from '../lib/client.js';
import { loadConfig, saveConfig } from '../lib/config.js';

export const connectCommand = new Command('connect')
  .description('Connect to a remote MCP Router instance')
  .option('-h, --host <host>', 'Host address', 'localhost')
  .option('-p, --port <port>', 'Port number', '3282')
  .option('-t, --token <token>', 'Authentication token')
  .option('--save', 'Save connection as default')
  .action(async (options) => {
    const spinner = ora('Connecting to MCP Router...').start();

    try {
      const host = options.host;
      const port = parseInt(options.port, 10);
      const token = options.token || process.env.MCPR_TOKEN;

      if (!token) {
        spinner.fail('No authentication token provided');
        console.log(chalk.yellow('\nProvide a token using:'));
        console.log(chalk.gray('  --token <token>'));
        console.log(chalk.gray('  MCPR_TOKEN environment variable'));
        process.exit(1);
      }

      const client = new McpClient({ host, port, token });
      
      // Test connection
      const info = await client.getServerInfo();
      
      spinner.succeed('Connected to MCP Router');
      
      console.log(chalk.green('\n✓ Server Information:'));
      console.log(chalk.gray(`  Version: ${info.version}`));
      console.log(chalk.gray(`  Servers: ${info.serverCount}`));
      console.log(chalk.gray(`  URL: http://${host}:${port}`));

      // Save connection if requested
      if (options.save) {
        await saveConfig({
          defaultHost: host,
          defaultPort: port,
          token,
        });
        console.log(chalk.green('\n✓ Connection saved as default'));
      }

    } catch (error) {
      spinner.fail('Failed to connect');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
