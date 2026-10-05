import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentStore, type AgentHistory } from "@agentdock-ai/react";
import {
  Chat,
  ChatWorkspace,
  ThreadSidebar,
  type ChatThread,
} from "@/components/agentdock-ui";
import { createChatAdapter } from "./chat-adapter";

type Thread = ChatThread & { createdAt?: string; updatedAt?: string };

export function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [store, setStore] = useState(() => new AgentStore());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pendingThread = useRef<AbortController | null>(null);

  const openThread = useCallback(async (selected: Thread) => {
    pendingThread.current?.abort();
    const controller = new AbortController();
    pendingThread.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/threads/${selected.id}/messages`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not load this thread.");
      const result = (await response.json()) as AgentHistory;
      const nextStore = new AgentStore();
      nextStore.hydrateHistory(result);
      if (controller.signal.aborted) return;
      setThread(selected);
      setStore(nextStore);
      sessionStorage.setItem("agentdock:selectedThreadId", selected.id);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error ? cause.message : "Could not load thread.",
      );
    } finally {
      if (pendingThread.current === controller) setLoading(false);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    const response = await fetch("/threads");
    if (!response.ok) throw new Error("Could not load your threads.");
    const result = (await response.json()) as { threads: Thread[] };
    return result.threads;
  }, []);

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        let available = await refreshThreads();
        if (available.length === 0) {
          const response = await fetch("/threads", { method: "POST" });
          if (!response.ok) throw new Error("Could not create a thread.");
          const result = (await response.json()) as { thread: Thread };
          available = [result.thread];
        }
        if (!current) return;
        setThreads(available);
        const selectedId = sessionStorage.getItem("agentdock:selectedThreadId");
        await openThread(
          available.find((item) => item.id === selectedId) ?? available[0],
        );
      } catch (cause) {
        if (current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not connect to the server.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      current = false;
      pendingThread.current?.abort();
    };
  }, [openThread, refreshThreads]);

  const createThread = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/threads", { method: "POST" });
      if (!response.ok) throw new Error("Could not create a thread.");
      const result = (await response.json()) as { thread: Thread };
      pendingThread.current?.abort();
      pendingThread.current = null;
      setLoading(false);
      setThreads((current) => [result.thread, ...current]);
      setThread(result.thread);
      setStore(new AgentStore());
      sessionStorage.setItem("agentdock:selectedThreadId", result.thread.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create thread.",
      );
    }
  }, []);

  const updateTitle = useCallback((id: string, title: string) => {
    setThreads((current) =>
      current.map((item) =>
        item.id === id && item.title === "New thread"
          ? { ...item, title }
          : item,
      ),
    );
    setThread((current) =>
      current?.id === id && current.title === "New thread"
        ? { ...current, title }
        : current,
    );
  }, []);

  const adapter = useMemo(
    () =>
      thread
        ? createChatAdapter(thread.id, (title) => updateTitle(thread.id, title))
        : null,
    [thread?.id, updateTitle],
  );

  return (
    <main className="h-dvh w-full p-2 sm:p-4">
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {thread && adapter ? (
        <ChatWorkspace
          className="h-full"
          title={thread.title}
          brand="AgentDock"
          sidebar={
            <ThreadSidebar
              threads={threads}
              selectedId={thread.id}
              onSelect={(id) => {
                const selected = threads.find((item) => item.id === id);
                if (selected && selected.id !== thread.id)
                  void openThread(selected);
              }}
              onNew={() => void createThread()}
            />
          }
        >
          {loading ? (
            <div
              role="status"
              className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
            >
              Loading thread…
            </div>
          ) : (
            <Chat
              key={thread.id}
              store={store}
              adapter={adapter}
              welcomeTitle="What should we build?"
              welcomeDescription="Create and edit files, run a sandbox check, or attach an image to discuss."
              suggestions={[
                "Build a clean portfolio website in HTML and CSS.",
                "Create a small .mjs script that prints a greeting, then run it.",
              ]}
            />
          )}
        </ChatWorkspace>
      ) : !loading ? (
        <div
          role="status"
          className="flex h-full items-center justify-center text-sm text-muted-foreground"
        >
          Connect to the Node server to start a thread.
        </div>
      ) : null}
    </main>
  );
}
