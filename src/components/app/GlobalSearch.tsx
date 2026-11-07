import { useDeferredValue, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeftRight, BookOpen, CalendarDays, CirclePlus, DatabaseBackup, FileText,
  Gift, HeartPulse, LayoutDashboard, ListPlus, MinusCircle, Target,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Workspace } from "@/types";
import { trpc } from "@/providers/trpc";
import { buildGlobalSearchIndex, normalizeSearchText, searchCategoryLabels, searchGlobalItems, type GlobalSearchItem, type SearchCategory } from "@/lib/global-search";
import { formatDateTime, todayISO } from "@/lib/utils-app";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const categoryIcons: Record<SearchCategory, LucideIcon> = {
  operations: ArrowLeftRight,
  notes: FileText,
  wishlists: Gift,
  mood: HeartPulse,
  payments: CalendarDays,
  goals: Target,
  sections: LayoutDashboard,
};

const categoryOrder: SearchCategory[] = ["operations", "notes", "wishlists", "mood", "payments", "goals", "sections"];

type QuickAction = {
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  href?: string;
};

const quickActions: QuickAction[] = [
  { id: "expense", title: "Добавить расход", description: "Открыть новую операцию с типом «Расход»", keywords: "трата покупка списание новая операция", icon: MinusCircle, href: "/operations?new=1&type=Расход" },
  { id: "income", title: "Добавить доход", description: "Открыть новую операцию с типом «Доход»", keywords: "поступление зарплата новая операция", icon: CirclePlus, href: "/operations?new=1&type=Доход" },
  { id: "mood", title: "Записать настроение", description: "Создать запись в дневнике на сегодня", keywords: "эмоция состояние самочувствие дневник", icon: HeartPulse, href: `/mood?new=1&date=${todayISO()}` },
  { id: "note", title: "Создать заметку", description: "Добавить страницу и сразу открыть редактор", keywords: "новая страница написать мысль", icon: ListPlus },
  { id: "backup", title: "Создать резервную копию", description: "Сохранить полный снимок текущих данных", keywords: "бекап backup сохранить снимок защита", icon: DatabaseBackup },
  { id: "calendar", title: "Открыть сегодняшний календарь", description: "Показать операции и планы на текущий день", keywords: "сегодня дата события календарь", icon: CalendarDays, href: `/calendar?date=${todayISO()}` },
];

function actionMatches(action: QuickAction, query: string) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  const text = normalizeSearchText(`${action.title} ${action.description} ${action.keywords}`);
  return tokens.every((token) => text.includes(token));
}

export default function GlobalSearch({ open, onOpenChange, data }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Workspace | undefined;
}) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const createNote = trpc.workspace.noteCreate.useMutation();
  const createBackup = trpc.workspace.backupCreate.useMutation();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const index = useMemo(() => data ? buildGlobalSearchIndex(data) : [], [data]);
  const results = useMemo(() => searchGlobalItems(index, deferredQuery), [index, deferredQuery]);
  const visibleActions = useMemo(() => quickActions.filter((action) => actionMatches(action, deferredQuery)), [deferredQuery]);
  const busy = createNote.isPending || createBackup.isPending;

  const changeOpen = (value: boolean) => {
    onOpenChange(value);
    if (!value) setQuery("");
  };
  const go = (href: string) => {
    changeOpen(false);
    navigate(href);
  };
  const runAction = async (action: QuickAction) => {
    if (action.href) { go(action.href); return; }
    if (action.id === "note") {
      try {
        const current = data ?? await utils.workspace.get.fetch();
        const result = await createNote.mutateAsync({
          parentId: null, kind: "note", title: "Новая заметка", content: "", document: null,
          items: [], sortOrder: Math.max(0, ...current.notes.map((note) => note.sortOrder)) + 1,
        });
        await utils.workspace.get.invalidate();
        go(`/notes?note=${result.id}`);
        toast.success("Заметка создана — можно писать");
      } catch { toast.error("Не удалось создать заметку. Проверьте локальный сервер."); }
      return;
    }
    if (action.id === "backup") {
      try {
        await createBackup.mutateAsync({ name: `Копия из поиска · ${formatDateTime(new Date())}` });
        await Promise.all([utils.workspace.backupList.invalidate(), utils.workspace.backupHealth.invalidate()]);
        changeOpen(false);
        toast.success("Резервная копия создана");
      } catch { toast.error("Не удалось создать резервную копию"); }
    }
  };

  const renderResult = (item: GlobalSearchItem) => {
    const Icon = categoryIcons[item.category];
    return <CommandItem
      key={item.id}
      value={`${item.id} ${item.title}`}
      onSelect={() => go(item.href)}
      className="mx-1 mb-1 min-h-16 cursor-pointer items-start gap-3 rounded-xl px-3 py-3 data-[selected=true]:shadow-sm"
      data-search-result={item.id}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="truncate font-medium">{item.title}</span>
          <span className="number shrink-0 text-xs text-muted-foreground sm:text-right">{item.meta}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs leading-relaxed text-muted-foreground">{item.description}</span>
      </span>
    </CommandItem>;
  };

  const groups = deferredQuery.trim()
    ? categoryOrder.map((category) => ({ category, items: results.filter((item) => item.category === category) })).filter((group) => group.items.length)
    : [{ category: null, items: results }];

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent
      showCloseButton={false}
      className="top-[max(0.5rem,env(safe-area-inset-top))] flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl translate-y-0 flex-col gap-0 overflow-hidden rounded-3xl border-border/80 bg-popover p-0 shadow-2xl backdrop-blur-xl duration-300 sm:top-[10dvh] sm:h-auto sm:max-h-[80dvh] sm:w-[calc(100%-2rem)] data-[state=open]:slide-in-from-top-3"
    >
      <DialogHeader className="sr-only"><DialogTitle>Глобальный поиск</DialogTitle><DialogDescription>Поиск по записям и быстрые действия. Ничего не изменяется без выбора действия.</DialogDescription></DialogHeader>
      <Command shouldFilter={false} loop className="min-h-0 flex-1 bg-transparent">
        <div className="relative border-b bg-card/55 transition-colors focus-within:border-primary/60 focus-within:bg-card">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Найти запись или действие…"
            aria-label="Поиск по приложению"
            wrapperClassName="h-16 border-0 pr-12"
            className="h-16 rounded-none text-base [outline:none] focus-visible:[outline:none] sm:text-lg"
          />
          <button type="button" onClick={() => changeOpen(false)} className="absolute right-2 top-2 flex h-12 w-12 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Закрыть поиск"><span className="text-xl leading-none" aria-hidden="true">×</span></button>
        </div>
        <CommandList className="max-h-none min-h-0 flex-1 scroll-py-3 p-2">
          {!deferredQuery.trim() && visibleActions.length > 0 && <CommandGroup heading="Быстрые действия" className="mb-2">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              const pending = (action.id === "note" && createNote.isPending) || (action.id === "backup" && createBackup.isPending);
              return <CommandItem key={action.id} value={`action-${action.id} ${action.title}`} disabled={busy} onSelect={() => void runAction(action)} className="mx-1 mb-1 min-h-16 cursor-pointer gap-3 rounded-xl px-3 py-3" data-search-action={action.id}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{pending ? "Выполняю…" : action.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{action.description}</span></span>
              </CommandItem>;
            })}
          </CommandGroup>}

          {deferredQuery.trim() && visibleActions.length > 0 && <CommandGroup heading="Действия" className="mb-2">
            {visibleActions.map((action) => {
              const Icon = action.icon;
              return <CommandItem key={action.id} value={`action-${action.id} ${action.title}`} disabled={busy} onSelect={() => void runAction(action)} className="mx-1 mb-1 min-h-14 cursor-pointer gap-3 rounded-xl px-3 py-2.5" data-search-action={action.id}><Icon className="h-5 w-5 text-primary" /><span className="font-medium">{action.title}</span></CommandItem>;
            })}
          </CommandGroup>}

          {groups.map((group) => group.items.length > 0 && <CommandGroup key={group.category ?? "recent"} heading={group.category ? searchCategoryLabels[group.category] : "Недавние записи"} className="mb-2">
            {group.items.map(renderResult)}
          </CommandGroup>)}

          {!groups.some((group) => group.items.length) && !visibleActions.length && <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center" role="status">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary"><BookOpen className="h-5 w-5 text-muted-foreground" /></span>
            <p className="mt-4 font-medium">Ничего не найдено</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">Попробуйте другое слово, сумму или дату. Можно искать по тексту заметок и комментариям.</p>
          </div>}
        </CommandList>
        <footer className="flex min-h-11 items-center justify-between gap-3 border-t bg-card/55 px-4 text-[11px] text-muted-foreground">
          <span className="hidden items-center gap-2 sm:flex"><kbd className="rounded-md border bg-background px-1.5 py-0.5">↑↓</kbd> выбрать <kbd className="rounded-md border bg-background px-1.5 py-0.5">Enter</kbd> открыть</span>
          <span className="sm:hidden">Все данные остаются на устройстве</span>
          <span className="flex items-center gap-1.5"><kbd className="rounded-md border bg-background px-1.5 py-0.5">Esc</kbd> закрыть</span>
        </footer>
      </Command>
    </DialogContent>
  </Dialog>;
}

export function SearchShortcut() {
  const modifier = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
  return <><kbd className="rounded-md border border-sidebar-border/70 px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60">{modifier}</kbd><kbd className="rounded-md border border-sidebar-border/70 px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60">K</kbd></>;
}
