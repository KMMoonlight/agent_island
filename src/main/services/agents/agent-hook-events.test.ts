import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAgentHookPayload } from './agent-hook-events';

describe('parseAgentHookPayload', () => {
  it('maps Codex stop hooks to a completed reminder', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'Stop',
      session_id: 'session-1',
      terminal_app: 'Ghostty',
      terminal_title: 'codex agent_island',
      last_assistant_message: 'Done shipping the feature.',
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.id).toBe('codex:session-1');
    expect(result?.session.phase).toBe('completed');
    expect(result?.reminder?.title).toBe('Codex 已完成');
    expect(result?.reminder?.tone).toBe('success');
  });

  it('preserves terminal jump metadata for Codex sessions', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'SessionStart',
      session_id: 'session-1',
      terminal_app: 'Ghostty',
      terminal_session_id: 'terminal-42',
      terminal_tty: '/dev/ttys009',
      terminal_title: 'codex agent_island',
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.jumpTarget).toEqual({
      terminalApp: 'Ghostty',
      workingDirectory: '/Users/sai/Documents/agent_island',
      terminalSessionId: 'terminal-42',
      terminalTty: '/dev/ttys009',
      terminalTitle: 'codex agent_island',
    });
    expect(result?.session.terminalLabel).toBe('Ghostty · codex agent_island');
  });

  it('marks Codex.app sessions with a deep-linkable thread id', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'SessionStart',
      session_id: 'thread-123',
      terminal_app: 'Codex.app',
      terminal_title: 'Codex thread',
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.jumpTarget?.terminalApp).toBe('Codex.app');
    expect(result?.session.jumpTarget?.codexThreadId).toBe('thread-123');
  });

  it('keeps tmux and cmux jump metadata when present on shell-based hooks', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'SessionStart',
      session_id: 'session-1',
      terminal_app: 'Ghostty',
      terminal_tty: '/dev/ttys009',
      cmux_socket_path: '/tmp/cmux.sock',
      tmux_target: 'work:1.2',
      tmux_socket_path: '/tmp/tmux-1000/default',
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.jumpTarget?.cmuxSocketPath).toBe('/tmp/cmux.sock');
    expect(result?.session.jumpTarget?.tmuxTarget).toBe('work:1.2');
    expect(result?.session.jumpTarget?.tmuxSocketPath).toBe('/tmp/tmux-1000/default');
  });

  it('maps Codex permission requests to attention reminders', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PermissionRequest',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: {
        command: 'npm install',
        description: 'Install project dependencies',
      },
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.phase).toBe('needs-approval');
    expect(result?.session.summary).toBe('Codex wants to run a shell command.');
    expect(result?.session.detail).toBe('npm install');
    expect(result?.session.approvalRequest).toEqual({
      kind: 'command',
      title: 'Run Bash command',
      summary: 'Codex wants to run a shell command.',
      command: 'npm install',
      rememberKey: 'npm install',
      affectedPath: 'npm install',
      toolName: undefined,
      options: [
        { id: 'deny', label: '拒绝' },
        { id: 'allow-once', label: '同意' },
      ],
    });
    expect(result?.reminder?.tone).toBe('attention');
    expect(result?.reminder?.title).toBe('Run Bash command');
    expect(result?.reminder?.summary).toBe('Codex wants to run a shell command.');
    expect(result?.reminder?.detail).toBe('npm install');
    expect(result?.reminder?.expiresAtMs).toBeNull();
  });

  it('maps Codex PreToolUse command hooks to attention reminders', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_name: 'exec_command',
      tool_input: {
        command: 'curl -I https://example.com',
        description: 'Do you want to allow a brief outbound network request so we can test network access permission?',
      },
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.phase).toBe('needs-approval');
    expect(result?.session.summary).toBe('Codex wants to run a shell command.');
    expect(result?.session.detail).toBe('curl -I https://example.com');
    expect(result?.session.approvalRequest).toEqual({
      kind: 'command',
      title: 'Run Bash command',
      summary: 'Codex wants to run a shell command.',
      command: 'curl -I https://example.com',
      rememberKey: 'curl -I https://example.com',
      affectedPath: 'curl -I https://example.com',
      toolName: undefined,
      options: [
        { id: 'deny', label: '拒绝' },
        { id: 'allow-once', label: '同意' },
      ],
    });
    expect(result?.reminder?.tone).toBe('attention');
    expect(result?.reminder?.title).toBe('Run Bash command');
    expect(result?.reminder?.summary).toBe('Codex wants to run a shell command.');
  });

  it('maps Codex PreToolUse command hooks without descriptions to generic approval reminders', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: {
        command: 'pnpm install',
      },
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.phase).toBe('needs-approval');
    expect(result?.session.summary).toBe('Codex wants to run a shell command.');
    expect(result?.session.detail).toBe('pnpm install');
    expect(result?.session.approvalRequest?.command).toBe('pnpm install');
    expect(result?.reminder?.title).toBe('Run Bash command');
    expect(result?.reminder?.summary).toBe('Codex wants to run a shell command.');
  });

  it('maps Codex PreToolUse hooks without command details to generic approval reminders', () => {
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_name: 'Read',
      tool_input: {},
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.phase).toBe('needs-approval');
    expect(result?.session.summary).toBe('Codex wants to run a shell command.');
    expect(result?.session.detail).toBe('Read');
    expect(result?.session.approvalRequest?.command).toBe('Read');
    expect(result?.reminder?.title).toBe('Run Bash command');
    expect(result?.reminder?.summary).toBe('Codex wants to run a shell command.');
  });

  it('keeps the full multiline command for Codex PreToolUse session details', () => {
    const command = 'pnpm exec tsx scripts/run.ts --flag foo \\\n+  --another bar';
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: {
        command,
      },
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.detail).toContain('--another bar');
    expect(result?.session.phase).toBe('needs-approval');
    expect(result?.session.approvalRequest?.command).toContain('--another bar');
    expect(result?.reminder?.title).toBe('Run Bash command');
  });

  it('keeps full multiline Codex stop reminder text for expanded display', () => {
    const longLine = '第二段里有更长的说明，不应该在 140 个字符处被提前截断，而应该完整传给 expanded 提醒区域继续展示。'.repeat(3);
    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'Stop',
      session_id: 'session-1',
      last_assistant_message: `第一段内容会保留。\n\n${longLine}`,
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.summary.endsWith('…')).toBe(true);
    expect(result?.reminder?.summary).toContain('第二段里有更长的说明');
    expect(result?.reminder?.summary.includes('\n')).toBe(true);
    expect(result?.reminder?.summary.endsWith('…')).toBe(false);
  });

  it('prefers the full assistant message from transcript_path when Stop payload is shortened', () => {
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'agent-hook-events-'));
    const transcriptPath = path.join(tempDirectory, 'transcript.jsonl');
    const fullMessage = '这是 transcript 里的完整回复。\n\n第二段也应该完整显示，而不是只显示 payload 里的短摘要。';

    writeFileSync(
      transcriptPath,
      `${JSON.stringify({
        timestamp: '2026-04-22T14:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: fullMessage }],
        },
      })}\n`,
      'utf8'
    );

    const result = parseAgentHookPayload('codex', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'Stop',
      session_id: 'session-1',
      transcript_path: transcriptPath,
      last_assistant_message: '短摘要…',
    }, 1_717_171_717_000);

    rmSync(tempDirectory, { recursive: true, force: true });

    expect(result).not.toBeNull();
    expect(result?.session.summary).toBe('短摘要…');
    expect(result?.reminder?.summary).toBe(fullMessage);
  });

  it('maps Claude question-like permission requests to structured question reminders', () => {
    const result = parseAgentHookPayload('claude', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'PermissionRequest',
      session_id: 'session-2',
      tool_name: 'request_user_input',
      tool_input: {
        title: 'Choose environment',
        questions: [
          {
            header: 'Env',
            question: 'Deploy to production or staging?',
          },
        ],
      },
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.phase).toBe('needs-answer');
    expect(result?.session.questionPrompt?.title).toBe('Choose environment');
    expect(result?.session.questionPrompt?.questions[0]?.question).toBe('Deploy to production or staging?');
    expect(result?.reminder?.tone).toBe('attention');
    expect(result?.reminder?.title).toBe('Choose environment');
    expect(result?.reminder?.summary).toContain('Deploy to production or staging?');
  });

  it('parses Claude-compatible forks with their own tool label', () => {
    const result = parseAgentHookPayload('qoder', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'SessionStart',
      session_id: 'session-qoder',
      terminal_app: 'Terminal',
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.tool).toBe('qoder');
    expect(result?.session.title).toBe('Qoder · agent_island');
    expect(result?.session.summary).toBe('已开始新的 Qoder 会话');
  });

  it('maps Cursor blocking hooks to non-blocking activity updates', () => {
    const result = parseAgentHookPayload('cursor', {
      hook_event_name: 'beforeShellExecution',
      conversation_id: 'cursor-1',
      generation_id: 'gen-1',
      workspace_roots: ['/Users/sai/Documents/agent_island'],
      command: 'pnpm lint',
      prompt: 'Run the checks',
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.tool).toBe('cursor');
    expect(result?.session.phase).toBe('running');
    expect(result?.session.jumpTarget).toEqual({
      terminalApp: 'Cursor',
      workingDirectory: '/Users/sai/Documents/agent_island',
    });
    expect(result?.session.summary).toBe('Running: pnpm lint');
    expect(result?.session.approvalRequest).toBeUndefined();
    expect(result?.reminder).toBeNull();
  });

  it('keeps Gemini notifications as non-blocking activity updates', () => {
    const result = parseAgentHookPayload('gemini', {
      cwd: '/Users/sai/Documents/agent_island',
      hook_event_name: 'Notification',
      session_id: 'gemini-1',
      terminal_app: 'iTerm',
      message: 'Gemini needs your attention soon.',
      details: {
        reason: 'quota',
        retry_in: 120,
      },
    }, 1_717_171_717_000);

    expect(result).not.toBeNull();
    expect(result?.session.tool).toBe('gemini');
    expect(result?.session.summary).toBe('Gemini needs your attention soon.');
    expect(result?.session.detail).toContain('reason');
    expect(result?.reminder).toBeNull();
  });

  it('ignores unsupported sources', () => {
    const result = parseAgentHookPayload('unknown-agent', {
      hook_event_name: 'Stop',
    });

    expect(result).toBeNull();
  });
});
