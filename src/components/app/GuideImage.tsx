import { useState } from "react";
import { useTheme } from "next-themes";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

type GuideImageProps = {
  image: string;
  alt: string;
  title: string;
};

export function GuideImage({ image, alt, title }: GuideImageProps) {
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const darkImage = image.replace(/(\.[^./]+)$/, "-dark$1");
  const currentImage = resolvedTheme === "dark" ? darkImage : image;

  const changeZoom = (next: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  };

  return <>
    <div className="md:sticky md:top-8">
      <button
        type="button"
        className="group block w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
        aria-label={`Увеличить изображение: ${alt}`}
        title="Открыть изображение в полном размере"
        onClick={() => { setZoom(MIN_ZOOM); setOpen(true); }}
      >
        <img
          key={currentImage}
          src={currentImage}
          alt={alt}
          className="guide-image pointer-events-none aspect-[16/10] w-full rounded-xl border bg-card object-cover object-left-top shadow-sm transition-transform duration-200 group-hover:scale-[1.01]"
        />
        <span className="mt-3 flex min-h-8 items-center justify-center gap-2 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
          Увеличить изображение
        </span>
      </button>
    </div>

    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setZoom(MIN_ZOOM);
    }}>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-3xl p-0 sm:max-w-[calc(100%-2rem)]"
        onKeyDown={(event) => {
          if (["+", "=", "-", "0"].includes(event.key)) event.preventDefault();
          if (event.key === "+" || event.key === "=") changeZoom(zoom + ZOOM_STEP);
          if (event.key === "-") changeZoom(zoom - ZOOM_STEP);
          if (event.key === "0") changeZoom(MIN_ZOOM);
        }}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-16 text-left sm:px-6 sm:pr-16">
          <DialogTitle className="editorial text-2xl">Просмотр иллюстрации</DialogTitle>
          <DialogDescription>{title}. Изображение соответствует выбранной теме приложения.</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-card px-4 py-3" aria-label="Масштаб изображения">
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Уменьшить" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - ZOOM_STEP)}><Minus className="h-4 w-4" /></Button>
          <span className="number min-w-16 text-center text-sm font-medium" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Приблизить" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + ZOOM_STEP)}><Plus className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" className="min-h-11 gap-2" disabled={zoom === MIN_ZOOM} onClick={() => changeZoom(MIN_ZOOM)}><RotateCcw className="h-4 w-4" />По размеру экрана</Button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-auto overscroll-contain bg-secondary/35 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-6"
          data-guide-image-viewport
          role="region"
          aria-label="Изображение с масштабированием и прокруткой"
          tabIndex={0}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
          }}
        >
          <div className="relative mx-auto" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
            <img
              key={currentImage}
              src={currentImage}
              alt={alt}
              className="guide-image-viewer absolute inset-0 block h-full w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
        <p className="shrink-0 border-t bg-card px-5 py-3 text-center text-xs leading-relaxed text-muted-foreground sm:px-6">
          100 % — весь снимок помещается на экран. Кнопки +/− или Ctrl/⌘ + колесо меняют масштаб; увеличенное изображение можно прокручивать.
        </p>
      </DialogContent>
    </Dialog>
  </>;
}
