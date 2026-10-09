import { ArrowDown } from "lucide-react";
import { ChatIcon } from "./icon";
import { Button } from "./ui/button";
export function ScrollToLatest({
  onClick,
  visible = true,
}: {
  onClick: () => void;
  visible?: boolean;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`absolute bottom-3 left-1/2 z-10 size-8 min-h-8 -translate-x-1/2 rounded-full px-0 transition-[opacity,transform,background-color,box-shadow] duration-200 ease-out hover:scale-[1.03] active:scale-[0.97] motion-reduce:transition-none ${visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"}`}
      aria-label="Scroll to latest message"
    >
      <ChatIcon icon={ArrowDown} aria-hidden="true" size={16} />
      <span className="sr-only">Latest</span>
    </Button>
  );
}
