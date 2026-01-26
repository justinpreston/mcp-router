import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  ISkillsService,
  ISkillRepository,
  ILogger,
  IConfig,
  Skill,
  SkillCreateInput,
  SkillManifest,
  MCPServer,
  ServerTransport,
} from '@main/core/interfaces';
import * as fs from 'fs/promises';
import * as path from 'path';

@injectable()
export class SkillsService implements ISkillsService {
  private skillsDirectory: string;

  constructor(
    @inject(TYPES.SkillRepository) private skillRepository: ISkillRepository,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.Config) private config: IConfig
  ) {
    // Default skills directory in app data
    const dataDir = this.config.get<string>('dataDir') || process.env.HOME || '/tmp';
    this.skillsDirectory = path.join(dataDir, '.mcp-router', 'skills');
  }

  async discoverSkills(directory: string): Promise<Skill[]> {
    const searchDir = directory || this.skillsDirectory;
    const discoveredSkills: Skill[] = [];

    try {
      await fs.mkdir(searchDir, { recursive: true });

      const entries = await fs.readdir(searchDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(searchDir, entry.name);

        try {
          // Check if it's a symlink or directory
          const stats = await fs.lstat(entryPath);
          let targetPath = entryPath;
          let source: Skill['source'] = 'local';

          if (stats.isSymbolicLink()) {
            targetPath = await fs.realpath(entryPath);
            source = 'symlink';
          }

          // Look for manifest file
          const manifestPath = await this.findManifest(targetPath);
          if (manifestPath) {
            const manifest = await this.parseManifest(manifestPath);
            if (manifest) {
              // Check if skill already exists
              const existingSkill = await this.skillRepository.findByPath(targetPath);
              if (existingSkill) {
                // Update existing skill
                const updated = await this.skillRepository.update({
                  ...existingSkill,
                  status: 'available',
                  manifest,
                  serverConfig: this.manifestToServerConfig(manifest, targetPath),
                  lastCheckedAt: Date.now(),
                });
                discoveredSkills.push(updated);
              } else {
                // Create new skill
                const skill = await this.skillRepository.create({
                  id: nanoid(),
                  name: manifest.name,
                  description: manifest.description,
                  path: targetPath,
                  source,
                  status: 'available',
                  manifest,
                  serverConfig: this.manifestToServerConfig(manifest, targetPath),
                  tags: manifest.capabilities || [],
                  enabled: false,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                });
                discoveredSkills.push(skill);
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to process skill entry: ${entryPath}`, { error: err });
        }
      }

      this.logger.info(`Discovered ${discoveredSkills.length} skills in ${searchDir}`);
      return discoveredSkills;
    } catch (err) {
      this.logger.error(`Failed to discover skills in ${searchDir}`, { error: err });
      throw err;
    }
  }

  async registerSkill(input: SkillCreateInput): Promise<Skill> {
    this.logger.info(`Registering skill: ${input.name}`);

    const skillPath = input.path;
    let manifest: SkillManifest | null = null;

    if (skillPath) {
      // Look for manifest in the path
      const manifestPath = await this.findManifest(skillPath);
      if (manifestPath) {
        manifest = await this.parseManifest(manifestPath);
      }
    }

    // Check for duplicate
    if (skillPath) {
      const existing = await this.skillRepository.findByPath(skillPath);
      if (existing) {
        throw new Error(`Skill already registered at path: ${skillPath}`);
      }
    }

    const skill = await this.skillRepository.create({
      id: nanoid(),
      name: input.name,
      description: input.description,
      path: input.path,
      url: input.url,
      source: input.source,
      status: manifest ? 'available' : 'loading',
      manifest: manifest || undefined,
      serverConfig: manifest && skillPath ? this.manifestToServerConfig(manifest, skillPath) : undefined,
      projectId: input.projectId,
      tags: input.tags || manifest?.capabilities || [],
      enabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return skill;
  }

  async getSkill(skillId: string): Promise<Skill | null> {
    return this.skillRepository.findById(skillId);
  }

  async getAllSkills(): Promise<Skill[]> {
    return this.skillRepository.findAll();
  }

  async getSkillsByProject(projectId: string): Promise<Skill[]> {
    return this.skillRepository.findByProjectId(projectId);
  }

  async updateSkill(skillId: string, updates: Partial<Skill>): Promise<Skill> {
    const existing = await this.skillRepository.findById(skillId);
    if (!existing) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    return this.skillRepository.update({
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  async deleteSkill(skillId: string): Promise<void> {
    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    this.logger.info(`Deleting skill: ${skill.name}`);
    await this.skillRepository.delete(skillId);
  }

  async enableSkill(skillId: string): Promise<void> {
    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    this.logger.info(`Enabling skill: ${skill.name}`);

    // Verify the skill is available
    if (skill.status === 'error' || skill.status === 'unavailable') {
      throw new Error(`Cannot enable skill with status: ${skill.status}`);
    }

    await this.skillRepository.update({
      ...skill,
      enabled: true,
      updatedAt: Date.now(),
    });
  }

  async disableSkill(skillId: string): Promise<void> {
    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    this.logger.info(`Disabling skill: ${skill.name}`);

    await this.skillRepository.update({
      ...skill,
      enabled: false,
      updatedAt: Date.now(),
    });
  }

  async createSymlink(sourcePath: string, targetDir: string, name: string): Promise<string> {
    this.logger.info(`Creating symlink: ${sourcePath} -> ${targetDir}/${name}`);

    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Sanitize name
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const symlinkPath = path.join(targetDir, safeName);

    // Remove existing symlink if present
    try {
      await fs.unlink(symlinkPath);
    } catch {
      // Ignore if doesn't exist
    }

    // Create new symlink
    await fs.symlink(sourcePath, symlinkPath);

    return symlinkPath;
  }

  async removeSymlink(symlinkPath: string): Promise<void> {
    this.logger.info(`Removing symlink: ${symlinkPath}`);

    try {
      const stats = await fs.lstat(symlinkPath);
      if (!stats.isSymbolicLink()) {
        throw new Error('Path is not a symlink');
      }
      await fs.unlink(symlinkPath);
    } catch (err) {
      this.logger.warn(`Failed to remove symlink: ${symlinkPath}`, { error: err });
      throw err;
    }
  }

  async refreshSkill(skillId: string): Promise<Skill> {
    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    this.logger.info(`Refreshing skill: ${skill.name}`);

    try {
      if (!skill.path) {
        throw new Error('Skill has no path');
      }

      // Re-parse manifest
      const manifestPath = await this.findManifest(skill.path);
      if (!manifestPath) {
        return this.skillRepository.update({
          ...skill,
          status: 'unavailable',
          error: 'Manifest not found',
          lastCheckedAt: Date.now(),
        });
      }

      const manifest = await this.parseManifest(manifestPath);
      if (!manifest) {
        return this.skillRepository.update({
          ...skill,
          status: 'error',
          error: 'Invalid manifest',
          lastCheckedAt: Date.now(),
        });
      }

      return this.skillRepository.update({
        ...skill,
        status: 'available',
        manifest,
        serverConfig: this.manifestToServerConfig(manifest, skill.path),
        tags: manifest.capabilities || skill.tags,
        error: undefined,
        lastCheckedAt: Date.now(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return this.skillRepository.update({
        ...skill,
        status: 'error',
        error: errorMessage,
        lastCheckedAt: Date.now(),
      });
    }
  }

  async toServerConfig(skillId: string): Promise<Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt' | 'status'>> {
    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    if (!skill.serverConfig) {
      throw new Error('Skill has no server configuration');
    }

    return {
      name: skill.name,
      description: skill.description,
      transport: skill.serverConfig.transport,
      command: skill.serverConfig.command,
      args: skill.serverConfig.args,
      env: skill.serverConfig.env,
      toolPermissions: {},
    };
  }

  async parseManifest(manifestPath: string): Promise<SkillManifest | null> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const data = JSON.parse(content);

      // Handle package.json with mcpSkill or mcp-skill field
      if (path.basename(manifestPath) === 'package.json') {
        const mcpConfig = data.mcpSkill || data['mcp-skill'];
        if (!mcpConfig) {
          return null;
        }
        return {
          name: mcpConfig.name || data.name,
          version: mcpConfig.version || data.version,
          description: mcpConfig.description || data.description,
          author: typeof data.author === 'string' ? data.author : data.author?.name,
          license: data.license,
          command: mcpConfig.command,
          args: mcpConfig.args,
          env: mcpConfig.env,
          transport: mcpConfig.transport,
          capabilities: mcpConfig.capabilities,
          dependencies: mcpConfig.dependencies,
        };
      }

      // Standard skill manifest
      const manifest: SkillManifest = {
        name: data.name,
        version: data.version,
        description: data.description,
        author: data.author,
        license: data.license,
        main: data.main,
        command: data.command,
        args: data.args,
        env: data.env,
        transport: data.transport,
        capabilities: data.capabilities,
        dependencies: data.dependencies,
      };

      // Validate required fields
      if (!manifest.name || !manifest.version) {
        this.logger.warn(`Invalid manifest: missing required fields in ${manifestPath}`);
        return null;
      }

      return manifest;
    } catch (err) {
      this.logger.warn(`Failed to parse manifest: ${manifestPath}`, { error: err });
      return null;
    }
  }

  private manifestToServerConfig(
    manifest: SkillManifest,
    skillPath: string
  ): Skill['serverConfig'] {
    const command = manifest.command || 'node';
    const args = manifest.args || (manifest.main ? [path.join(skillPath, manifest.main)] : []);
    const transport: ServerTransport = manifest.transport || 'stdio';

    return {
      command,
      args,
      env: manifest.env,
      transport,
    };
  }

  private async findManifest(directory: string): Promise<string | null> {
    const manifestNames = ['skill.json', 'mcp-skill.json', 'manifest.json', 'package.json'];

    for (const name of manifestNames) {
      const manifestPath = path.join(directory, name);
      try {
        await fs.access(manifestPath);

        // For package.json, verify it has MCP skill metadata
        if (name === 'package.json') {
          const content = await fs.readFile(manifestPath, 'utf-8');
          const pkg = JSON.parse(content);
          if (pkg.mcpSkill || pkg['mcp-skill']) {
            return manifestPath;
          }
          continue;
        }

        return manifestPath;
      } catch {
        // File doesn't exist, try next
      }
    }

    return null;
  }
}
