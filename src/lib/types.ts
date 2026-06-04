// opencode API types (subset we use). See PLAN.md §4 for the full contract.

export interface Project {
  id: string;
  worktree: string;
  vcs?: string;
  time?: { created?: number; updated?: number };
}

export interface Session {
  id: string;
  title?: string;
  directory?: string;
  parentID?: string;
  projectID?: string;
  time?: { created?: number; updated?: number };
}

export interface ModelRef { providerID: string; modelID: string; }

export interface UserMessage {
  id: string; sessionID: string; role: "user";
  time: { created: number }; agent?: string; model?: ModelRef;
}
export interface AssistantMessage {
  id: string; sessionID: string; role: "assistant";
  time: { created: number; completed?: number };
  providerID?: string; modelID?: string; agent?: string;
  error?: { name: string; data?: { message?: string } };
  tokens?: any; cost?: number;
}
export type Message = UserMessage | AssistantMessage;

export type ToolStatus = "pending" | "running" | "completed" | "error";
export interface ToolState {
  status: ToolStatus;
  input?: Record<string, any>;
  output?: string;
  error?: string;
  title?: string;
  metadata?: any;
}
export interface BasePart { id: string; sessionID: string; messageID: string; type: string; }
export interface TextPart extends BasePart { type: "text"; text: string; synthetic?: boolean; ignored?: boolean; }
export interface ReasoningPart extends BasePart { type: "reasoning"; text: string; }
export interface ToolPart extends BasePart { type: "tool"; tool: string; callID?: string; state: ToolState; }
export interface FilePart extends BasePart { type: "file"; filename?: string; url?: string; mime?: string; }
export interface PatchPart extends BasePart { type: "patch"; hash?: string; files?: string[]; }
export interface AgentPart extends BasePart { type: "agent"; name?: string; }
export interface SubtaskPart extends BasePart { type: "subtask"; prompt?: string; description?: string; agent?: string; }
export type Part = TextPart | ReasoningPart | ToolPart | FilePart | PatchPart | AgentPart | SubtaskPart | BasePart;

export interface MessageWithParts { info: Message; parts: Part[]; }

export interface PermissionRequest {
  id: string; sessionID: string; permission: string;
  patterns?: string[]; always?: string[]; tool?: { messageID: string; callID: string };
}

export interface ProvidersResponse {
  all: Record<string, { id?: string; name?: string; models?: Record<string, { name?: string }> }>;
  default: Record<string, string>;
  connected: Record<string, any> | Array<{ id: string }>;
}
export interface Agent { name: string; mode?: string; }

export interface ProviderConfig {
  id: string;
  name?: string;
  models: Record<string, { name?: string; variants?: Record<string, { reasoningEffort?: string }> }>;
}
export interface ConfigProvidersResponse { providers: ProviderConfig[]; }

export interface Command {
  name: string;
  description?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  absolute: string;
  type: "directory" | "file";
  ignored?: boolean;
}
export interface PathResponse { home: string; }

export interface QuestionOption { label: string; description?: string; }
export interface QuestionInfo {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}
export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
}

// SSE event envelope
export interface OcEvent { type: string; properties: any; }
