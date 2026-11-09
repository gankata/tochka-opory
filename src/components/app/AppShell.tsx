import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { ArrowLeftRight, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronDown, Cloud, CloudOff, DatabaseBackup, HeartPulse, Landmark, LayoutDashboard, LogOut, MoreHorizontal, Search, WalletCards } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { ThemeSwitcher } from "@/components/app/ThemeSwitcher";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const GlobalSearch = lazy(() => import("@/components/app/GlobalSearch"));

const navigation = [
  { to: "/", label: "Сегодня", icon: LayoutDashboard },
  { to: "/operations", label: "Операции", icon: ArrowLeftRight },
  { to: "/analytics", label: "Аналитика", shortLabel: "Анализ", icon: ChartNoAxesCombined },
  { to: "/calendar", label: "Календарь", icon: CalendarDays },
  { to: "/plan", label: "План", icon: WalletCards },
  { to: "/mood", label: "Настроение", icon: HeartPulse },
  { to: "/notes", label: "Заметки", icon: BookOpen },
  { to: "/assets", label: "Капитал", icon: Landmark },
  { to: "/data", label: "Данные", icon: DatabaseBackup },
];
const mobilePrimary = navigation.filter(({ to }) => ["/", "/operations", "/mood", "/notes"].includes(to));
const mobileSecondary = navigation.filter(({ to }) => ["/analytics", "/calendar", "/plan", "/assets", "/data"].includes(to));

function Brand() {
  return <div className="flex items-center gap-3"><svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true"><path d="M5 20.5C10.5 19.8 15.8 14.7 20.8 6.5M8.5 8.5c4.5.2 7.2 2.1 8.1 5.8-4.2 1.1-7.1-.7-8.1-5.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 24h21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg><div><div className="font-semibold leading-none tracking-tight">точка опоры</div><div className="mt-1.5 text-[11px] uppercase tracking-[.14em] opacity-60">деньги · состояние</div></div></div>;
}

export default function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const isLocal = user?.unionId === "local-owner";
  const workspace = trpc.workspace.get.useQuery(undefined, { staleTime: 30_000, retry: 1 });
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const moreActive = mobileSecondary.some(({ to }) => pathname === to);
  const desktopMoreVisible = desktopMoreOpen || moreActive;
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.key.toLocaleLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".ProseMirror")) return;
      if (document.querySelector('[data-slot="dialog-content"][data-state="open"]')) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  const sync = workspace.data
    ? isLocal ? "Локальная база сохранена" : "Облако синхронизировано"
    : workspace.isError ? "Нет соединения" : "Проверка базы…";
  return <div className="min-h-[100dvh] bg-background">
    <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 text-primary-foreground transition-transform focus:translate-y-0">Перейти к содержимому</a>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar p-5 text-sidebar-foreground lg:flex">
      <div className="px-2 py-2 text-sidebar-accent-foreground"><Brand /></div>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto pr-1">
        <nav className="space-y-1" aria-label="Основная навигация">
          {mobilePrimary.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`}><Icon className="h-[18px] w-[18px]" />{label}</NavLink>)}
          <button type="button" onClick={() => setDesktopMoreOpen(!desktopMoreOpen)} aria-expanded={desktopMoreVisible} aria-controls="desktop-more" className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${moreActive ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`}><MoreHorizontal className="h-[18px] w-[18px]" /><span className="flex-1 text-left">Ещё</span><ChevronDown className={`h-4 w-4 transition-transform ${desktopMoreVisible ? "rotate-180" : ""}`} /></button>
          <div id="desktop-more" className={`ml-4 space-y-1 border-l border-sidebar-border/70 pl-2 ${desktopMoreVisible ? "" : "hidden"}`}>
            {mobileSecondary.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`}><Icon className="h-4 w-4" />{label}</NavLink>)}
          </div>
        </nav>
        <button type="button" onClick={() => setSearchOpen(true)} className="mt-5 flex min-h-12 w-full items-center gap-3 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/35 px-3 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Поиск и быстрые действия"><Search className="h-[18px] w-[18px]" /><span className="flex-1 text-left">Поиск</span></button>
      </div>
      <div className="mt-4 space-y-4">
        <ThemeSwitcher />
        <div className={`flex items-center gap-2 px-2 text-xs ${workspace.isError ? "text-red-200" : "text-sidebar-foreground/65"}`}>{workspace.isError ? <CloudOff className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}{sync}</div>
        <div className="border-t border-sidebar-border pt-4">
          <div className="truncate px-2 text-sm font-medium text-sidebar-accent-foreground">{user?.name || "Моё пространство"}</div>
          <button onClick={logout} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="h-4 w-4" />Выйти</button>
        </div>
      </div>
    </aside>

    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur lg:hidden">
      <div className="text-primary"><Brand /></div>
      <div className="flex items-center gap-1"><div className="flex h-11 w-8 items-center justify-center" title={sync}>{workspace.isError ? <CloudOff className="h-5 w-5 text-destructive" /> : <Cloud className="h-5 w-5 text-primary" />}<span className="sr-only">{sync}</span></div><button type="button" onClick={() => setSearchOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Поиск и быстрые действия"><Search className="h-5 w-5" /></button><ThemeSwitcher compact /><button type="button" onClick={logout} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Выйти"><LogOut className="h-4 w-4" /></button></div>
    </header>

    <main id="main-content" tabIndex={-1} className="min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:ml-60 lg:px-10 lg:pb-12 lg:pt-9">
      <div className="mx-auto max-w-[1380px]">{children ?? <Outlet />}</div>
    </main>

    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-1 pt-1 backdrop-blur lg:hidden" aria-label="Мобильная навигация">
      <div className="grid grid-cols-5">
        {mobilePrimary.map((item) => {
          const Icon = item.icon;
          return <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-medium leading-none transition-colors ${isActive ? "bg-primary/[0.07] text-primary" : "text-muted-foreground"}`}><Icon className="h-5 w-5" /><span>{item.label}</span></NavLink>;
        })}
        <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-controls="mobile-more" className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-medium leading-none transition-colors ${moreActive ? "bg-primary/[0.07] text-primary" : "text-muted-foreground"}`}><MoreHorizontal className="h-5 w-5" /><span>Ещё</span></button>
      </div>
    </nav>
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetContent id="mobile-more" side="bottom" className="safe-bottom max-h-[80dvh] gap-0 rounded-t-3xl border-border bg-card pb-5 lg:hidden">
        <SheetHeader className="px-5 pb-3 pt-6 text-left"><SheetTitle className="editorial pr-10 text-2xl">Другие разделы</SheetTitle><SheetDescription>Аналитика, планирование и управление данными.</SheetDescription></SheetHeader>
        <nav className="grid grid-cols-2 gap-2 px-4" aria-label="Дополнительные разделы">
          {mobileSecondary.map((item) => {
            const Icon = item.icon;
            return <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `flex min-h-16 items-center gap-3 rounded-2xl border px-4 text-sm font-medium transition-colors ${isActive ? "border-primary/25 bg-primary/10 text-primary" : "bg-secondary/45 text-foreground hover:bg-secondary"}`}><Icon className="h-5 w-5 shrink-0" /><span>{item.label}</span></NavLink>;
          })}
        </nav>
      </SheetContent>
    </Sheet>
    {searchOpen ? <Suspense fallback={null}><GlobalSearch open onOpenChange={setSearchOpen} data={workspace.data} /></Suspense> : null}
  </div>;
}
