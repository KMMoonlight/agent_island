import { z } from 'zod';

export const agentToolSchema = z.enum([
  'codex',
  'claude',
  'qoder',
  'qwen',
  'factory',
  'codebuddy',
  'cursor',
  'gemini',
  'kimi',
]);

export const agentSessionPhaseSchema = z.enum(['running', 'needs-approval', 'needs-answer', 'completed']);

export const agentReminderToneSchema = z.enum(['info', 'attention', 'success']);

export const agentApprovalDecisionSchema = z.enum(['deny', 'allow-once', 'allow-always']);

export const agentApprovalOptionSchema = z.object({
  id: agentApprovalDecisionSchema,
  label: z.string(),
});

export const agentApprovalRequestSchema = z.object({
  kind: z.literal('command'),
  command: z.string(),
  rememberKey: z.string(),
  options: z.array(agentApprovalOptionSchema),
});

export const agentJumpTargetSchema = z.object({
  terminalApp: z.string(),
  workingDirectory: z.string().optional(),
  terminalSessionId: z.string().optional(),
  terminalTty: z.string().optional(),
  terminalTitle: z.string().optional(),
  codexThreadId: z.string().optional(),
  cmuxSocketPath: z.string().optional(),
  tmuxTarget: z.string().optional(),
  tmuxSocketPath: z.string().optional(),
});

export const agentHookInstallStatusSchema = z.object({
  source: agentToolSchema,
  title: z.string(),
  configPaths: z.array(z.string()),
  isInstalled: z.boolean(),
  isPartiallyInstalled: z.boolean(),
  statusMessage: z.string(),
  errorMessage: z.string().nullable(),
});

export const agentHookSnippetSchema = z.object({
  id: z.string(),
  source: agentToolSchema,
  title: z.string(),
  configPath: z.string(),
  description: z.string(),
  value: z.string(),
});

export const agentSessionSchema = z.object({
  id: z.string(),
  tool: agentToolSchema,
  title: z.string(),
  workspaceName: z.string(),
  cwd: z.string(),
  phase: agentSessionPhaseSchema,
  summary: z.string(),
  prompt: z.string().optional(),
  detail: z.string().optional(),
  approvalRequest: agentApprovalRequestSchema.optional(),
  lastEventName: z.string(),
  terminalLabel: z.string().optional(),
  jumpTarget: agentJumpTargetSchema.optional(),
  updatedAtMs: z.number(),
});

export const agentReminderSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  tool: agentToolSchema,
  phase: agentSessionPhaseSchema,
  tone: agentReminderToneSchema,
  title: z.string(),
  summary: z.string(),
  detail: z.string().optional(),
  createdAtMs: z.number(),
  expiresAtMs: z.number().nullable(),
  shouldExpand: z.boolean(),
});

export const agentOverlayStateSchema = z.object({
  sessions: z.array(agentSessionSchema),
  activeReminder: agentReminderSchema.nullable(),
});

export const agentHookSetupSchema = z.object({
  isServerRunning: z.boolean(),
  statusMessage: z.string(),
  endpointBaseUrl: z.string().nullable(),
  bridgeScriptPath: z.string().nullable(),
  runtimeEnvPath: z.string().nullable(),
  codexCommand: z.string().nullable(),
  claudeCommand: z.string().nullable(),
  codexHooksJsonSnippet: z.string(),
  codexConfigTomlSnippet: z.string(),
  claudeSettingsJsonSnippet: z.string(),
  installStatuses: z.array(agentHookInstallStatusSchema),
  snippets: z.array(agentHookSnippetSchema),
});

export type AgentTool = z.infer<typeof agentToolSchema>;
export type AgentSessionPhase = z.infer<typeof agentSessionPhaseSchema>;
export type AgentReminderTone = z.infer<typeof agentReminderToneSchema>;
export type AgentApprovalDecision = z.infer<typeof agentApprovalDecisionSchema>;
export type AgentApprovalOption = z.infer<typeof agentApprovalOptionSchema>;
export type AgentApprovalRequest = z.infer<typeof agentApprovalRequestSchema>;
export type AgentJumpTarget = z.infer<typeof agentJumpTargetSchema>;
export type AgentHookInstallStatus = z.infer<typeof agentHookInstallStatusSchema>;
export type AgentHookSnippet = z.infer<typeof agentHookSnippetSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
export type AgentReminder = z.infer<typeof agentReminderSchema>;
export type AgentOverlayState = z.infer<typeof agentOverlayStateSchema>;
export type AgentHookSetup = z.infer<typeof agentHookSetupSchema>;

export const AGENT_TOOL_LABELS: Record<AgentTool, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  qoder: 'Qoder',
  qwen: 'Qwen Code',
  factory: 'Factory',
  codebuddy: 'CodeBuddy',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  kimi: 'Kimi CLI',
};
