/**
 * Config command - Manage CLI configuration.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath, CliConfig } from '../lib/config.js';

export const configCommand = new Command('config')
  .description('Manage CLI configuration');

// Show current config
configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    try {
      const config = await loadConfig();
      const configPath = getConfigPath();

      console.log(chalk.cyan('\nConfiguration:'));
      console.log(chalk.gray(`  File: ${configPath}`));
      console.log(chalk.gray(`  Host: ${config.defaultHost || 'localhost'}`));
      console.log(chalk.gray(`  Port: ${config.defaultPort || '3282'}`));
      console.log(chalk.gray(`  Token: ${config.token ? '****' + config.token.slice(-4) : 'not set'}`));

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

// Set config value
configCommand
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Configuration key: host, port, token')
  .argument('<value>', 'Configuration value')
  .action(async (key: string, value: string) => {
    try {
      const config = await loadConfig();

      switch (key.toLowerCase()) {
        case 'host':
          config.defaultHost = value;
          break;
        case 'port':
          config.defaultPort = parseInt(value, 10);
          break;
        case 'token':
          config.token = value;
          break;
        default:
          console.error(chalk.red(`Unknown config key: ${key}`));
          console.log(chalk.yellow('Available keys: host, port, token'));
          process.exit(1);
      }

      await saveConfig(config);
      console.log(chalk.green(`✓ Set ${key} = ${key === 'token' ? '****' : value}`));

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

// Clear config
configCommand
  .command('clear')
  .description('Clear all configuration')
  .action(async () => {
    try {
      await saveConfig({});
      console.log(chalk.green('✓ Configuration cleared'));

    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

// Show config path
configCommand
  .command('path')
  .description('Show configuration file path')
  .action(() => {
    console.log(getConfigPath());
  });
