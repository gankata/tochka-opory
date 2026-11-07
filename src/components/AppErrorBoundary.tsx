import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = { failed: boolean };

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background p-6 text-foreground">
        <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Не удалось показать эту страницу</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Данные сохранены в локальной базе. Перезагрузите приложение; если ошибка повторится, откройте «Данные» и восстановите последнюю проверенную копию.
          </p>
          <Button className="mt-5 min-h-11 gap-2" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4" />Перезагрузить приложение
          </Button>
        </section>
      </main>
    );
  }
}
