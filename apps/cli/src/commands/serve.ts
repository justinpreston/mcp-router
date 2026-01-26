/**
 * Serve command - Start the MCP Router in server mode.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../lib/config.js';

export const serveCommand = new Command('serve')
  .description('Start MCP Router in server mode')
  .option('-p, --port <port>', 'Port to listen on', '3847')
  .option('-H, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('--no-auth', 'Disable authentication (development only)')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (options) => {
    const spinner = ora('Starting MCP Router server...').start();

    try {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const requireAuth = options.auth !== false;

      if (!requireAuth) {
        spinner.warn('Authentication disabled - development mode only!');
      }

      // Load configuration
      const config = await loadConfig();

      spinner.text = `Starting server on ${host}:${port}...`;

      // Note: In a full implementation, this would start the actual MCP aggregator server
      // For now, we provide a placeholder that demonstrates the CLI structure
      console.log(chalk.yellow('\n⚠️  Server mode requires the full MCP Router runtime'));
      console.log(chalk.gray('   Use the desktop application for full server functionality.\n'));

      spinner.succeed('Server configuration validated');
      
      console.log(chalk.green('\nServer would start with:'));
      console.log(chalk.gray(`  Host: ${host}`));
      console.log(chalk.gray(`  Port: ${port}`));
      console.log(chalk.gray(`  Auth: ${requireAuth ? 'enabled' : 'disabled'}`));

      // Keep process running (in real implementation)
      console.log(chalk.cyan('\n💡 Tip: Use the desktop app for full server mode'));

    } catch (error) {
      spinner.fail('Failed to start server');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
