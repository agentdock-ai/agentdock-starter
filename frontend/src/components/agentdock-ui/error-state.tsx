import { errorDetail } from "./utils";
export function ErrorState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div
      role="alert"
      className="min-w-0 border-l-2 border-destructive pl-3 text-[13px] leading-5"
    >
      <p className="text-destructive">{title}</p>
      {detail !== title && (
        <p className="mt-1 text-muted-foreground [overflow-wrap:anywhere]">
          {errorDetail(detail)}
        </p>
      )}
    </div>
  );
}
