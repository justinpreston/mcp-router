import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import { z } from 'zod';
import { TYPES } from '@main/core/types';
import type { ISkillsService, Skill } from '@main/core/interfaces';

const SkillCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  path: z.string().optional(),
  url: z.string().url().optional(),
  source: z.enum(['local', 'symlink', 'remote', 'builtin']),
  projectId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const DiscoverSkillsSchema = z.object({
  directory: z.string().min(1),
});

const SkillIdSchema = z.object({
  skillId: z.string().min(1),
});

const UpdateSkillSchema = z.object({
  skillId: z.string().min(1),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    projectId: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
  }),
});

const CreateSymlinkSchema = z.object({
  sourcePath: z.string().min(1),
  targetDir: z.string().min(1),
  name: z.string().min(1),
});

const RemoveSymlinkSchema = z.object({
  symlinkPath: z.string().min(1),
});

const ListSkillsSchema = z.object({
  projectId: z.string().optional(),
});

const ParseManifestSchema = z.object({
  manifestPath: z.string().min(1),
});

export function registerSkillsHandlers(container: Container): void {
  const skillsService = container.get<ISkillsService>(TYPES.SkillsService);

  // Discover skills in directory
  ipcMain.handle('skills:discover', async (_, input: unknown) => {
    const validated = DiscoverSkillsSchema.parse(input);
    return skillsService.discoverSkills(validated.directory);
  });

  // Register a skill
  ipcMain.handle('skills:register', async (_, input: unknown) => {
    const validated = SkillCreateInputSchema.parse(input);
    return skillsService.registerSkill(validated);
  });

  // Get a skill by ID
  ipcMain.handle('skills:get', async (_, input: unknown) => {
    const validated = SkillIdSchema.parse(input);
    return skillsService.getSkill(validated.skillId);
  });

  // Get all skills (optionally filtered by project)
  ipcMain.handle('skills:list', async (_, input: unknown) => {
    const validated = ListSkillsSchema.parse(input || {});
    if (validated.projectId) {
      return skillsService.getSkillsByProject(validated.projectId);
    }
    return skillsService.getAllSkills();
  });

  // Update a skill
  ipcMain.handle('skills:update', async (_, input: unknown) => {
    const validated = UpdateSkillSchema.parse(input);
    return skillsService.updateSkill(validated.skillId, validated.updates as Partial<Skill>);
  });

  // Delete a skill
  ipcMain.handle('skills:delete', async (_, input: unknown) => {
    const validated = SkillIdSchema.parse(input);
    return skillsService.deleteSkill(validated.skillId);
  });

  // Enable a skill
  ipcMain.handle('skills:enable', async (_, input: unknown) => {
    const validated = SkillIdSchema.parse(input);
    return skillsService.enableSkill(validated.skillId);
  });

  // Disable a skill
  ipcMain.handle('skills:disable', async (_, input: unknown) => {
    const validated = SkillIdSchema.parse(input);
    return skillsService.disableSkill(validated.skillId);
  });

  // Create symlink for a skill
  ipcMain.handle('skills:createSymlink', async (_, input: unknown) => {
    const validated = CreateSymlinkSchema.parse(input);
    return skillsService.createSymlink(validated.sourcePath, validated.targetDir, validated.name);
  });

  // Remove symlink
  ipcMain.handle('skills:removeSymlink', async (_, input: unknown) => {
    const validated = RemoveSymlinkSchema.parse(input);
    return skillsService.removeSymlink(validated.symlinkPath);
  });

  // Refresh a skill (re-parse manifest)
  ipcMain.handle('skills:refresh', async (_, input: unknown) => {
    const validated = SkillIdSchema.parse(input);
    return skillsService.refreshSkill(validated.skillId);
  });

  // Convert skill to server config
  ipcMain.handle('skills:toServerConfig', async (_, input: unknown) => {
    const validated = SkillIdSchema.parse(input);
    return skillsService.toServerConfig(validated.skillId);
  });

  // Parse a manifest
  ipcMain.handle('skills:parseManifest', async (_, input: unknown) => {
    const validated = ParseManifestSchema.parse(input);
    return skillsService.parseManifest(validated.manifestPath);
  });
}
