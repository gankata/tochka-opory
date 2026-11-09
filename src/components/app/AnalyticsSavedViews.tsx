import { useState, type FormEvent } from "react";
import { Bookmark, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AnalyticsGroup, AnalyticsKind, AnalyticsPeriod } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Field, FormDialog } from "@/components/app/Common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const storageKey = "tochka-analytics-views";

export type SavedAnalyticsView = {
  id: string;
  name: string;
  kind: AnalyticsKind;
  period: AnalyticsPeriod;
  group: AnalyticsGroup;
  customStart: string;
  customEnd: string;
};

type AnalyticsSavedViewsProps = Omit<SavedAnalyticsView, "id" | "name"> & {
  suggestedName: string;
  onApply: (view: SavedAnalyticsView) => void;
};

function isSavedView(value: unknown): value is SavedAnalyticsView {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedAnalyticsView>;
  return typeof item.id === "string" && item.id.length > 0 &&
    typeof item.name === "string" && item.name.trim().length > 0 &&
    (item.kind === "expense" || item.kind === "income") &&
    ["month", "3m", "6m", "12m", "all", "custom"].includes(item.period ?? "") &&
    ["day", "week", "month"].includes(item.group ?? "") &&
    typeof item.customStart === "string" && typeof item.customEnd === "string";
}

function readSavedViews(): SavedAnalyticsView[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

export default function AnalyticsSavedViews(props: AnalyticsSavedViewsProps) {
  const { kind, period, group, customStart, customEnd, suggestedName, onApply } = props;
  const [savedViews, setSavedViews] = useState<SavedAnalyticsView[]>(readSavedViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const activeView = savedViews.find((item) => item.id === activeViewId) ?? null;
  const isDirty = activeView !== null && (activeView.kind !== kind || activeView.period !== period || activeView.group !== group || activeView.customStart !== customStart || activeView.customEnd !== customEnd);

  const commit = (next: SavedAnalyticsView[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSavedViews(next);
      return true;
    } catch {
      toast.error("Не удалось сохранить изменения на этом устройстве");
      return false;
    }
  };

  const applyView = (view: SavedAnalyticsView) => {
    setActiveViewId(view.id);
    onApply(view);
  };

  const openSave = () => {
    setName(suggestedName);
    setNameError("");
    setSaveOpen(true);
  };

  const openRename = () => {
    if (!activeView) return;
    setName(activeView.name);
    setNameError("");
    setRenameOpen(true);
  };

  const validateName = (exceptId?: string) => {
    const normalized = name.trim().replace(/\s+/g, " ");
    if (!normalized) {
      setNameError("Введите название представления.");
      return null;
    }
    if (savedViews.some((item) => item.id !== exceptId && item.name.trim().toLocaleLowerCase("ru-RU") === normalized.toLocaleLowerCase("ru-RU"))) {
      setNameError("Представление с таким названием уже существует.");
      return null;
    }
    return normalized;
  };

  const saveNew = (event: FormEvent) => {
    event.preventDefault();
    const normalized = validateName();
    if (!normalized) return;
    const view: SavedAnalyticsView = { id: crypto.randomUUID(), name: normalized, kind, period, group, customStart, customEnd };
    if (!commit([...savedViews, view])) return;
    setActiveViewId(view.id);
    setSaveOpen(false);
    toast.success("Представление сохранено на этом устройстве");
  };

  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!activeView) return;
    const normalized = validateName(activeView.id);
    if (!normalized) return;
    const next = savedViews.map((item) => item.id === activeView.id ? { ...item, name: normalized } : item);
    if (!commit(next)) return;
    setRenameOpen(false);
    toast.success("Название представления изменено");
  };

  const updateActive = () => {
    if (!activeView) return;
    const next = savedViews.map((item) => item.id === activeView.id ? { ...item, kind, period, group, customStart, customEnd } : item);
    if (commit(next)) toast.success(`«${activeView.name}» обновлено текущими фильтрами`);
  };

  const revertActive = () => {
    if (!activeView) return;
    applyView(activeView);
    toast.success(`Восстановлены фильтры «${activeView.name}»`);
  };

  const deleteActive = () => {
    if (!activeView) return;
    if (!commit(savedViews.filter((item) => item.id !== activeView.id))) return;
    setActiveViewId(null);
    toast.success("Представление удалено. Операции не изменены");
  };

  return <>
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Bookmark className="hidden h-4 w-4 shrink-0 text-primary sm:block" aria-hidden="true" />
        <div className="w-full min-w-0 sm:w-72">
          <Select
            value={activeViewId ?? ""}
            disabled={!savedViews.length}
            onValueChange={(id) => {
              const saved = savedViews.find((item) => item.id === id);
              if (saved) applyView(saved);
            }}
          >
            <SelectTrigger aria-label="Сохранённые представления" className="min-h-11 w-full min-w-0 rounded-lg bg-card">
              <SelectValue placeholder={savedViews.length ? "Выберите представление…" : "Нет сохранённых представлений"} />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={8} className="rounded-xl">
              {savedViews.map((saved) => (
                <SelectItem
                  key={saved.id}
                  value={saved.id}
                  onPointerUp={(event) => {
                    if (event.pointerType === "mouse") applyView(saved);
                  }}
                  onClick={() => applyView(saved)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") applyView(saved);
                  }}
                  className="min-h-11 cursor-pointer rounded-lg"
                >
                  {saved.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="min-h-11 w-full gap-2 sm:w-auto" onClick={openSave}><Plus className="h-4 w-4" />Сохранить новое</Button>
        {activeView && <div className="flex items-center gap-1" aria-label="Действия с выбранным представлением">
          {isDirty && <>
            <Button variant="ghost" size="icon" className="h-11 w-11" title="Вернуть сохранённые настройки" aria-label="Вернуть сохранённые настройки" onClick={revertActive}><RotateCcw className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-11 w-11" title="Обновить текущими фильтрами" aria-label="Обновить сохранённое представление" onClick={updateActive}><Save className="h-4 w-4" /></Button>
          </>}
          <Button variant="ghost" size="icon" className="h-11 w-11" title="Переименовать представление" aria-label="Переименовать представление" onClick={openRename}><Pencil className="h-4 w-4" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" title="Удалить представление" aria-label="Удалить представление"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
            <AlertDialogContent className="w-[calc(100%-32px)] rounded-2xl">
              <AlertDialogHeader><AlertDialogTitle>Удалить «{activeView.name}»?</AlertDialogTitle><AlertDialogDescription>Будет удалён только сохранённый набор фильтров. Операции и текущий экран аналитики не изменятся. Действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel className="min-h-11">Отмена</AlertDialogCancel><AlertDialogAction onClick={deleteActive} className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground" role="status">
        {activeView ? isDirty ? `«${activeView.name}»: фильтры изменены. Обновите представление или верните сохранённые настройки.` : `Выбрано «${activeView.name}». Можно переименовать или удалить представление.` : "Сохраните текущие фильтры, чтобы быстро применять их позже на этом устройстве."}
      </p>
    </div>

    <FormDialog open={saveOpen} onOpenChange={setSaveOpen} title="Сохранить представление" description="Сохранятся тип операций, период, группировка и пользовательские даты. Сами операции не изменятся.">
      <form onSubmit={saveNew} noValidate className="space-y-5">
        <Field label="Название представления" hint="Название хранится только на этом устройстве.">
          <input autoFocus aria-label="Название представления" value={name} onChange={(event) => { setName(event.target.value); setNameError(""); }} maxLength={80} className="field" placeholder="Например: расходы за полгода" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "save-view-name-error" : undefined} />
        </Field>
        {nameError && <p id="save-view-name-error" role="alert" className="text-sm text-destructive">{nameError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={() => setSaveOpen(false)}>Отмена</Button><Button type="submit" className="min-h-11 gap-2"><Save className="h-4 w-4" />Сохранить</Button></div>
      </form>
    </FormDialog>

    <FormDialog open={renameOpen} onOpenChange={setRenameOpen} title="Переименовать представление" description="Изменится только название. Сохранённые фильтры останутся прежними.">
      <form onSubmit={rename} noValidate className="space-y-5">
        <Field label="Новое название">
          <input autoFocus aria-label="Новое название" value={name} onChange={(event) => { setName(event.target.value); setNameError(""); }} maxLength={80} className="field" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "rename-view-name-error" : undefined} />
        </Field>
        {nameError && <p id="rename-view-name-error" role="alert" className="text-sm text-destructive">{nameError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={() => setRenameOpen(false)}>Отмена</Button><Button type="submit" className="min-h-11">Сохранить название</Button></div>
      </form>
    </FormDialog>
  </>;
}
