import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ArchiveRestore, Download, FileJson, History, Plus, Save, ShieldCheck, Upload } from "lucide-react";
import { currencyDefinitions, isCurrencyCode, type CurrencyCode } from "@contracts/currencies";
import { calculateWorkspace, operationAmount, operationCurrency } from "@/lib/utils-app";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { Settings } from "@/types";
import { downloadBlob, formatDateTime, parseDecimal, todayISO, toCsv } from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DeleteButton, EmptyState, ErrorPage, Field, FormDialog, LoadingPage, PageHeader, Section } from "@/components/app/Common";
import AccountSecurity from "@/components/app/AccountSecurity";
import { BackupStatus } from "@/components/app/BackupStatus";
import { DatePicker } from "@/components/app/DatePicker";
import ImportCenter from "@/components/app/ImportCenter";
import IncomeScheduleSettings, { type IncomeSourceDraft } from "@/components/app/IncomeScheduleSettings";
import { decryptArchive, encryptArchive } from "@/lib/encrypted-archive";
import { useFeatureHints } from "@/hooks/use-feature-hints";

type Tab = "backups" | "imports" | "settings" | "options" | "help";
type CurrencyDraft = Record<string, { rate: string; balance: string }>;
const numericSettingKeys = ["cashRub", "cardRub", "cashUsd", "usdRate", "reserveMonths", "salaryDay", "secondSalaryDay", "savingPercent", "statsMonths", "largeExpenseThreshold"] as const;
type NumericSettingsKey = (typeof numericSettingKeys)[number];
type SettingsDraft = Record<NumericSettingsKey, string>;
const settingsToDraft = (settings: Settings): SettingsDraft => Object.fromEntries(
  numericSettingKeys.map((key) => [key, settings[key] == null ? "" : String(settings[key])]),
) as SettingsDraft;
const incomeSourcesToDraft = (sources: Array<{ id: number; name: string; dayOfMonth: number | null }>): IncomeSourceDraft[] => sources.map((source) => ({
  key: String(source.id), name: source.name, dayOfMonth: source.dayOfMonth == null ? "15" : String(source.dayOfMonth), lastWorkingDay: source.dayOfMonth == null,
}));
const tabs: Array<[Tab, string]> = [["backups", "Копии и история"], ["imports", "Импорт и правила"], ["settings", "Настройки"], ["options", "Списки"], ["help", "Памятка"]];

function RestoreButton({ id, name, onRestored }: { id: number; name: string; onRestored: () => Promise<void> }) {
  const restore = trpc.workspace.backupRestore.useMutation();
  return <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="min-h-11 gap-2"><ArchiveRestore className="h-4 w-4" />Восстановить</Button></AlertDialogTrigger><AlertDialogContent className="w-[calc(100%-32px)] rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Восстановить «{name}»?</AlertDialogTitle><AlertDialogDescription>Текущие записи будут заменены данными копии. Перед этим автоматически создаётся отдельная резервная копия текущего состояния.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11">Отмена</AlertDialogCancel><AlertDialogAction className="min-h-11" onClick={async () => { try { await restore.mutateAsync({ id }); await onRestored(); toast.success("Данные восстановлены"); } catch { toast.error("Не удалось восстановить копию"); } }}>Восстановить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function FileBackupList({ items, onRestored }: { items: Array<{ name: string; size: number; createdAt: Date }>; onRestored: () => Promise<void> }) {
  const restore = trpc.workspace.fileBackupRestore.useMutation();
  const create = trpc.workspace.fileBackupCreate.useMutation();
  const formatSize = (bytes: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} МБ`;
  const createCopy = async () => {
    try {
      await create.mutateAsync();
      await onRestored();
      toast.success("Независимая SQLite-копия создана и проверена");
    } catch {
      toast.error("Не удалось создать SQLite-копию");
    }
  };
  return <Section title="Независимые копии базы" description="Проверенные SQLite-файлы хранятся отдельно от рабочей базы в папке data/backups. Сохраняются последние 30 копий." action={<Button variant="outline" className="min-h-11 gap-2" disabled={create.isPending} onClick={() => void createCopy()}><Save className="h-4 w-4" />{create.isPending ? "Создание…" : "Создать SQLite-копию"}</Button>}><div className="max-h-[36rem] divide-y overflow-y-auto pr-1">{items.length ? items.map((item) => <article key={item.name} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="text-sm font-medium" title={item.name}>SQLite-копия базы</h3><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt)} · {formatSize(item.size)}</p></div><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="min-h-11 shrink-0 gap-2"><ArchiveRestore className="h-4 w-4" />Восстановить файл</Button></AlertDialogTrigger><AlertDialogContent className="w-[calc(100%-32px)] rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Восстановить всю базу?</AlertDialogTitle><AlertDialogDescription>Сначала будет создана копия текущего состояния. Затем все данные будут заменены содержимым проверенного файла {item.name}.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11">Отмена</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={restore.isPending} onClick={async () => { try { await restore.mutateAsync({ name: item.name }); await onRestored(); toast.success("База восстановлена из файловой копии"); } catch { toast.error("Не удалось восстановить файловую копию"); } }}>Восстановить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></article>) : <EmptyState title="Файловых копий пока нет" text="Создайте первую независимую SQLite-копию кнопкой выше." />}</div></Section>;
}

export default function DataCenter() {
  const [featureHintsEnabled, setFeatureHintsEnabled] = useFeatureHints();
  const query = trpc.workspace.get.useQuery(); const data = query.data;
  const backupsQuery = trpc.workspace.backupList.useQuery(undefined, { enabled: Boolean(data) });
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = tabs.some(([key]) => key === requestedTab) ? requestedTab as Tab : "backups";
  const setTab = (nextTab: Tab) => setSearchParams({ tab: nextTab });
  const [backupDialog, setBackupDialog] = useState(false); const [backupName, setBackupName] = useState(`Ручная копия от ${new Intl.DateTimeFormat("ru-RU").format(new Date())}`);
  const backupHealthQuery = trpc.workspace.backupHealth.useQuery(undefined, { enabled: Boolean(data) && tab === "backups" });
  const createBackup = trpc.workspace.backupCreate.useMutation(); const importBackup = trpc.workspace.backupImport.useMutation(); const updateSettings = trpc.workspace.settingsUpdate.useMutation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [incomeSourceDraft, setIncomeSourceDraft] = useState<IncomeSourceDraft[]>([]);
  const [currencyDraft, setCurrencyDraft] = useState<CurrencyDraft>({});
  const [newCurrency, setNewCurrency] = useState<CurrencyCode>("USD");
  const [usdVisible, setUsdVisible] = useState(false);
  const [optionKind, setOptionKind] = useState<"emotion" | "topic" | "time">("emotion"); const [newOption, setNewOption] = useState("");
  const createOption = trpc.workspace.optionCreate.useMutation(); const deleteOption = trpc.workspace.optionDelete.useMutation();
  /* Refresh editable drafts only after the server settings version changes. */
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!data?.settings) return;
    setSettings(data.settings);
    setSettingsDraft(settingsToDraft(data.settings));
    setIncomeSourceDraft(incomeSourcesToDraft(data.incomeSources));
    const codes = new Set<string>([
      ...Object.keys(data.settings.currencyRates ?? {}),
      ...Object.keys(data.settings.currencyBalances ?? {}),
      ...data.transactions.map((transaction) => operationCurrency(transaction)),
    ]);
    const draft: CurrencyDraft = {};
    for (const code of codes) {
      if (code === "RUB" || code === "USD" || !isCurrencyCode(code)) continue;
      draft[code] = {
        rate: String(data.settings.currencyRates?.[code] ?? ""),
        balance: String(data.settings.currencyBalances?.[code] ?? 0),
      };
    }
    setCurrencyDraft(draft);
    setUsdVisible(calculateWorkspace(data).bookUsd !== 0);
  }, [data?.settings?.updatedAt]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  const refreshAll = async () => { await Promise.all([utils.workspace.get.invalidate(), utils.workspace.backupList.invalidate(), utils.workspace.backupHealth.invalidate()]); };
  if (query.isLoading) return <LoadingPage />; if (query.isError || !data?.settings) return <ErrorPage retry={() => query.refetch()} />;

  const exportJson = async () => { try { const archive = await utils.workspace.archiveGet.fetch(); downloadBlob(JSON.stringify(archive, null, 2), `tochka-opory-archive-${todayISO()}.json`, "application/json;charset=utf-8"); toast.success("Полный архив скачан, включая изображения заметок"); } catch { toast.error("Не удалось сформировать полный архив"); } };
  const exportEncrypted = async () => {
    const password = window.prompt("Пароль для зашифрованного архива (минимум 8 символов). Он нигде не сохраняется.");
    if (!password) return;
    try { const archive = await utils.workspace.archiveGet.fetch(); const encrypted = await encryptArchive(archive, password); downloadBlob(encrypted, `tochka-opory-encrypted-${todayISO()}.json`, "application/json;charset=utf-8"); toast.success("Зашифрованный архив AES-256-GCM скачан"); } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось зашифровать архив"); }
  };
  const exportOperations = () => {
    downloadBlob(toCsv([
      ["Дата", "Тип", "Категория", "Валюта", "Сумма в валюте", "Курс к RUB", "Рублёвый эквивалент", "Комментарий"],
      ...data.transactions.map((transaction) => [
        transaction.operationDate,
        transaction.type,
        transaction.category,
        operationCurrency(transaction),
        operationAmount(transaction),
        transaction.exchangeRate,
        transaction.amountRub,
        transaction.note,
      ]),
    ]), `operations-${todayISO()}.csv`, "text/csv;charset=utf-8");
  };
  const exportMoods = () => { downloadBlob(toCsv([["Дата", "Время", "Настроение", "Эмоция", "Сила", "Тема", "Ситуация", "Мысли", "Тело", "Что помогло", "Энергия", "Сон", "Для терапевта"], ...data.moods.map((m) => [m.entryDate, m.timeOfDay, m.mood, m.emotion, m.intensity, m.topic, m.situation, m.thoughts, m.body, m.coping, m.energy, m.sleepHours, m.therapyNotes])]), `mood-diary-${todayISO()}.csv`, "text/csv;charset=utf-8"); };
  const makeBackup = async () => { try { await createBackup.mutateAsync({ name: backupName }); await refreshAll(); setBackupDialog(false); toast.success("Резервная копия создана"); } catch { toast.error("Не удалось создать копию"); } };
  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings || !settingsDraft) return;
    const rules: Record<NumericSettingsKey, { min: number; max: number; integer?: boolean }> = {
      cashRub: { min: 0, max: 1_000_000_000_000 },
      cardRub: { min: 0, max: 1_000_000_000_000 },
      cashUsd: { min: 0, max: 1_000_000_000_000 },
      usdRate: { min: 0.000001, max: 1_000_000 },
      reserveMonths: { min: 0, max: 120, integer: true },
      salaryDay: { min: 1, max: 31, integer: true },
      secondSalaryDay: { min: 1, max: 31, integer: true },
      savingPercent: { min: 0, max: 90, integer: true },
      statsMonths: { min: 1, max: 60, integer: true },
      largeExpenseThreshold: { min: 0, max: 1_000_000_000_000 },
    };
    const parsed = {} as Record<NumericSettingsKey, number>;
    for (const key of numericSettingKeys) {
      const rawValue = settingsDraft[key].trim();
      if (!usdVisible && (key === "cashUsd" || key === "usdRate")) {
        parsed[key] = key === "cashUsd" ? 0 : settings.usdRate;
        continue;
      }
      if (key === "secondSalaryDay" && !rawValue) {
        parsed[key] = 0;
        continue;
      }
      if (key === "salaryDay" && !rawValue && settings.incomeSchedule === "irregular") {
        parsed[key] = settings.salaryDay;
        continue;
      }
      const value = parseDecimal(rawValue);
      const rule = rules[key];
      if (!rawValue || !Number.isFinite(value) || value < rule.min || value > rule.max || (rule.integer && !Number.isInteger(value))) {
        toast.error(key === "usdRate" ? "Введите курс USD больше нуля, например 81,25" : "Проверьте числовые поля настроек");
        return;
      }
      parsed[key] = value;
    }
    const incomeSources: Array<{ name: string; dayOfMonth: number | null; sortOrder: number }> = [];
    for (const [sortOrder, source] of incomeSourceDraft.entries()) {
      const name = source.name.trim();
      const dayOfMonth = source.lastWorkingDay ? null : Number(source.dayOfMonth);
      if (!name || (dayOfMonth !== null && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31))) {
        toast.error(`Проверьте название и день источника дохода ${sortOrder + 1}`);
        return;
      }
      incomeSources.push({ name, dayOfMonth, sortOrder });
    }
    const currencyRates: Record<string, number> = {};
    const currencyBalances: Record<string, number> = {};
    for (const [code, draft] of Object.entries(currencyDraft)) {
      const rate = draft.rate.trim() === "" ? null : parseDecimal(draft.rate);
      const balance = draft.balance.trim() === "" ? 0 : parseDecimal(draft.balance);
      if ((rate != null && (!Number.isFinite(rate) || rate <= 0)) || !Number.isFinite(balance) || balance < 0) {
        toast.error(`Проверьте курс и стартовый остаток ${code}`);
        return;
      }
      if (rate != null) currencyRates[code] = rate;
      currencyBalances[code] = balance;
    }
    try {
      await updateSettings.mutateAsync({
        startDate: settings.startDate,
        ...parsed,
        secondSalaryDay: settingsDraft.secondSalaryDay.trim() ? parsed.secondSalaryDay : null,
        incomeSchedule: settings.incomeSchedule,
        incomeSources,
        mode: settings.mode,
        incomeStrategy: settings.incomeStrategy,
        currencyRates,
        currencyBalances,
      });
      await refreshAll();
      toast.success("Настройки и валютные курсы сохранены");
    } catch {
      toast.error("Проверьте поля и повторите");
    }
  };
  const downloadBackup = async (id: number) => { try { const result = await utils.workspace.backupGet.fetch({ id }); downloadBlob(JSON.stringify(result.payload, null, 2), `backup-${id}-${todayISO()}.json`, "application/json;charset=utf-8"); } catch { toast.error("Не удалось скачать копию"); } };
  const importFile = async (file?: File) => { if (!file) return; try { let text = await file.text(); if (text.includes("tochka-opory-encrypted@1")) { const password = window.prompt("Введите пароль зашифрованного архива"); if (!password) return; text = JSON.stringify(await decryptArchive(text, password)); } await importBackup.mutateAsync({ payload: text }); await refreshAll(); toast.success("Архив импортирован"); } catch { toast.error("Файл не подходит или пароль неверен. Текущие данные не изменены."); } };
  const kindLabel = { manual: "Ручная", auto: "Автоматическая", import: "Импорт" };

  return <div className="page-enter"><PageHeader eyebrow="Хранение и перенос" title="Ваши данные остаются вашими" description="Локальная база работает без облака. Снимки и независимые SQLite-файлы помогают восстановить прежнее состояние, а JSON-архив — перенести данные." action={<Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={() => setBackupDialog(true)}><Save className="h-4 w-4" />Создать копию</Button>} />

    <Section title="Экспорт" description="Файлы формируются на вашем устройстве из актуальных локальных данных. CSV открывается в Excel и Numbers."><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Button variant="outline" className="min-h-12 justify-start gap-2 bg-card" onClick={exportJson}><FileJson className="h-4 w-4 text-primary" />Полный JSON-архив</Button><Button variant="outline" className="min-h-12 justify-start gap-2 bg-card" onClick={() => void exportEncrypted()}><ShieldCheck className="h-4 w-4 text-primary" />Зашифрованный архив</Button><Button variant="outline" className="min-h-12 justify-start gap-2 bg-card" onClick={exportOperations}><Download className="h-4 w-4 text-primary" />Операции в CSV</Button><Button variant="outline" className="min-h-12 justify-start gap-2 bg-card" onClick={exportMoods}><Download className="h-4 w-4 text-primary" />Настроение в CSV</Button></div></Section>

    <div className="my-6 flex snap-x gap-2 overflow-x-auto rounded-xl bg-secondary/60 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Управление данными">{tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 shrink-0 snap-start whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors sm:flex-1 ${tab === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}</div>

    {tab === "backups" && <div className="mb-5"><BackupStatus health={backupHealthQuery.data} isLoading={backupHealthQuery.isLoading} isError={backupHealthQuery.isError} /></div>}

    {tab === "backups" && <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]"><Section title="Резервные копии" description="Автоматическая копия создаётся раз в 24 часа при использовании приложения и перед каждым восстановлением."><div className="mb-5 flex items-start gap-3 rounded-xl bg-secondary/55 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Для независимой защиты периодически скачивайте полный JSON-архив и храните его в отдельном месте. Ни одна система не может обещать абсолютную сохранность без внешней копии.</p></div>{backupsQuery.isLoading ? <p className="text-sm text-muted-foreground">Загрузка копий…</p> : backupsQuery.data?.items.length ? <div className="divide-y">{backupsQuery.data.items.map((b) => <article key={b.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-medium">{b.name}</h3><p className="mt-1 text-xs text-muted-foreground">{kindLabel[b.kind]} · {formatDateTime(b.createdAt)}</p></div><div className="flex flex-wrap gap-2"><Button variant="ghost" className="min-h-11 gap-2" onClick={() => downloadBackup(b.id)}><Download className="h-4 w-4" />Скачать</Button><RestoreButton id={b.id} name={b.name} onRestored={refreshAll} /></div></div></article>)}</div> : <EmptyState title="Копий пока нет" text="Создайте первую ручную копию." />}<div className="mt-6 border-t pt-5"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium transition-colors hover:bg-secondary"><Upload className="h-4 w-4" />Импортировать JSON-архив<input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} disabled={importBackup.isPending} /></label><p className="mt-2 text-xs text-muted-foreground">Перед импортом текущее состояние автоматически сохраняется.</p></div></Section><Section title="Журнал изменений" description="Последние 60 действий в приложении.">{backupsQuery.data?.activity.length ? <div className="max-h-[28rem] divide-y overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} role="region" aria-label="Последние действия в приложении">{backupsQuery.data.activity.map((a) => <div key={a.id} className="flex gap-3 py-3 first:pt-0"><History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-sm">{a.summary}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p></div></div>)}</div> : <EmptyState title="История пока пуста" text="Действия появятся после изменений." />}</Section></div>}

    {tab === "backups" && <div className="mt-5"><FileBackupList items={backupsQuery.data?.fileItems ?? []} onRestored={refreshAll} /></div>}

    {tab === "imports" && <ImportCenter />}

    {tab === "settings" && settings && settingsDraft && <div className="space-y-5"><AccountSecurity /><Section title="Помощь в интерфейсе" description="Настройте количество вспомогательных элементов под свой опыт."><div className="flex items-center gap-4"><label htmlFor="feature-hints-toggle" className="min-w-0 flex-1 cursor-pointer"><span className="block font-medium">Контекстные подсказки</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">Показывать значки вопроса рядом со страницами и крупными функциями. Выбор сохраняется в этом браузере; полное руководство останется доступным.</span></label><Switch id="feature-hints-toggle" aria-label="Показывать контекстные подсказки" checked={featureHintsEnabled} onCheckedChange={setFeatureHintsEnabled} /></div></Section><form onSubmit={saveSettings} className="space-y-5"><Section title="Стартовые остатки и валюты" description="Операции начиная с даты стартового остатка изменяют расчётный баланс; более ранние остаются историей."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Дата остатков"><DatePicker required aria-label="Дата остатков" value={settings.startDate} onChange={(startDate) => setSettings({ ...settings, startDate })} /></Field><Field label="Наличные, ₽"><input type="text" inputMode="decimal" autoComplete="off" className="field" value={settingsDraft.cashRub} onChange={(e) => setSettingsDraft({ ...settingsDraft, cashRub: e.target.value })} /></Field><Field label="Карта, ₽"><input type="text" inputMode="decimal" autoComplete="off" className="field" value={settingsDraft.cardRub} onChange={(e) => setSettingsDraft({ ...settingsDraft, cardRub: e.target.value })} /></Field></div>{usdVisible && <div className="mt-4 grid gap-3 rounded-xl bg-secondary/40 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-start"><Field label="Наличные, $"><input type="text" inputMode="decimal" autoComplete="off" className="field" value={settingsDraft.cashUsd} onChange={(e) => setSettingsDraft({ ...settingsDraft, cashUsd: e.target.value })} /></Field><Field label="Курс ₽ за $1" hint="Можно вводить копейки через точку или запятую: 81,25. Это текущая оценка, не прогноз."><input type="text" inputMode="decimal" autoComplete="off" className="field" value={settingsDraft.usdRate} onChange={(e) => setSettingsDraft({ ...settingsDraft, usdRate: e.target.value })} /></Field><Button type="button" variant="ghost" className="min-h-11 lg:mt-[26px]" onClick={() => { setUsdVisible(false); setSettingsDraft({ ...settingsDraft, cashUsd: "0" }); }}>Убрать USD</Button></div>}<div className="mt-6 border-t pt-5"><div className="mb-4"><h3 className="font-semibold">Дополнительные валюты</h3><p className="mt-1 text-sm text-muted-foreground">Добавьте THB, GBP или другую валюту. Стартовый остаток — сколько у вас уже есть на дату остатков; текущий курс используется только для общей оценки в рублях.</p></div><div className="space-y-3">{Object.entries(currencyDraft).map(([code, draft]) => <div key={code} className="grid gap-3 rounded-xl bg-secondary/40 p-3 md:grid-cols-[minmax(150px,1fr)_180px_180px_auto] md:items-end"><div className="pb-1"><b>{code}</b><span className="mt-1 block text-xs text-muted-foreground">{currencyDefinitions.find((currency) => currency.code === code)?.name}</span></div><Field label={`Курс ₽ за 1 ${code}`}><input type="text" inputMode="decimal" autoComplete="off" placeholder="Не задан" className="field" value={draft.rate} onChange={(event) => setCurrencyDraft({ ...currencyDraft, [code]: { ...draft, rate: event.target.value } })} /></Field><Field label={`Стартовый остаток, ${code}`}><input type="text" inputMode="decimal" autoComplete="off" className="field" value={draft.balance} onChange={(event) => setCurrencyDraft({ ...currencyDraft, [code]: { ...draft, balance: event.target.value } })} /></Field><Button type="button" variant="ghost" className="min-h-11" onClick={() => { const next = { ...currencyDraft }; delete next[code]; setCurrencyDraft(next); }}>Убрать</Button></div>)}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select aria-label="Новая валюта" className="field sm:max-w-sm" value={newCurrency} onChange={(event) => setNewCurrency(event.target.value as CurrencyCode)}>{currencyDefinitions.filter((currency) => currency.code !== "RUB").map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select><Button type="button" variant="outline" className="min-h-11 gap-2" disabled={(newCurrency === "USD" && usdVisible) || Boolean(currencyDraft[newCurrency])} onClick={() => { if (newCurrency === "USD") setUsdVisible(true); else setCurrencyDraft({ ...currencyDraft, [newCurrency]: { rate: "", balance: "0" } }); const next = currencyDefinitions.find((currency) => currency.code !== "RUB" && currency.code !== newCurrency && !currencyDraft[currency.code] && (currency.code !== "USD" || !usdVisible)); if (next) setNewCurrency(next.code); }}><Plus className="h-4 w-4" />Добавить валюту</Button></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Курсы задаются вручную и не обновляются онлайн. Изменение текущего курса не переписывает старые операции. Если убрать строку валюты, её операции и архивы не удаляются.</p></div></Section><Section title="Правила планирования" description="Параметры осторожного прогноза, запаса, выплат и крупных трат. Они влияют на расчёты плана, но не создают операции."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Режим расходов"><select className="field" value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value as Settings["mode"] })}><option>Обычный</option><option>Экономия</option></select></Field><Field label="Экономия на переменных, %"><input type="number" min={0} max={90} step={1} required inputMode="numeric" autoComplete="off" className="field" value={settingsDraft.savingPercent} onChange={(e) => setSettingsDraft({ ...settingsDraft, savingPercent: e.target.value })} /></Field><Field label="Запас, месяцев"><input type="number" min={0} max={120} step={1} required inputMode="numeric" autoComplete="off" className="field" value={settingsDraft.reserveMonths} onChange={(e) => setSettingsDraft({ ...settingsDraft, reserveMonths: e.target.value })} /></Field><Field label="Доход для прогноза"><select className="field" value={settings.incomeStrategy} onChange={(e) => setSettings({ ...settings, incomeStrategy: e.target.value as Settings["incomeStrategy"] })}><option>Худший месяц</option><option>Среднее за период</option><option>Среднее за 3 месяца</option></select></Field><Field label="Месяцев в статистике"><input type="number" min={1} max={60} step={1} required inputMode="numeric" autoComplete="off" className="field" value={settingsDraft.statsMonths} onChange={(e) => setSettingsDraft({ ...settingsDraft, statsMonths: e.target.value })} /></Field><Field label="Порог крупной траты, ₽"><input type="text" inputMode="decimal" autoComplete="off" className="field" value={settingsDraft.largeExpenseThreshold} onChange={(e) => setSettingsDraft({ ...settingsDraft, largeExpenseThreshold: e.target.value })} /></Field></div></Section><IncomeScheduleSettings schedule={settings.incomeSchedule} sources={incomeSourceDraft} onScheduleChange={(incomeSchedule) => setSettings({ ...settings, incomeSchedule })} onSourcesChange={setIncomeSourceDraft} /><Button className="min-h-11 gap-2" disabled={updateSettings.isPending}><Save className="h-4 w-4" />{updateSettings.isPending ? "Сохранение…" : "Сохранить настройки"}</Button></form></div>}

    {tab === "options" && <Section title="Списки дневника" description="Свои эмоции, темы и время суток появятся в форме записи. Удаление варианта не меняет уже сохранённые записи."><div className="mb-5 flex flex-wrap gap-2">{(["emotion", "topic", "time"] as const).map((k) => <button key={k} onClick={() => setOptionKind(k)} className={`min-h-11 rounded-lg px-4 text-sm ${optionKind === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{k === "emotion" ? "Эмоции" : k === "topic" ? "Темы" : "Время суток"}</button>)}</div><div className="flex flex-col gap-2 sm:flex-row"><input className="field" value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="Новый вариант" /><Button className="min-h-11" onClick={async () => { if (!newOption.trim()) return; try { await createOption.mutateAsync({ kind: optionKind, label: newOption.trim() }); setNewOption(""); await utils.workspace.get.invalidate(); } catch { toast.error("Такой вариант уже есть или нет соединения"); } }}>Добавить</Button></div><div className="mt-5 divide-y">{data.options.filter((o) => o.kind === optionKind).map((o) => <div key={o.id} className="flex min-h-12 items-center justify-between gap-3"><span className="text-sm">{o.label}</span><DeleteButton label={`Удалить «${o.label}»`} onConfirm={async () => { await deleteOption.mutateAsync({ id: o.id }); await utils.workspace.get.invalidate(); }} /></div>)}</div></Section>}

    {tab === "help" && <div className="grid gap-5 lg:grid-cols-2"><Section title="Как пользоваться" description="Простой ритм учёта, наблюдений и резервного копирования без требования заполнять все разделы."><div className="space-y-3 text-sm leading-relaxed"><p><b>Каждый вечер:</b> внесите траты в журнал и посмотрите главную. Короткая запись лучше пропущенного дня.</p><p><b>Раз в неделю:</b> пересчитайте кошелёк, сохраните сверку и сделайте резервную копию.</p><p><b>Раз в месяц:</b> проверьте лимиты, цели, запас и актуальные курсы валют. Оранжевые предварительные оценки заменяйте своими данными.</p><p><b>Обзор настроения:</b> просматривайте записи за выбранный период и отмечайте повторяющиеся темы. Дневник помогает наблюдать за состоянием, но не ставит диагнозы.</p><p><b>Откат данных:</b> выберите JSON-снимок или независимую SQLite-копию на вкладке «Копии и история». Перед восстановлением текущее состояние сохраняется.</p></div></Section><Section title="Хранение наличных" description="Общие рекомендации, которые можно адаптировать под свои привычки."><ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed"><li>Разделяйте средства на текущие расходы, обязательные платежи и резерв удобным для вас способом.</li><li>Выбирайте сухое и защищённое место, учитывая риски кражи, пожара и затопления.</li><li>Держите при себе только сумму на ближайшие расходы и пополняйте её по мере необходимости.</li><li>Не сообщайте посторонним о местах и суммах хранения. Для крупного резерва сравните домашнее хранение с банковскими вариантами.</li></ul></Section></div>}

    {tab === "help" && <Section title="О приложении" description="Точка опоры — приложение с открытым исходным кодом." className="mt-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-medium">Автор проекта — gankata</p><p className="mt-1 text-sm text-muted-foreground">© 2026 gankata</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="min-h-11"><a href="https://github.com/gankata/tochka-opory" target="_blank" rel="noreferrer">Исходный код</a></Button>
          <Button variant="ghost" asChild className="min-h-11"><a href="https://github.com/gankata/tochka-opory/blob/main/LICENSE" target="_blank" rel="noreferrer">Лицензия MIT</a></Button>
        </div>
      </div>
      <div className="mt-5 rounded-xl bg-secondary/45 p-4 text-sm leading-relaxed text-muted-foreground">
        <p>Записи хранятся локально на вашем компьютере. Приложение помогает вести учёт и самонаблюдение, но не заменяет финансового, юридического или медицинского специалиста.</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <a className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary" href="/PRIVACY.md" target="_blank" rel="noreferrer">Приватность · Privacy</a>
          <a className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary" href="/DISCLAIMER.md" target="_blank" rel="noreferrer">Ограничения ответственности · Disclaimer</a>
        </div>
      </div>
    </Section>}

    <FormDialog open={backupDialog} onOpenChange={setBackupDialog} title="Новая резервная копия" description="В снимок войдут настройки, операции, планы, цели, записи настроения, заметки, вишлисты, списки и сверки."><form onSubmit={(e) => { e.preventDefault(); void makeBackup(); }} className="space-y-5"><Field label="Название"><input required className="field" value={backupName} onChange={(e) => setBackupName(e.target.value)} /></Field><Button className="min-h-11 w-full" disabled={createBackup.isPending}>{createBackup.isPending ? "Создание…" : "Создать копию"}</Button></form></FormDialog>
  </div>;
}
