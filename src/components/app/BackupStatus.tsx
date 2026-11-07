import { AlertTriangle, CheckCircle2, Database, HardDriveDownload, LoaderCircle } from "lucide-react";
import type { RouterOutputs } from "@/providers/trpc";
import { formatDateTime } from "@/lib/utils-app";

type BackupHealth = RouterOutputs["workspace"]["backupHealth"];

export function BackupStatus({ health, isLoading, isError }: {
  health: BackupHealth | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <div className="flex min-h-28 items-center gap-3 rounded-2xl border bg-card p-5 text-sm text-muted-foreground" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-primary" />Проверяю базу и резервные копии…</div>;
  }
  if (isError || !health) {
    return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5" role="status"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><div><h2 className="font-semibold">Не удалось проверить копии</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Данные приложения не изменены. Обновите раздел или повторите проверку позже.</p></div></div></div>;
  }

  const failed = Boolean(health.lastBackupFailureAt);
  const attention = failed || health.stale;
  const title = failed
    ? "Последняя попытка копирования не удалась"
    : health.stale
      ? "Нужна свежая резервная копия"
      : "Резервное копирование работает";
  const description = failed
    ? "Рабочая база доступна. Создайте независимую SQLite-копию вручную и проверьте свободное место на диске."
    : health.stale
      ? "Создайте новую независимую копию, чтобы зафиксировать последние изменения."
      : "Последняя независимая копия проверена и готова к восстановлению.";

  return <section className={`rounded-2xl border p-5 ${attention ? "border-amber-500/30 bg-amber-500/10" : "border-primary/20 bg-primary/[0.055]"}`} aria-label="Состояние резервного копирования">
    <div className="flex items-start gap-3">
      {attention ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
    </div>
    <div className="mt-4 grid gap-3 border-t border-current/10 pt-4 text-sm sm:grid-cols-3">
      <div className="flex items-start gap-2"><HardDriveDownload className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Последняя SQLite-копия</p><p className="mt-0.5 font-medium">{health.latestBackupAt ? formatDateTime(health.latestBackupAt) : "Ещё не создана"}</p></div></div>
      <div><p className="text-xs text-muted-foreground">Независимых копий</p><p className="number mt-0.5 font-medium">{health.backupCount}</p></div>
      <div className="flex items-start gap-2"><Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Рабочая база</p><p className="mt-0.5 font-medium text-primary">Проверка пройдена</p></div></div>
    </div>
  </section>;
}
