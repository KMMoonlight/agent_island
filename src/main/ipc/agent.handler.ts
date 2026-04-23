import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import { agentToolSchema } from '../../shared/types/agent-hook';
import type { AgentHookService } from '../services/agents/agent-hook-service';

export function registerAgentHandlers(agentHookService: AgentHookService): void {
  ipcMain.handle(IPC_CHANNELS.AGENT.GET_SETUP, () => agentHookService.getSetup());
  ipcMain.handle(IPC_CHANNELS.AGENT.INSTALL_MANAGED_HOOKS, (_event, source: unknown) => {
    const parsedSource = agentToolSchema.safeParse(source);
    if (!parsedSource.success) {
      throw new Error('Unsupported agent hook source.');
    }

    return agentHookService.installManagedHooks(parsedSource.data);
  });
  ipcMain.handle(IPC_CHANNELS.AGENT.UNINSTALL_MANAGED_HOOKS, (_event, source: unknown) => {
    const parsedSource = agentToolSchema.safeParse(source);
    if (!parsedSource.success) {
      throw new Error('Unsupported agent hook source.');
    }

    return agentHookService.uninstallManagedHooks(parsedSource.data);
  });
  ipcMain.handle(IPC_CHANNELS.AGENT.RESOLVE_APPROVAL, (_event, sessionId: unknown, decision: unknown) => {
    if (
      typeof sessionId !== 'string'
      || (decision !== 'deny' && decision !== 'allow-once' && decision !== 'allow-always')
    ) {
      return false;
    }

    return agentHookService.resolvePendingApproval(sessionId, decision);
  });
}
