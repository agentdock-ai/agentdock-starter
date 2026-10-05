"use client";
import { useState } from "react";
import {
  AgentProvider,
  useAgentActions,
  useAgentState,
} from "@agentdock-ai/react";
import type { ChatProps } from "./types";
import { ChatShell } from "./chat-shell";
import { ChatViewport } from "./chat-viewport";
import { MessageList } from "./message-list";
import { EmptyState, Suggestions } from "./empty-state";
import { Composer } from "./composer";
import { ErrorState } from "./error-state";
import { Button } from "./ui/button";
import { useChatAttachments } from "./use-chat-attachments";

export function Chat(props: ChatProps) {
  return (
    <AgentProvider store={props.store}>
      <ChatSurface {...props} />
    </AgentProvider>
  );
}
function ChatSurface({
  adapter,
  className,
  disabled,
  showReasoning = true,
  suggestions,
  welcomeTitle,
  welcomeDescription,
  placeholder,
}: ChatProps) {
  const { renderModel: model, agent, streamStatus } = useAgentState();
  const actions = useAgentActions(adapter);
  const [draft, setDraft] = useState("");
  const attachments = useChatAttachments(adapter.attachments);
  const active =
    actions.busy ||
    (streamStatus === "consuming" &&
      !["completed", "failed", "cancelled"].includes(agent.status));
  const waiting = agent.status === "waiting" && streamStatus !== "stopped";
  const paused = waiting && agent.interrupts.length === 0;
  const items = model.turns.at(-1)?.items ?? [];
  const activity = items.some(
    (item) =>
      (item.type === "tool-call" && item.active) ||
      (item.type === "tool-timeline" &&
        item.tools.some((tool) => tool.active)) ||
      (item.type === "approval" && item.approval.state === "pending") ||
      (item.type === "message" &&
        item.role === "assistant" &&
        showReasoning &&
        item.blocks.some(
          (b) => b.type === "reasoning" && b.state === "streaming",
        )),
  );
  const empty = model.turns.length === 0;
  const latestUser = model.turns
    .flatMap((turn) => turn.items)
    .filter((item) => item.type === "message" && item.role === "user")
    .at(-1);
  const latestUserId =
    latestUser?.type === "message" ? latestUser.messageId : undefined;
  async function submit(text: string) {
    if (
      disabled ||
      active ||
      waiting ||
      attachments.blocked ||
      (!text.trim() && attachments.items.length === 0)
    )
      return;
    const sent = attachments.take();
    setDraft("");
    const successful = await actions.sendMessage(
      text,
      sent.flatMap((item) => (item.attachment ? [item.attachment] : [])),
    );
    if (!successful) {
      setDraft((current) => current || text);
      attachments.restore(sent);
    }
  }
  const status = actions.cancelling
    ? "Stopping…"
    : actions.respondingTo
      ? "Sending response…"
      : paused
        ? "Run paused"
        : waiting
          ? "Waiting for your response"
          : active
            ? "Agent is working"
            : streamStatus === "error"
              ? "Connection interrupted"
              : streamStatus === "stopped"
                ? "Stream stopped"
                : agent.status === "completed"
                  ? "Response complete"
                  : agent.status === "failed"
                    ? "Run failed"
                    : agent.status === "cancelled"
                      ? "Run stopped"
                      : "";
  return (
    <ChatShell
      className={className}
      empty={empty}
      footer={
        <>
          {empty && (
            <EmptyState title={welcomeTitle} description={welcomeDescription} />
          )}
          <Composer
            key="composer"
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              void submit(draft);
            }}
            onStop={
              actions.canCancel && agent.runId
                ? () => {
                    void actions.cancelRun();
                  }
                : undefined
            }
            busy={active}
            waiting={waiting}
            cancelling={actions.cancelling}
            disabled={disabled}
            placeholder={placeholder}
            attachments={attachments.items}
            attachmentAccept={adapter.attachments?.accept}
            attachmentError={attachments.error}
            attachmentBlocked={attachments.blocked}
            onFiles={adapter.attachments ? attachments.add : undefined}
            onRemoveAttachment={attachments.remove}
            onRetryAttachment={attachments.retry}
          />
          {empty && suggestions && (
            <Suggestions
              suggestions={suggestions}
              disabled={disabled || active}
              onSubmit={(text) => {
                void submit(text);
              }}
            />
          )}
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {status}
          </span>
        </>
      }
    >
      <ChatViewport revision={model} latestUserId={latestUserId} empty={empty}>
        {!empty && (
          <MessageList
            model={model}
            thinking={active && !waiting && !activity}
            showReasoning={showReasoning}
            canRespond={
              actions.canRespond &&
              !active &&
              !disabled &&
              streamStatus !== "stopped"
            }
            respondingTo={actions.respondingTo}
            approvalError={
              actions.actionError?.scope === "approval"
                ? actions.actionError.message
                : undefined
            }
            onRespond={(id, decisions) => {
              void actions.respondToInterrupt(id, decisions);
            }}
          />
        )}
        {paused && (
          <div
            role="status"
            className="mx-auto w-full max-w-[44rem] px-4 py-3 text-[13px] text-muted-foreground"
          >
            <p>
              {actions.canContinue
                ? "The run is paused. Continue when you’re ready."
                : "The run is paused. Continue it in your app."}
            </p>
            {actions.canContinue && (
              <Button
                className="mt-2"
                disabled={active || disabled}
                onClick={() => {
                  void actions.continueRun();
                }}
              >
                {active ? "Continuing…" : "Continue run"}
              </Button>
            )}
          </div>
        )}
        {model.transportError &&
          actions.actionError?.scope !== "approval" &&
          actions.actionError?.scope !== "continue" && (
            <ErrorState {...model.transportError} />
          )}
        {actions.actionError?.scope === "cancel" && (
          <ErrorState
            title="Unable to stop"
            detail={actions.actionError.message}
          />
        )}
        {actions.actionError?.scope === "continue" && (
          <ErrorState
            title="Unable to continue"
            detail={actions.actionError.message}
          />
        )}
      </ChatViewport>
    </ChatShell>
  );
}
