import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAppPaths = {
  userData: os.tmpdir(),
};

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') {
        return mockAppPaths.userData;
      }

      return os.tmpdir();
    }),
  },
}));

import { SourceStore } from '../state/source-store';
import { parseAgentHookPayload } from './agent-hook-events';
import { AgentHookService, readLatestCodexTranscriptCompletion } from './agent-hook-service';

type AgentHookEventUpdateResult = NonNullable<ReturnType<typeof parseAgentHookPayload>>;
type AgentHookServiceHarness = {
  applyEventUpdate: (eventUpdate: AgentHookEventUpdateResult) => void;
  checkCodexTranscriptFallback: (sessionId: string) => void;
};

describe('AgentHookService Codex transcript fallback', () => {
  let tempDirectory: string;

  beforeEach(() => {
    tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'agent-hook-service-'));
    mockAppPaths.userData = tempDirectory;
  });

  afterEach(() => {
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('reads the latest completed Codex turn from transcript output when Stop is missing', () => {
    const transcriptPath = path.join(tempDirectory, 'codex-transcript.jsonl');

    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: '2026-04-23T07:59:20.000Z',
          type: 'event_msg',
          payload: {
            type: 'task_started',
            turn_id: 'turn-1',
            started_at: 1_776_931_100,
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-23T07:59:51.569Z',
          type: 'event_msg',
          payload: {
            type: 'agent_message',
            message: '修复完成。\n\n已跑 lint。',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-23T07:59:51.699Z',
          type: 'event_msg',
          payload: {
            type: 'task_complete',
            turn_id: 'turn-1',
            last_agent_message: null,
            completed_at: 1_776_931_191,
          },
        }),
      ].join('\n'),
      'utf8'
    );

    const completion = readLatestCodexTranscriptCompletion(transcriptPath);

    expect(completion).toEqual({
      turnId: 'turn-1',
      completedAtMs: 1_776_931_191_000,
      title: 'Codex 已完成',
      tone: 'success',
      summary: '修复完成。 已跑 lint。',
      detail: '修复完成。\n\n已跑 lint。',
    });
  });

  it('synthesizes a Codex completion reminder from transcript fallback when Stop never arrives', () => {
    const transcriptPath = path.join(tempDirectory, 'codex-transcript.jsonl');

    writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: '2026-04-23T07:59:20.000Z',
          type: 'event_msg',
          payload: {
            type: 'task_started',
            turn_id: 'turn-1',
            started_at: 1_776_931_100,
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-23T07:59:51.569Z',
          type: 'event_msg',
          payload: {
            type: 'agent_message',
            message: '修复完成。\n\n已跑 lint。',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-23T07:59:51.699Z',
          type: 'event_msg',
          payload: {
            type: 'task_complete',
            turn_id: 'turn-1',
            last_agent_message: null,
            completed_at: 1_776_931_191,
          },
        }),
      ].join('\n'),
      'utf8'
    );

    const sourceStore = new SourceStore();
    const service = new AgentHookService(sourceStore);
    const eventUpdate = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'UserPromptSubmit',
      session_id: 'session-1',
      transcript_path: transcriptPath,
      terminal_app: 'iTerm',
      prompt: '继续',
    }, 1_776_931_170_000);

    expect(eventUpdate).not.toBeNull();

    const harness = service as unknown as AgentHookServiceHarness;

    harness.applyEventUpdate(eventUpdate as AgentHookEventUpdateResult);
    harness.checkCodexTranscriptFallback('codex:session-1');

    const state = sourceStore.getState();

    expect(state.agent.sessions[0]?.id).toBe('codex:session-1');
    expect(state.agent.sessions[0]?.phase).toBe('completed');
    expect(state.agent.sessions[0]?.lastEventName).toBe('StopFallback');
    expect(state.agent.activeReminder?.title).toBe('Codex 已完成');
    expect(state.agent.activeReminder?.summary).toBe('修复完成。\n\n已跑 lint。');

    service.stop();
  });

  it('keeps Codex approval state sticky when a later running event arrives', () => {
    const sourceStore = new SourceStore();
    const service = new AgentHookService(sourceStore);
    const harness = service as unknown as AgentHookServiceHarness;

    const approvalUpdate = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_name: 'exec_command',
      tool_input: {
        command: 'curl -I https://example.com',
        description: 'Allow outbound network access',
      },
    }, 1_776_931_170_000);
    const runningUpdate = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PostToolUse',
      session_id: 'session-1',
      tool_name: 'exec_command',
      tool_input: {
        command: 'curl -I https://example.com',
      },
    }, 1_776_931_171_000);

    expect(approvalUpdate).not.toBeNull();
    expect(runningUpdate).not.toBeNull();

    harness.applyEventUpdate(approvalUpdate as AgentHookEventUpdateResult);
    harness.applyEventUpdate(runningUpdate as AgentHookEventUpdateResult);

    const state = sourceStore.getState();

    expect(state.agent.sessions[0]?.phase).toBe('needs-approval');
    expect(state.agent.sessions[0]?.summary).toBe('Codex wants to run a shell command.');
    expect(state.agent.sessions[0]?.approvalRequest?.command).toBe('curl -I https://example.com');
    expect(state.agent.activeReminder?.title).toBe('Run Bash command');
    expect(state.agent.activeReminder?.expiresAtMs).toBeNull();

    service.stop();
  });

  it('replaces the approval reminder when the Codex session completes', () => {
    const sourceStore = new SourceStore();
    const service = new AgentHookService(sourceStore);
    const harness = service as unknown as AgentHookServiceHarness;

    const approvalUpdate = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_name: 'exec_command',
      tool_input: {
        command: 'curl -I https://example.com',
        description: 'Allow outbound network access',
      },
    }, 1_776_931_170_000);
    const completionUpdate = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'Stop',
      session_id: 'session-1',
      last_assistant_message: '请求已完成',
    }, 1_776_931_172_000);

    expect(approvalUpdate).not.toBeNull();
    expect(completionUpdate).not.toBeNull();

    harness.applyEventUpdate(approvalUpdate as AgentHookEventUpdateResult);
    harness.applyEventUpdate(completionUpdate as AgentHookEventUpdateResult);

    const state = sourceStore.getState();
    expect(state.agent.sessions[0]?.phase).toBe('completed');
    expect(state.agent.activeReminder?.title).toBe('Codex 已完成');
    expect(state.agent.activeReminder?.summary).toBe('请求已完成');

    service.stop();
  });
});
