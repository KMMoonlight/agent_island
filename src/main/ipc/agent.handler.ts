import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import { agentQuestionResponseSchema, agentToolSchema, codexInstallVariantIdSchema } from '../../shared/types/agent-hook';
import type { AgentHookService } from '../services/agents/agent-hook-service';

export function registerAgentHandlers(agentHookService: AgentHookService): void {
  ipcMain.handle(IPC_CHANNELS.AGENT.GET_SETUP, () => agentHookService.getSetup());
  ipcMain.handle(IPC_CHANNELS.AGENT.INSTALL_MANAGED_HOOKS, (_event, source: unknown, options: unknown) => {
    const parsedSource = agentToolSchema.safeParse(source);
    if (!parsedSource.success) {
      throw new Error('Unsupported agent hook source.');
    }

    let variantId: 'standard' | 'no-pretooluse' | undefined;

    if (options !== undefined) {
      if (typeof options !== 'object' || options === null || Array.isArray(options)) {
        throw new Error('Unsupported agent hook install options.');
      }

      const rawVariantId = 'variantId' in options ? (options as { variantId?: unknown }).variantId : undefined;
      if (rawVariantId !== undefined) {
        if (parsedSource.data !== 'codex') {
          throw new Error('Unsupported agent hook install variant.');
        }

        const parsedVariantId = codexInstallVariantIdSchema.safeParse(rawVariantId);
        if (!parsedVariantId.success) {
          throw new Error('Unsupported Codex install variant.');
        }

        variantId = parsedVariantId.data;
      }
    }

    return agentHookService.installManagedHooks(parsedSource.data, variantId ? { variantId } : undefined);
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
  ipcMain.handle(IPC_CHANNELS.AGENT.ANSWER_QUESTION, (_event, sessionId: unknown, response: unknown) => {
    if (typeof sessionId !== 'string') {
      return false;
    }

    const parsedResponse = agentQuestionResponseSchema.safeParse(response);
    if (!parsedResponse.success) {
      return false;
    }

    return agentHookService.answerPendingQuestion(sessionId, parsedResponse.data);
  });
  ipcMain.handle(IPC_CHANNELS.AGENT.DISMISS_REMINDER, (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      return false;
    }

    return agentHookService.dismissReminder(sessionId);
  });
  ipcMain.handle(IPC_CHANNELS.AGENT.HANDOFF_APPROVAL, (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      return false;
    }

    return agentHookService.handoffPendingApproval(sessionId);
  });
}
