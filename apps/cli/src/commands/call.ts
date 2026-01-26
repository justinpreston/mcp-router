/**
 * Call command - Execute a tool on a connected MCP server.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { McpClient } from '../lib/client.js';
import { loadConfig } from '../lib/config.js';
import { formatOutput, OutputFormat } from '../lib/output.js';

export const callCommand = new Command('call')
  .description('Execute a tool on a connected MCP server')
  .argument('<tool>', 'Tool name to execute')
  .option('-a, --args <json>', 'Tool arguments as JSON string', '{}')
  .option('-s, --server <id>', 'Target server ID (optional)')
  .option('-f, --format <format>', 'Output format: json, pretty', 'pretty')
  .option('-h, --host <host>', 'Host address')
  .option('-p, --port <port>', 'Port number')
  .option('-t, --token <token>', 'Authentication token')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .action(async (tool: string, options) => {
    const spinner = ora(`Calling tool: ${tool}...`).start();

    try {
      const config = await loadConfig();
      const host = options.host || config.defaultHost || 'localhost';
      const port = parseInt(options.port || config.defaultPort || '3282', 10);
      const token = options.token || config.token || process.env.MCPR_TOKEN;
      const format = (options.format || 'pretty') as OutputFormat;
      const timeout = parseInt(options.timeout, 10);

      if (!token) {
        spinner.fail('No authentication token');
        console.log(chalk.yellow('\nRun `mcpr connect --token <token> --save` first'));
        process.exit(1);
      }

      // Parse arguments
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(options.args);
      } catch {
        spinner.fail('Invalid JSON arguments');
        console.error(chalk.red('\nArguments must be valid JSON'));
        console.log(chalk.gray('Example: --args \'{"query": "hello"}\''));
        process.exit(1);
      }

      const client = new McpClient({ host, port, token });

      // Execute tool
      const startTime = Date.now();
      const result = await client.callTool(tool, args, {
        serverId: options.server,
        timeout,
      });
      const duration = Date.now() - startTime;

      spinner.succeed(`Tool executed in ${duration}ms`);

      // Output result
      if (format === 'json') {
        console.log(formatOutput(result, 'json'));
      } else {
        console.log(chalk.green('\n✓ Result:'));
        
        if (result.content) {
          for (const item of result.content) {
            if (item.type === 'text') {
              console.log(chalk.white(item.text));
            } else if (item.type === 'image') {
              console.log(chalk.gray(`[Image: ${item.mimeType}]`));
            } else if (item.type === 'resource') {
              console.log(chalk.cyan(`[Resource: ${item.uri}]`));
            } else {
              console.log(chalk.gray(JSON.stringify(item, null, 2)));
            }
          }
        } else {
          console.log(chalk.gray(JSON.stringify(result, null, 2)));
        }

        if (result.isError) {
          console.log(chalk.red('\n⚠ Tool returned an error'));
        }
      }

    } catch (error) {
      spinner.fail('Tool execution failed');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
