import { Check, ShieldCheck } from "lucide-react";
import { ChatIcon } from "./icon";
import type { JsonValue, RenderApproval } from "@agentdock-ai/ui-core";
import { ErrorState } from "./error-state";
import { Button } from "./ui/button";
export function ApprovalCard({
  approval,
  enabled,
  pending,
  error,
  onRespond,
}: {
  approval: RenderApproval;
  enabled: boolean;
  pending: boolean;
  error?: string;
  onRespond: (decisions: readonly JsonValue[]) => void;
}) {
  const resolved = approval.state === "resolved";
  return (
    <section
      aria-label={approval.title}
      className="min-w-0 rounded-lg border border-border bg-card/30 p-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-lg bg-muted">
          {resolved ? (
            <ChatIcon icon={Check} size={14} aria-hidden="true" />
          ) : (
            <ChatIcon icon={ShieldCheck} size={14} aria-hidden="true" />
          )}
        </span>
        <h3 className="text-[13px] font-medium">
          {resolved ? "Response received" : approval.title}
        </h3>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground [overflow-wrap:anywhere]">
        {approval.detail}
      </p>
      {error && (
        <div className="mt-3">
          <ErrorState title="Response not confirmed" detail={error} />
        </div>
      )}
      {!resolved && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {approval.actions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                disabled={!enabled || pending}
                onClick={() => onRespond([action.input])}
              >
                {action.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {pending
              ? "Sending your response…"
              : !enabled
                ? "This app can’t respond to this request here."
                : approval.actions.length === 0
                  ? "Continue this request in the app."
                  : "The agent is paused until you respond."}
          </p>
        </>
      )}
    </section>
  );
}
