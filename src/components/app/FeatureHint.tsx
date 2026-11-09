import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFeatureHints } from "@/hooks/use-feature-hints";

export function FeatureHint({ title, text }: { title: string; text?: string }) {
  const [enabled] = useFeatureHints();
  const [open, setOpen] = useState(false);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (!enabled || !text) return null;

  return <Popover open={open} onOpenChange={(nextOpen) => { cancelClose(); setOpen(nextOpen); }}>
    <PopoverTrigger asChild>
      <button
        type="button"
        data-feature-hint
        className="-m-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Подсказка: ${title}`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={scheduleClose}
      >
        <CircleHelp className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      id={id}
      data-feature-hint-content
      align="start"
      sideOffset={8}
      collisionPadding={12}
      className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-4 shadow-xl"
      onOpenAutoFocus={(event) => event.preventDefault()}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onFocusCapture={cancelClose}
      onBlurCapture={scheduleClose}
    >
      <h3 className="pr-4 text-sm font-semibold leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </PopoverContent>
  </Popover>;
}
