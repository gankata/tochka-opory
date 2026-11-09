import type { CSSProperties, ReactNode } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FeatureHint } from "@/components/app/FeatureHint";

export function PageHeader({ eyebrow, title, description, action, hint }: { eyebrow?: string; title: string; description: string; action?: ReactNode; hint?: string }) {
  return <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-3xl">
      {eyebrow && <p className="mb-1 text-sm font-semibold text-primary">{eyebrow}</p>}
      <div className="flex items-start gap-1"><h1 className="editorial text-balance text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1><FeatureHint title={title} text={hint ?? description} /></div>
      <p className="mt-2 max-w-[70ch] text-base leading-relaxed text-muted-foreground">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button onClick={onClick} className="min-h-11 w-full gap-2 sm:w-auto"><Plus className="h-4 w-4" />{label}</Button>;
}

export function Metric({ label, value, note, tone = "default" }: { label: string; value: ReactNode; note?: string; tone?: "default" | "danger" | "good" }) {
  return <div className="py-1">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={`number mt-1 whitespace-nowrap text-2xl font-semibold leading-tight ${tone === "danger" ? "text-destructive" : tone === "good" ? "text-primary" : ""}`}>{value}</p>
    {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
  </div>;
}

export function Section({ title, description, action, children, className = "", style, hint }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; hint?: string }) {
  return <section className={`surface p-5 sm:p-6 ${className}`} style={style}>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-start gap-1"><h2 className="text-lg font-semibold">{title}</h2><FeatureHint title={title} text={hint ?? description} /></div>{description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed bg-secondary/35 px-5 py-8 text-center">
    <p className="font-medium">{title}</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function FormDialog({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[92dvh] w-[calc(100%-24px)] max-w-2xl flex-col overflow-hidden rounded-2xl p-0">
      <DialogHeader className="border-b px-5 pb-4 pt-5 text-left sm:px-6">
        <DialogTitle className="editorial text-2xl">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
    </DialogContent>
  </Dialog>;
}

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}</label>;
}

export function DeleteButton({ label = "Удалить", onConfirm }: { label?: string; onConfirm: () => void }) {
  return <AlertDialog>
    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" aria-label={label}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
    <AlertDialogContent className="w-[calc(100%-32px)] rounded-2xl">
      <AlertDialogHeader><AlertDialogTitle>{label}?</AlertDialogTitle><AlertDialogDescription>Действие нельзя отменить. Ежедневная резервная копия останется доступна в разделе «Данные».</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel className="min-h-11">Отмена</AlertDialogCancel><AlertDialogAction onClick={onConfirm} className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function LoadingPage() {
  return <div className="mx-auto max-w-6xl animate-pulse p-5" aria-label="Загрузка данных"><div className="h-8 w-56 rounded bg-secondary" /><div className="mt-4 h-4 w-80 max-w-full rounded bg-secondary" /><div className="mt-8 grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-36 rounded-2xl bg-secondary" />)}</div></div>;
}

export function ErrorPage({ retry }: { retry: () => void }) {
  return <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center p-6 text-center"><AlertCircle className="h-8 w-8 text-destructive" /><h1 className="mt-4 text-xl font-semibold">Не удалось получить данные</h1><p className="mt-2 text-sm text-muted-foreground">Проверьте соединение с локальным сервером. Ваши записи остаются в базе приложения и в резервных копиях.</p><Button onClick={retry} className="mt-5 min-h-11">Повторить</Button></div>;
}
