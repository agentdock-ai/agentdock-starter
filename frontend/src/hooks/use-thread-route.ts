import { useCallback, useEffect, useState } from "react";

export type ThreadRoute =
  | { type: "home" }
  | { type: "thread"; threadId: string }
  | { type: "not-found" };

interface NavigateOptions {
  replace?: boolean;
}

const threadPathPattern =
  /^\/thread\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

function readRoute(): ThreadRoute {
  if (typeof window === "undefined" || window.location.pathname === "/")
    return { type: "home" };

  const match = threadPathPattern.exec(window.location.pathname);
  if (!match) return { type: "not-found" };

  return { type: "thread", threadId: match[1]!.toLowerCase() };
}

export function useThreadRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const updateRoute = () => setRoute(readRoute());
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);

  const navigateToThread = useCallback(
    (threadId: string, { replace = false }: NavigateOptions = {}) => {
      const pathname = `/thread/${encodeURIComponent(threadId)}`;
      const method = replace ? "replaceState" : "pushState";
      window.history[method](null, "", pathname);
      setRoute({ type: "thread", threadId });
    },
    [],
  );

  return { route, navigateToThread };
}
