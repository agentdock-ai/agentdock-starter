import type { JsonValue, RenderModel } from "@agentdock-ai/ui-core";
import { Message } from "./message";
import { ToolTimeline } from "./tool-timeline";
import { ApprovalCard } from "./approval-card";
import { ThinkingIndicator } from "./thinking-indicator";
import { ErrorState } from "./error-state";
export function MessageList({
  model,
  thinking = false,
  showReasoning,
  canRespond,
  respondingTo,
  approvalError,
  onRespond,
}: {
  model: RenderModel;
  thinking?: boolean;
  showReasoning: boolean;
  canRespond: boolean;
  respondingTo: string | null;
  approvalError?: string;
  onRespond: (interruptId: string, decisions: readonly JsonValue[]) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-7">
      {model.turns.map((turn) => (
        <div
          key={
            turn.items.find(
              (item) => item.type === "message" && item.role === "user",
            )?.id ?? turn.id
          }
          className="flex min-w-0 flex-col gap-4"
          data-turn={turn.id}
        >
          {turn.items.map((item) => {
            switch (item.type) {
              case "message":
                return (
                  <Message
                    key={item.id}
                    message={item}
                    showReasoning={showReasoning}
                    showActions={
                      turn.items
                        .filter(
                          (i) => i.type === "message" && i.role === "assistant",
                        )
                        .at(-1)?.id === item.id
                    }
                  />
                );
              case "tool-call":
                return <ToolTimeline key={item.id} tools={[item]} />;
              case "tool-timeline":
                return <ToolTimeline key={item.id} tools={item.tools} />;
              case "approval":
                return (
                  <ApprovalCard
                    key={item.id}
                    approval={item.approval}
                    enabled={canRespond && turn.state === "waiting"}
                    error={approvalError}
                    pending={respondingTo === item.approval.interruptId}
                    onRespond={(decisions) =>
                      onRespond(item.approval.interruptId, decisions)
                    }
                  />
                );
              case "error":
                return <ErrorState key={item.id} {...item.error} />;
            }
          })}
          {thinking && turn === model.turns.at(-1) && (
            <ThinkingIndicator
              label={
                turn.items.some(
                  (item) =>
                    item.type === "message" &&
                    item.role === "assistant" &&
                    item.blocks.some(
                      (block) => block.type === "text" && block.text.trim(),
                    ),
                )
                  ? "working"
                  : "thinking"
              }
            />
          )}
          {(turn.state === "stopped" || turn.transportState === "stopped") && (
            <p className="text-xs text-muted-foreground">
              Stopped · Your partial answer is preserved.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
