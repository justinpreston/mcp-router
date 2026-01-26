import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { SkillInfo, SkillCreateConfig } from '@preload/api';
import { getElectronAPI } from '@renderer/hooks';

interface SkillState {
  skills: SkillInfo[];
  selectedSkillId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSkills: (projectId?: string) => Promise<void>;
  selectSkill: (id: string | null) => void;
  registerSkill: (config: SkillCreateConfig) => Promise<SkillInfo>;
  updateSkill: (id: string, updates: Partial<SkillInfo>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  enableSkill: (id: string) => Promise<void>;
  disableSkill: (id: string) => Promise<void>;
  refreshSkill: (id: string) => Promise<void>;
  discoverSkills: (directory: string) => Promise<SkillInfo[]>;
  clearError: () => void;
}

export const useSkillStore = create<SkillState>()(
  devtools(
    (set) => ({
      skills: [],
      selectedSkillId: null,
      isLoading: false,
      error: null,

      fetchSkills: async (projectId?: string) => {
        const api = getElectronAPI();
        if (!api) return;

        set({ isLoading: true, error: null });

        try {
          const skills = await api.skills.list(projectId);
          set({ skills, isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch skills',
            isLoading: false,
          });
        }
      },

      selectSkill: (id) => {
        set({ selectedSkillId: id });
      },

      registerSkill: async (config) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          const skill = await api.skills.register(config);
          set((state) => ({
            skills: [...state.skills, skill],
            isLoading: false,
          }));
          return skill;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to register skill';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      updateSkill: async (id, updates) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          const updated = await api.skills.update(id, updates);
          set((state) => ({
            skills: state.skills.map((s) => (s.id === id ? updated : s)),
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update skill';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      deleteSkill: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          await api.skills.delete(id);
          set((state) => ({
            skills: state.skills.filter((s) => s.id !== id),
            selectedSkillId: state.selectedSkillId === id ? null : state.selectedSkillId,
            isLoading: false,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to delete skill';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      enableSkill: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        try {
          await api.skills.enable(id);
          set((state) => ({
            skills: state.skills.map((s) =>
              s.id === id ? { ...s, enabled: true } : s
            ),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to enable skill';
          set({ error: message });
          throw error;
        }
      },

      disableSkill: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        try {
          await api.skills.disable(id);
          set((state) => ({
            skills: state.skills.map((s) =>
              s.id === id ? { ...s, enabled: false } : s
            ),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to disable skill';
          set({ error: message });
          throw error;
        }
      },

      refreshSkill: async (id) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        try {
          const refreshed = await api.skills.refresh(id);
          set((state) => ({
            skills: state.skills.map((s) => (s.id === id ? refreshed : s)),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to refresh skill';
          set({ error: message });
          throw error;
        }
      },

      discoverSkills: async (directory) => {
        const api = getElectronAPI();
        if (!api) throw new Error('Electron API not available');

        set({ isLoading: true, error: null });

        try {
          const discovered = await api.skills.discover(directory);
          // Merge discovered skills with existing ones
          set((state) => {
            const existingIds = new Set(state.skills.map((s) => s.id));
            const newSkills = discovered.filter((s) => !existingIds.has(s.id));
            return {
              skills: [...state.skills, ...newSkills],
              isLoading: false,
            };
          });
          return discovered;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to discover skills';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'skill-store' }
  )
);

// Selectors
export const selectSkills = (state: SkillState) => state.skills;
export const selectSelectedSkill = (state: SkillState) =>
  state.skills.find((s) => s.id === state.selectedSkillId) || null;
export const selectEnabledSkills = (state: SkillState) =>
  state.skills.filter((s) => s.enabled);
export const selectSkillsByProject = (projectId: string) => (state: SkillState) =>
  state.skills.filter((s) => s.projectId === projectId);
export const selectSkillById = (id: string) => (state: SkillState) =>
  state.skills.find((s) => s.id === id) || null;
