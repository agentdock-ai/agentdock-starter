import type { ChatAdapter, AgentStore } from "@agentdock-ai/react";
export interface ChatProps {
  adapter: ChatAdapter;
  store?: AgentStore;
  className?: string;
  disabled?: boolean;
  showReasoning?: boolean;
  welcomeTitle?: string;
  welcomeDescription?: string;
  suggestions?: readonly string[];
  placeholder?: string;
  /** Reports whether this chat currently has an active agent run. */
  onActivityChange?: (active: boolean) => void;
}
