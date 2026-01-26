/**
 * List command - List servers, tools, or other resources.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { McpClient } from '../lib/client.js';
import { loadConfig } from '../lib/config.js';
import { formatOutput, OutputFormat } from '../lib/output.js';

export const listCommand = new Command('list')
  .description('List servers, tools, or other resources')
  .argument('<resource>', 'Resource type: servers, tools, tokens, policies')
  .option('-s, --server <id>', 'Filter by server ID (for tools)')
  .option('-f, --format <format>', 'Output format: table, json', 'table')
  .option('-h, --host <host>', 'Host address')
  .option('-p, --port <port>', 'Port number')
  .option('-t, --token <token>', 'Authentication token')
  .action(async (resource: string, options) => {
    const spinner = ora(`Fetching ${resource}...`).start();

    try {
      const config = await loadConfig();
      const host = options.host || config.defaultHost || 'localhost';
      const port = parseInt(options.port || config.defaultPort || '3282', 10);
      const token = options.token || config.token || process.env.MCPR_TOKEN;
      const format = (options.format || 'table') as OutputFormat;

      if (!token) {
        spinner.fail('No authentication token');
        console.log(chalk.yellow('\nRun `mcpr connect --token <token> --save` first'));
        process.exit(1);
      }

      const client = new McpClient({ host, port, token });

      switch (resource.toLowerCase()) {
        case 'servers': {
          const servers = await client.listServers();
          spinner.succeed(`Found ${servers.length} server(s)`);
          
          if (format === 'json') {
            console.log(formatOutput(servers, 'json'));
          } else {
            const table = new Table({
              head: [
                chalk.cyan('ID'),
                chalk.cyan('Name'),
                chalk.cyan('Status'),
                chalk.cyan('Transport'),
                chalk.cyan('Tools'),
              ],
              style: { head: [], border: [] },
            });

            for (const server of servers) {
              const statusColor = server.status === 'running' ? chalk.green : 
                                 server.status === 'error' ? chalk.red : chalk.gray;
              table.push([
                server.id.substring(0, 8),
                server.name,
                statusColor(server.status),
                server.transport,
                String(server.toolCount || 0),
              ]);
            }
            console.log(table.toString());
          }
          break;
        }

        case 'tools': {
          const tools = await client.listTools(options.server);
          spinner.succeed(`Found ${tools.length} tool(s)`);
          
          if (format === 'json') {
            console.log(formatOutput(tools, 'json'));
          } else {
            const table = new Table({
              head: [
                chalk.cyan('Name'),
                chalk.cyan('Server'),
                chalk.cyan('Description'),
                chalk.cyan('Enabled'),
              ],
              style: { head: [], border: [] },
              colWidths: [25, 15, 40, 10],
              wordWrap: true,
            });

            for (const tool of tools) {
              table.push([
                tool.name,
                tool.serverName?.substring(0, 12) || '-',
                (tool.description || '-').substring(0, 38),
                tool.enabled ? chalk.green('✓') : chalk.gray('✗'),
              ]);
            }
            console.log(table.toString());
          }
          break;
        }

        case 'tokens': {
          const tokens = await client.listTokens();
          spinner.succeed(`Found ${tokens.length} token(s)`);
          
          if (format === 'json') {
            console.log(formatOutput(tokens, 'json'));
          } else {
            const table = new Table({
              head: [
                chalk.cyan('ID'),
                chalk.cyan('Name'),
                chalk.cyan('Client'),
                chalk.cyan('Expires'),
                chalk.cyan('Scopes'),
              ],
              style: { head: [], border: [] },
            });

            for (const token of tokens) {
              const expiresAt = new Date(token.expiresAt * 1000);
              const isExpired = expiresAt < new Date();
              table.push([
                token.id.substring(0, 8),
                token.name,
                token.clientId.substring(0, 10),
                isExpired ? chalk.red('Expired') : expiresAt.toLocaleDateString(),
                token.scopes.join(', ') || 'all',
              ]);
            }
            console.log(table.toString());
          }
          break;
        }

        case 'policies': {
          const policies = await client.listPolicies();
          spinner.succeed(`Found ${policies.length} policy(ies)`);
          
          if (format === 'json') {
            console.log(formatOutput(policies, 'json'));
          } else {
            const table = new Table({
              head: [
                chalk.cyan('ID'),
                chalk.cyan('Name'),
                chalk.cyan('Scope'),
                chalk.cyan('Action'),
                chalk.cyan('Pattern'),
              ],
              style: { head: [], border: [] },
            });

            for (const policy of policies) {
              const actionColor = policy.action === 'allow' ? chalk.green :
                                 policy.action === 'deny' ? chalk.red : chalk.yellow;
              table.push([
                policy.id.substring(0, 8),
                policy.name,
                policy.scope,
                actionColor(policy.action),
                policy.pattern.substring(0, 20),
              ]);
            }
            console.log(table.toString());
          }
          break;
        }

        default:
          spinner.fail(`Unknown resource type: ${resource}`);
          console.log(chalk.yellow('\nAvailable resources: servers, tools, tokens, policies'));
          process.exit(1);
      }

    } catch (error) {
      spinner.fail(`Failed to list ${resource}`);
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
