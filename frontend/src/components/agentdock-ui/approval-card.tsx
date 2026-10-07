import { useMemo, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cloneJsonValue } from "@agentdock-ai/contracts";
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
  const initialEdits = useMemo(
    () => Object.fromEntries(approval.actions.map((action) => [action.id, JSON.stringify(action.input, null, 2)])),
    [approval.actions],
  );
  const [edits, setEdits] = useState(initialEdits);
  const [editError, setEditError] = useState<string | null>(null);

  function submitEdits() {
    try {
      const decisions = approval.actions.map((action) => {
        const args = cloneJsonValue(JSON.parse(edits[action.id] ?? ""));
        if (typeof args !== "object" || args === null || Array.isArray(args))
          throw new Error("Edited arguments must be a JSON object.");
        return { type: "edit", editedAction: { name: action.label, args } };
      });
      setEditError(null);
      onRespond(decisions);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Enter valid JSON arguments.");
    }
  }
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
      {!resolved && approval.kind === "tool-approval" && (
        <>
          <div className="mt-3 space-y-3">
            {approval.actions.map((action) => (
              <label key={action.id} className="block space-y-1 text-xs text-muted-foreground">
                <span>{action.label} arguments</span>
                <textarea
                  aria-label={`${action.label} arguments`}
                  className="min-h-24 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                  value={edits[action.id] ?? "{}"}
                  disabled={!enabled || pending}
                  onChange={(event) => setEdits((current) => ({ ...current, [action.id]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          {editError && <p role="alert" className="mt-2 text-xs text-destructive">{editError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={!enabled || pending || approval.actions.length === 0} onClick={() => onRespond(approval.actions.map(() => ({ type: "approve" })))}>
              Approve all
            </Button>
            <Button variant="outline" disabled={!enabled || pending || approval.actions.length === 0} onClick={() => onRespond(approval.actions.map(() => ({ type: "reject" })))}>
              Reject all
            </Button>
            <Button variant="outline" disabled={!enabled || pending || approval.actions.length === 0} onClick={submitEdits}>
              Submit edits
            </Button>
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
      {!resolved && approval.kind === "custom" && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          This app has no response control for this native interrupt.
        </p>
      )}
    </section>
  );
}
