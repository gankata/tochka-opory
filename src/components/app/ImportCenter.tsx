import { useState } from "react";
import { Download, FileUp, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { csvFields, guessMapping, mapCsvRows, parseCsv, parseOfxRows, type CsvMapping, type CsvTable, type ImportRow } from "@/lib/transaction-import";
import { createRulePack, parseRulePack } from "@/lib/rule-pack";
import { downloadBlob, formatDateTime, money } from "@/lib/utils-app";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, Section } from "./Common";

const fieldLabels: Record<(typeof csvFields)[number], string> = {
  date: "Дата", type: "Тип", category: "Категория", amount: "Сумма", currency: "Валюта", rate: "Курс", note: "Комментарий", source: "Источник", externalId: "ID операции",
};
const emptyMapping = Object.fromEntries(csvFields.map((field) => [field, ""])) as CsvMapping;

export default function ImportCenter() {
  const utils = trpc.useUtils();
  const workspace = trpc.workspace.get.useQuery();
  const rules = trpc.imports.rules.useQuery();
  const batches = trpc.imports.batches.useQuery();
  const importRows = trpc.imports.importTransactions.useMutation();
  const rollback = trpc.imports.rollback.useMutation();
  const ruleCreate = trpc.imports.ruleCreate.useMutation();
  const ruleUpdate = trpc.imports.ruleUpdate.useMutation();
  const ruleDelete = trpc.imports.ruleDelete.useMutation();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"csv" | "ofx">("csv");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>(emptyMapping);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [rule, setRule] = useState({ name: "", pattern: "", category: "", matchField: "any" as "any" | "source" | "note" | "category" });
  const rates = workspace.data?.settings?.currencyRates ?? {};

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setName(file.name); setRows([]); setErrors([]); setTable(null);
    try {
      const text = await file.text();
      if (/\.(ofx|qfx)$/i.test(file.name)) {
        setFormat("ofx");
        const parsed = parseOfxRows(text, rates);
        setRows(parsed.rows); setErrors(parsed.errors);
      } else {
        setFormat("csv");
        const parsed = parseCsv(text);
        const guessed = guessMapping(parsed.headers);
        setTable(parsed); setMapping(guessed);
        const mapped = mapCsvRows(parsed, guessed, rates);
        setRows(mapped.rows); setErrors(mapped.errors);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Не удалось прочитать файл"]);
    }
  };
  const remap = (next: CsvMapping) => {
    setMapping(next);
    if (!table) return;
    const parsed = mapCsvRows(table, next, rates);
    setRows(parsed.rows); setErrors(parsed.errors);
  };
  const refresh = async () => {
    await Promise.all([utils.workspace.get.invalidate(), utils.imports.rules.invalidate(), utils.imports.batches.invalidate(), utils.workspace.backupList.invalidate()]);
  };
  const runImport = async () => {
    if (!rows.length || rows.length > 5000) return;
    try {
      const result = await importRows.mutateAsync({ name: name || "Банковский файл", format, rows });
      toast.success(`Добавлено: ${result.imported}. Дублей пропущено: ${result.duplicates}`);
      setRows([]); setTable(null); setName(""); setErrors([]);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Импорт не выполнен"); }
  };
  const exportRules = () => {
    if (!rules.data?.length) { toast.error("Сначала добавьте хотя бы одно правило"); return; }
    const pack = createRulePack(rules.data.map(({ name, matchField, pattern, operationType, category, priority, enabled }) => ({ name, matchField, pattern, operationType, category, priority, enabled })));
    downloadBlob(JSON.stringify(pack, null, 2), "tochka-opory-rules.json", "application/json;charset=utf-8");
  };
  const importRulePack = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Пакет правил превышает 1 МБ");
      const items = parseRulePack(await file.text());
      for (const item of items) await ruleCreate.mutateAsync(item);
      await utils.imports.rules.invalidate();
      toast.success(`Добавлено правил: ${items.length}. Выполнение кода из файла не допускается.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось импортировать правила"); }
  };

  return <div className="space-y-5">
    <Section title="Импорт банковских операций" description="CSV, OFX и QFX обрабатываются на этом устройстве. Перед записью создаётся снимок, повторы не добавляются, весь пакет можно отменить." action={<label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><FileUp className="h-4 w-4" />Выбрать файл<input type="file" accept=".csv,.ofx,.qfx,text/csv" className="sr-only" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></label>}>
      {!name && <EmptyState title="Начните с выписки" text="Для CSV нужны дата и сумма. Остальные столбцы можно сопоставить вручную. Один файл — до 5000 операций." />}
      {name && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/45 p-4"><div><p className="font-medium">{name}</p><p className="mt-1 text-sm text-muted-foreground">Готово к импорту: {rows.length} · ошибок: {errors.length}</p></div><Button disabled={!rows.length || importRows.isPending} onClick={() => void runImport()}>{importRows.isPending ? "Импорт…" : `Импортировать ${rows.length}`}</Button></div>
        {table && <div><h3 className="mb-3 text-sm font-semibold">Соответствие столбцов</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{csvFields.map((field) => <Field key={field} label={fieldLabels[field]}><select className="field" value={mapping[field]} onChange={(event) => remap({ ...mapping, [field]: event.target.value })}><option value="">Не использовать</option>{table.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></Field>)}</div></div>}
        {errors.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="text-sm font-medium">Строки с ошибками не попадут в импорт</p><ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">{errors.slice(0, 30).map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>{errors.length > 30 && <p className="mt-2 text-xs">И ещё {errors.length - 30}</p>}</div>}
        {rows.length > 0 && <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[650px] text-sm"><thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="p-3">Дата</th><th className="p-3">Источник</th><th className="p-3">Категория</th><th className="p-3 text-right">Сумма</th></tr></thead><tbody className="divide-y">{rows.slice(0, 10).map((row, index) => <tr key={`${row.externalId}-${index}`}><td className="p-3">{row.operationDate}</td><td className="max-w-48 truncate p-3">{row.source}</td><td className="p-3">{row.category}</td><td className="number p-3 text-right">{money(row.amountRub)}</td></tr>)}</tbody></table>{rows.length > 10 && <p className="p-3 text-xs text-muted-foreground">Показаны первые 10 из {rows.length}</p>}</div>}
      </div>}
    </Section>

    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Правила категорий" description="Декларативные расширения: только текстовые условия, без выполнения чужого кода. При импорте срабатывает первое включённое правило с наименьшим приоритетом." action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11 gap-2" onClick={exportRules}><Download className="h-4 w-4" />Экспорт</Button><label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium"><Upload className="h-4 w-4" />Импорт<input aria-label="Импорт пакета правил" type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void importRulePack(event.target.files?.[0]); event.target.value = ""; }} /></label></div>}>
        <form className="mb-5 grid gap-3 rounded-xl bg-secondary/35 p-4 sm:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); try { await ruleCreate.mutateAsync({ ...rule, operationType: "Любой", priority: 100, enabled: true }); setRule({ name: "", pattern: "", category: "", matchField: "any" }); await utils.imports.rules.invalidate(); toast.success("Правило добавлено"); } catch { toast.error("Заполните все поля правила"); } }}>
          <Field label="Название"><input required className="field" value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} placeholder="Кофейни" /></Field>
          <Field label="Текст для поиска"><input required className="field" value={rule.pattern} onChange={(event) => setRule({ ...rule, pattern: event.target.value })} placeholder="coffee" /></Field>
          <Field label="Где искать"><select className="field" value={rule.matchField} onChange={(event) => setRule({ ...rule, matchField: event.target.value as typeof rule.matchField })}><option value="any">Везде</option><option value="source">Источник</option><option value="note">Комментарий</option><option value="category">Категория</option></select></Field>
          <Field label="Новая категория"><input required className="field" value={rule.category} onChange={(event) => setRule({ ...rule, category: event.target.value })} placeholder="Кафе" /></Field>
          <Button className="min-h-11 gap-2 sm:col-span-2" disabled={ruleCreate.isPending}><Plus className="h-4 w-4" />Добавить правило</Button>
        </form>
        <div className="divide-y">{rules.data?.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className={`text-sm font-medium ${!item.enabled ? "opacity-50" : ""}`}>{item.name}</p><p className="truncate text-xs text-muted-foreground">«{item.pattern}» → {item.category} · приоритет {item.priority}</p></div><Button variant="ghost" className="min-h-11" onClick={async () => { await ruleUpdate.mutateAsync({ id: item.id, enabled: !item.enabled }); await utils.imports.rules.invalidate(); }}>{item.enabled ? "Пауза" : "Включить"}</Button><Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Удалить правило ${item.name}`} onClick={async () => { await ruleDelete.mutateAsync({ id: item.id }); await utils.imports.rules.invalidate(); }}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      </Section>
      <Section title="Пакеты импорта" description="Откат удаляет только операции выбранного пакета. Перед откатом сохраняется ещё один снимок.">
        {batches.data?.length ? <div className="divide-y">{batches.data.map((batch) => <div key={batch.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{batch.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(batch.createdAt)} · {batch.rowCount} операций · дублей {batch.duplicateCount}{batch.status === "rolledBack" ? " · отменён" : ""}</p></div>{batch.status === "active" && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="min-h-11 gap-2"><RotateCcw className="h-4 w-4" />Отменить</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Отменить весь импорт?</AlertDialogTitle><AlertDialogDescription>Будут удалены {batch.rowCount} операций из пакета «{batch.name}». Остальные записи не изменятся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Оставить</AlertDialogCancel><AlertDialogAction onClick={async () => { try { await rollback.mutateAsync({ id: batch.id }); await refresh(); toast.success("Импорт отменён"); } catch { toast.error("Не удалось отменить импорт"); } }}>Отменить импорт</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>)}</div> : <EmptyState title="Пакетов пока нет" text="Здесь появится история импортов и кнопки отката." />}
      </Section>
    </div>
  </div>;
}
