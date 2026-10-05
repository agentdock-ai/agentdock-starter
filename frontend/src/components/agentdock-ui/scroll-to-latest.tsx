import { ArrowDown } from "lucide-react";
import { ChatIcon } from "./icon";
import { Button } from "./ui/button";
export function ScrollToLatest({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 size-8 min-h-8 rounded-lg px-0"
      aria-label="Scroll to latest message"
    >
      <ChatIcon icon={ArrowDown} aria-hidden="true" size={16} />
      <span className="sr-only">Latest</span>
    </Button>
  );
}
