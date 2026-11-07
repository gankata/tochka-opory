import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Download, FileUp, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  exchangeCategoryOptions,
  incomeCategoryOptions,
  isIncomeOnlyCategory,
  normalizeOperationCategory,
} from "@contracts/operationCategories";
import {
  currencyDefinition,
  currencyDefinitions,
  currencyMoney,
  isCurrencyCode,
  type CurrencyCode,
} from "@contracts/currencies";
import { trpc } from "@/providers/trpc";
import type { Transaction, Workspace } from "@/types";
import {
  downloadBlob,
  formatDate,
  money,
  operationAmount,
  operationCurrency,
  todayISO,
  toCsv,
} from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import {
  AddButton,
  DeleteButton,
  EmptyState,
  ErrorPage,
  Field,
  FormDialog,
  LoadingPage,
  PageHeader,
} from "@/components/app/Common";
import { CategoryBadge } from "@/components/app/CategoryBadge";
import { CategoryCombobox } from "@/components/app/CategoryCombobox";
import { DatePicker } from "@/components/app/DatePicker";
import { queueOfflineOperation, readOfflineOperations, writeOfflineOperations, type OfflineOperation } from "@/lib/offline-operations";

type OperationType = Transaction["type"];
type ExchangeDirection = "buy" | "sell";
type FormState = {
  operationDate: string;
  type: OperationType;
  category: string;
  currency: CurrencyCode;
  originalAmount: string;
  exchangeRate: string;
  amountRub: string;
  exchangeDirection: ExchangeDirection;
  note: string;
};

const emptyForm = (date = todayISO()): FormState => ({
  operationDate: date,
  type: "Расход",
  category: "",
  currency: "RUB",
  originalAmount: "",
  exchangeRate: "1",
  amountRub: "",
  exchangeDirection: "buy",
  note: "",
});

const toForm = (transaction: Transaction): FormState => {
  const code = operationCurrency(transaction);
  const originalAmount = operationAmount(transaction);
  return {
    operationDate: transaction.operationDate,
    type: transaction.type,
    category: transaction.category,
    currency: isCurrencyCode(code) ? code : "RUB",
    originalAmount: String(Math.abs(originalAmount)),
    exchangeRate: String(
      transaction.exchangeRate ??
        (originalAmount ? Math.abs(transaction.amountRub / originalAmount) : 1),
    ),
    amountRub: String(Math.abs(transaction.amountRub)),
    exchangeDirection: originalAmount < 0 ? "sell" : "buy",
    note: transaction.note ?? "",
  };
};

function uniqueCategories(values: string[]) {
  const result = new Map<string, string>();
  for (const value of values) {
    const category = value.trim();
    if (category && !result.has(normalizeOperationCategory(category))) {
      result.set(normalizeOperationCategory(category), category);
    }
  }
  return Array.from(result.values());
}

function categoryOptions(type: OperationType, data: Workspace) {
  const history = data.transactions
    .filter((transaction) => transaction.type === type)
    .map((transaction) => transaction.category);
  if (type === "Доход") {
    return uniqueCategories([...incomeCategoryOptions, ...history]);
  }
  if (type === "Обмен") {
    return uniqueCategories([...exchangeCategoryOptions, ...history]);
  }
  const incomeCategories = new Set(
    data.transactions
      .filter((transaction) => transaction.type === "Доход")
      .map((transaction) => normalizeOperationCategory(transaction.category)),
  );
  return uniqueCategories([
    ...data.envelopes.map((envelope) => envelope.name),
    ...data.payments.map((payment) => payment.name),
    ...history,
  ]).filter(
    (category) =>
      !isIncomeOnlyCategory(category) &&
      !incomeCategories.has(normalizeOperationCategory(category)),
  );
}

function TransactionAmount({ transaction }: { transaction: Transaction }) {
  const currency = operationCurrency(transaction);
  const originalAmount = operationAmount(transaction);
  const sign =
    transaction.type === "Обмен"
      ? originalAmount >= 0
        ? "+"
        : "−"
      : transaction.type === "Расход"
        ? "−"
        : "+";

  return (
    <>
      {sign}
      {currencyMoney(Math.abs(originalAmount), currency)}
      {currency !== "RUB" && (
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {transaction.type === "Обмен" && (
            <>
              {transaction.amountRub >= 0 ? "+" : "−"}
              {money(Math.abs(transaction.amountRub))} ·{" "}
            </>
          )}
          {transaction.type !== "Обмен" && <>≈ {money(transaction.amountRub)} · </>}
          курс {transaction.exchangeRate ?? "—"}
        </span>
      )}
    </>
  );
}

export default function Transactions() {
  const query = trpc.workspace.get.useQuery();
  const utils = trpc.useUtils();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("Все");
  const [currencyFilter, setCurrencyFilter] = useState("Все");
  const [month, setMonth] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const create = trpc.workspace.transactionCreate.useMutation();
  const update = trpc.workspace.transactionUpdate.useMutation();
  const remove = trpc.workspace.transactionDelete.useMutation();
  const bulkCategorize = trpc.imports.bulkCategorize.useMutation();
  const bulkDelete = trpc.imports.bulkDelete.useMutation();
  const [offlineCount, setOfflineCount] = useState(() => readOfflineOperations().length);

  useEffect(() => {
    const flush = async () => {
      if (!navigator.onLine) return;
      const queue = readOfflineOperations(); const remaining: OfflineOperation[] = [];
      for (const operation of queue) {
        try { await create.mutateAsync(operation); } catch { remaining.push(operation); }
      }
      writeOfflineOperations(remaining); setOfflineCount(remaining.length);
      if (queue.length > remaining.length) { await utils.workspace.get.invalidate(); toast.success(`Отложенные операции синхронизированы: ${queue.length - remaining.length}`); }
    };
    const count = () => setOfflineCount(readOfflineOperations().length);
    window.addEventListener("online", flush); window.addEventListener("tochka-offline-queue", count);
    void flush();
    return () => { window.removeEventListener("online", flush); window.removeEventListener("tochka-offline-queue", count); };
  }, [create, utils]);

  /* URL search params are an external state source for this dialog. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (params.get("new") === "1") {
      const requestedType = params.get("type");
      const operationType: OperationType = requestedType === "Доход" || requestedType === "Обмен" ? requestedType : "Расход";
      setEditing(null);
      setForm({ ...emptyForm(params.get("date") || todayISO()), type: operationType });
      setOpen(true);
    }
  }, [params]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const close = () => {
    setOpen(false);
    setEditing(null);
    if (params.has("new")) setParams({});
  };
  const edit = (transaction: Transaction) => {
    setEditing(transaction);
    setForm(toForm(transaction));
    setOpen(true);
  };
  const refresh = () => utils.workspace.get.invalidate();
  const data = query.data;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    const category = form.category.trim().replace(/\s+/g, " ");
    const usedForIncome = data.transactions.some(
      (transaction) =>
        transaction.type === "Доход" &&
        normalizeOperationCategory(transaction.category) ===
          normalizeOperationCategory(category),
    );
    if (
      form.type === "Расход" &&
      (isIncomeOnlyCategory(category) || usedForIncome)
    ) {
      toast.error(
        "Это категория дохода. Выберите категорию траты или измените тип операции.",
      );
      return;
    }

    const enteredOriginal = Math.abs(Number(form.originalAmount));
    const enteredRub = Math.abs(Number(form.amountRub));
    let originalAmount = enteredOriginal;
    let amountRub = enteredRub;
    let exchangeRate = Number(form.exchangeRate);

    if (form.type === "Обмен") {
      originalAmount =
        enteredOriginal * (form.exchangeDirection === "buy" ? 1 : -1);
      amountRub = enteredRub * (form.exchangeDirection === "buy" ? -1 : 1);
      exchangeRate = enteredOriginal > 0 ? enteredRub / enteredOriginal : 0;
    } else if (form.currency === "RUB") {
      originalAmount = enteredRub;
      exchangeRate = 1;
    } else {
      amountRub = enteredOriginal * exchangeRate;
    }

    const payload = {
      operationDate: form.operationDate,
      type: form.type,
      category,
      currency: form.currency,
      originalAmount,
      exchangeRate,
      amountRub,
      amountUsd:
        form.type === "Обмен" && form.currency === "USD"
          ? originalAmount
          : null,
      note: form.note || null,
      source: editing?.source ?? "Веб-приложение",
      clientId: editing?.clientId ?? crypto.randomUUID(),
    };
    if (
      !payload.category ||
      !Number.isFinite(payload.amountRub) ||
      !Number.isFinite(payload.originalAmount) ||
      payload.originalAmount === 0 ||
      payload.amountRub === 0
    ) {
      toast.error("Заполните категорию и ненулевые суммы операции");
      return;
    }
    if (form.currency !== "RUB" && !(exchangeRate > 0)) {
      toast.error("Укажите курс: сколько рублей стоит одна единица валюты");
      return;
    }

    if (!editing && !navigator.onLine) {
      queueOfflineOperation(payload); setOfflineCount(readOfflineOperations().length);
      toast.success("Операция сохранена в очереди этого браузера и отправится при восстановлении связи"); close(); return;
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      await refresh();
      toast.success(editing ? "Операция обновлена" : "Операция сохранена");
      close();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(
        /категор|валют|курс|сумм|обмен/i.test(message)
          ? message
          : "Не удалось сохранить. Проверьте соединение и повторите.",
      );
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const focusId = Number(params.get("focus"));
    if (Number.isInteger(focusId) && focusId > 0) return data.transactions.filter((transaction) => transaction.id === focusId);
    const normalizedSearch = search.trim().toLocaleLowerCase("ru-RU");
    return data.transactions.filter(
      (transaction) =>
        (!normalizedSearch ||
          `${transaction.category} ${transaction.note ?? ""} ${operationCurrency(transaction)}`
            .toLocaleLowerCase("ru-RU")
            .includes(normalizedSearch)) &&
        (type === "Все" || transaction.type === type) &&
        (currencyFilter === "Все" ||
          operationCurrency(transaction) === currencyFilter) &&
        (!month || transaction.operationDate.startsWith(month)),
    );
  }, [data, search, type, currencyFilter, month, params]);

  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !data) return <ErrorPage retry={() => query.refetch()} />;

  const categories = categoryOptions(form.type, data);
  const today = todayISO();
  const actualFiltered = filtered.filter((transaction) => transaction.operationDate <= today);
  const visibleTransactions = filtered.slice(0, visibleLimit);
  const futureCount = filtered.length - actualFiltered.length;
  const usedCurrencies = Array.from(
    new Set(data.transactions.map((transaction) => operationCurrency(transaction))),
  );
  const filteredIncome = actualFiltered
    .filter((transaction) => transaction.type === "Доход")
    .reduce((sum, transaction) => sum + transaction.amountRub, 0);
  const filteredExpense = actualFiltered
    .filter((transaction) => transaction.type === "Расход")
    .reduce((sum, transaction) => sum + transaction.amountRub, 0);
  const currentRate = (code: CurrencyCode) =>
    code === "RUB"
      ? 1
      : code === "USD"
        ? data.settings.usdRate
        : data.settings.currencyRates?.[code] ?? "";
  const equivalentRub =
    form.type === "Обмен"
      ? Number(form.amountRub)
      : form.currency === "RUB"
        ? Number(form.amountRub)
        : Number(form.originalAmount) * Number(form.exchangeRate);
  const exchangeRatePreview =
    Number(form.originalAmount) > 0
      ? Number(form.amountRub) / Number(form.originalAmount)
      : 0;

  const changeCurrency = (currency: CurrencyCode) => {
    setForm({
      ...form,
      currency,
      exchangeRate: String(currentRate(currency)),
      originalAmount: "",
    });
  };
  const changeType = (nextType: OperationType) => {
    const currency =
      nextType === "Обмен" && form.currency === "RUB" ? "USD" : form.currency;
    setForm({
      ...form,
      type: nextType,
      category: "",
      currency,
      exchangeRate: String(currentRate(currency)),
    });
  };

  const exportCsv = () => {
    downloadBlob(
      toCsv([
        [
          "Дата",
          "Тип",
          "Категория",
          "Валюта",
          "Сумма в валюте",
          "Курс к RUB",
          "Рублёвый эквивалент",
          "Комментарий",
          "Источник",
        ],
        ...filtered.map((transaction) => [
          transaction.operationDate,
          transaction.type,
          transaction.category,
          operationCurrency(transaction),
          operationAmount(transaction),
          transaction.exchangeRate,
          transaction.amountRub,
          transaction.note,
          transaction.source,
        ]),
      ]),
      `operations-${todayISO()}.csv`,
      "text/csv;charset=utf-8",
    );
    toast.success(`Выгружено операций: ${filtered.length}`);
  };
  const deleteTransaction = async (id: number) => {
    try {
      await remove.mutateAsync({ id });
      await refresh();
      toast.success("Операция удалена");
    } catch {
      toast.error("Не удалось удалить");
    }
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Финансовый редактор"
        title="Журнал операций"
        description="Доходы, траты и обмен в рублях и других валютах. Курс каждой операции сохраняется отдельно."
        action={<div className="flex flex-col gap-2 sm:flex-row">
          <Link to="/data?tab=imports" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium"><FileUp className="h-4 w-4" />Импорт</Link>
          <AddButton label="Добавить операцию" onClick={() => { setEditing(null); setForm(emptyForm()); setOpen(true); }} />
        </div>}
      />
      {offlineCount > 0 && <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm" role="status">В очереди этого браузера: {offlineCount}. Не очищайте данные сайта до синхронизации. Очередь не переносится сама на другое устройство.</div>}

      <div className="mb-5 grid gap-3 rounded-2xl bg-secondary/55 p-4 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(180px,1fr)_140px_140px_160px_auto]">
        <label className="relative block md:col-span-2 xl:col-span-1">
          <span className="sr-only">Поиск операций</span>
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="field pl-9"
            placeholder="Категория, валюта или комментарий"
          />
        </label>
        <label>
          <span className="sr-only">Тип операции</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="field"
          >
            <option>Все</option>
            <option>Доход</option>
            <option>Расход</option>
            <option>Обмен</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Валюта операции</span>
          <select
            value={currencyFilter}
            onChange={(event) => setCurrencyFilter(event.target.value)}
            className="field"
          >
            <option value="Все">Все валюты</option>
            {usedCurrencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Месяц</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="field"
          />
        </label>
        <Button
          variant="outline"
          onClick={exportCsv}
          className="min-h-11 gap-2 bg-card"
        >
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">
          Найдено: <b className="text-foreground">{filtered.length}</b>
        </span>
        <span className="text-muted-foreground">
          Доход: <b className="number text-primary">+{money(filteredIncome)}</b>
        </span>
        <span className="text-muted-foreground">
          Расход: <b className="number">−{money(filteredExpense)}</b>
        </span>
        {(search || month || type !== "Все" || currencyFilter !== "Все" || params.has("focus")) && (
          <button
            className="min-h-11 font-medium text-primary"
            onClick={() => {
              setSearch("");
              setMonth("");
              setType("Все");
              setCurrencyFilter("Все");
              if (params.has("focus")) setParams({});
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>
      <p className="mb-5 text-xs text-muted-foreground">
        Итоги доходов и расходов указаны в ₽ по курсу каждой операции и включают только фактические записи до сегодняшнего дня.{futureCount > 0 ? ` Запланировано на будущее: ${futureCount}; они не меняют текущий остаток и итоги.` : ""}
      </p>

      {selected.size > 0 && <div className="sticky top-2 z-20 mb-4 flex flex-col gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur md:flex-row md:items-center" role="region" aria-label="Массовые действия">
        <p className="flex-1 text-sm font-medium">Выбрано: {selected.size}</p>
        <select aria-label="Новая категория выбранных операций" className="field md:max-w-56" value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}><option value="">Новая категория…</option>{categoryOptions("Расход", data).map((category) => <option key={category}>{category}</option>)}</select>
        <Button variant="outline" className="min-h-11" disabled={!bulkCategory || bulkCategorize.isPending} onClick={async () => { try { const result = await bulkCategorize.mutateAsync({ ids: [...selected], category: bulkCategory }); setSelected(new Set()); setBulkCategory(""); await refresh(); toast.success(`Изменено операций: ${result.updated}`); } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось изменить категории"); } }}>Изменить категорию</Button>
        <Button variant="outline" className="min-h-11 gap-2 text-destructive" disabled={bulkDelete.isPending} onClick={async () => { if (!window.confirm(`Удалить выбранные операции: ${selected.size}? Перед удалением будет создан снимок.`)) return; try { const result = await bulkDelete.mutateAsync({ ids: [...selected] }); setSelected(new Set()); await refresh(); toast.success(`Удалено: ${result.deleted}. Снимок доступен в разделе «Данные»`); } catch { toast.error("Не удалось удалить операции"); } }}><Trash2 className="h-4 w-4" />Удалить</Button>
        <Button variant="ghost" className="min-h-11" onClick={() => setSelected(new Set())}>Снять выбор</Button>
      </div>}

      {filtered.length ? (
        <div className="surface overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-secondary/45 text-xs text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-3"><input type="checkbox" className="h-5 w-5 accent-primary" aria-label="Выбрать показанные операции" checked={visibleTransactions.length > 0 && visibleTransactions.every((item) => selected.has(item.id))} onChange={(event) => { const next = new Set(selected); visibleTransactions.forEach((item) => event.target.checked ? next.add(item.id) : next.delete(item.id)); setSelected(next); }} /></th>
                  <th className="px-3 py-3 font-medium">Дата</th>
                  <th className="px-3 py-3 font-medium">Категория</th>
                  <th className="px-3 py-3 font-medium">Тип</th>
                  <th className="px-3 py-3 text-right font-medium">Сумма</th>
                  <th className="px-3 py-3 font-medium">Комментарий</th>
                  <th className="w-28 px-3 py-3"><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleTransactions.map((transaction) => (
                  <tr key={transaction.id} className={`group hover:bg-secondary/25 ${selected.has(transaction.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3"><input type="checkbox" className="h-5 w-5 accent-primary" aria-label={`Выбрать операцию ${transaction.category} от ${transaction.operationDate}`} checked={selected.has(transaction.id)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(transaction.id); else next.delete(transaction.id); setSelected(next); }} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {formatDate(transaction.operationDate)}
                    </td>
                    <td className="px-3 py-3 font-medium">
                      <CategoryBadge name={transaction.category} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {transaction.type}
                      {transaction.operationDate > today && <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">Запланировано</span>}
                    </td>
                    <td
                      className={`number whitespace-nowrap px-3 py-3 text-right font-semibold ${transaction.type === "Доход" ? "text-primary" : ""}`}
                    >
                      <TransactionAmount transaction={transaction} />
                    </td>
                    <td
                      className="max-w-64 truncate px-3 py-3 text-muted-foreground"
                      title={transaction.note ?? ""}
                    >
                      {transaction.note || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => edit(transaction)}
                        aria-label={`Изменить ${transaction.category}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        label="Удалить операцию"
                        onConfirm={() => deleteTransaction(transaction.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {visibleTransactions.map((transaction) => (
              <article key={transaction.id} className={`p-4 ${selected.has(transaction.id) ? "bg-primary/5" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" aria-label={`Выбрать операцию ${transaction.category}`} checked={selected.has(transaction.id)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(transaction.id); else next.delete(transaction.id); setSelected(next); }} />
                  <div className="min-w-0 flex-1">
                    <CategoryBadge name={transaction.category} />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatDate(transaction.operationDate)} · {transaction.type}{transaction.operationDate > today ? " · запланировано" : ""}
                    </p>
                  </div>
                  <p
                    className={`number whitespace-nowrap text-right text-lg font-semibold ${transaction.type === "Доход" ? "text-primary" : ""}`}
                  >
                    <TransactionAmount transaction={transaction} />
                  </p>
                </div>
                {transaction.note && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {transaction.note}
                  </p>
                )}
                <div className="mt-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => edit(transaction)}
                    aria-label="Изменить"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteButton
                    label="Удалить операцию"
                    onConfirm={() => deleteTransaction(transaction.id)}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="Операции не найдены"
          text="Измените фильтры или добавьте новую запись."
          action={
            <AddButton
              label="Добавить операцию"
              onClick={() => {
                setForm(emptyForm());
                setOpen(true);
              }}
            />
          }
        />
      )}

      {visibleTransactions.length < filtered.length && <div className="mt-5 flex flex-col items-center gap-2" aria-live="polite"><p className="text-xs text-muted-foreground">Показано {visibleTransactions.length} из {filtered.length}</p><Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setVisibleLimit((limit) => limit + 50)}>Показать ещё · осталось {filtered.length - visibleTransactions.length}</Button></div>}

      <FormDialog
        open={open}
        onOpenChange={(value) => (value ? setOpen(true) : close())}
        title={editing ? "Изменить операцию" : "Новая операция"}
        description="Для валютной операции сохраняются исходная сумма, курс к рублю и рублёвый эквивалент."
      >
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Дата">
              <DatePicker
                required
                aria-label="Дата"
                value={form.operationDate}
                onChange={(operationDate) => setForm({ ...form, operationDate })}
              />
            </Field>
            <Field label="Тип">
              <select
                className="field"
                value={form.type}
                onChange={(event) => changeType(event.target.value as OperationType)}
              >
                <option>Расход</option>
                <option>Доход</option>
                <option>Обмен</option>
              </select>
            </Field>
          </div>
          <Field
            label="Категория"
            hint={
              form.type === "Доход"
                ? "Зарплата и другие поступления доступны только для дохода."
                : form.type === "Расход"
                  ? "Начните вводить название — список отфильтруется по тексту."
                  : "Обмен происходит между рублями и выбранной валютой."
            }
          >
            <CategoryCombobox
              value={form.category}
              options={categories}
              onChange={(category) => setForm({ ...form, category })}
              type={form.type}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={form.type === "Обмен" ? "Валюта обмена" : "Валюта операции"}>
              <select
                className="field"
                value={form.currency}
                onChange={(event) => changeCurrency(event.target.value as CurrencyCode)}
              >
                {currencyDefinitions
                  .filter(
                    (currency) => form.type !== "Обмен" || currency.code !== "RUB",
                  )
                  .map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </option>
                  ))}
              </select>
            </Field>
            {form.type === "Обмен" && (
              <Field label="Направление обмена">
                <select
                  className="field"
                  value={form.exchangeDirection}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      exchangeDirection: event.target.value as ExchangeDirection,
                    })
                  }
                >
                  <option value="buy">Купил {form.currency} за рубли</option>
                  <option value="sell">Продал {form.currency} за рубли</option>
                </select>
              </Field>
            )}
          </div>

          {form.type === "Обмен" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Сумма, ${form.currency}`}>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="field"
                    value={form.originalAmount}
                    onChange={(event) =>
                      setForm({ ...form, originalAmount: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label={
                    form.exchangeDirection === "buy"
                      ? "Отдано, ₽"
                      : "Получено, ₽"
                  }
                >
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="field"
                    value={form.amountRub}
                    onChange={(event) =>
                      setForm({ ...form, amountRub: event.target.value })
                    }
                  />
                </Field>
              </div>
              {exchangeRatePreview > 0 && (
                <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
                  Курс обмена: <b className="number text-foreground">1 {form.currency} = {money(exchangeRatePreview)}</b>. Он сохранится в операции.
                </p>
              )}
            </>
          ) : form.currency === "RUB" ? (
            <Field label="Сумма, ₽">
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                className="field"
                value={form.amountRub}
                onChange={(event) =>
                  setForm({ ...form, amountRub: event.target.value })
                }
              />
            </Field>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={`Сумма, ${form.currency}`}
                  hint={`Остаток ${form.currency} изменится именно на эту сумму.`}
                >
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="field"
                    value={form.originalAmount}
                    onChange={(event) =>
                      setForm({ ...form, originalAmount: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label={`Курс, ₽ за 1 ${form.currency}`}
                  hint="Можно указать фактический курс чека или банка."
                >
                  <input
                    required
                    type="number"
                    step="0.000001"
                    min="0.000001"
                    className="field"
                    value={form.exchangeRate}
                    onChange={(event) =>
                      setForm({ ...form, exchangeRate: event.target.value })
                    }
                  />
                </Field>
              </div>
              {equivalentRub > 0 && (
                <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
                  Рублёвый эквивалент: <b className="number text-foreground">{money(equivalentRub)}</b>. Он будет использован в месячной аналитике, а курс сохранится в записи.
                </p>
              )}
            </>
          )}

          {form.type === "Расход" &&
            equivalentRub >= (data.settings?.largeExpenseThreshold ?? 10000) && (
              <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900 dark:bg-orange-950/50 dark:text-orange-100">
                Это крупная трата по вашему порогу. Проверьте сумму перед сохранением.
              </p>
            )}
          <Field label="Комментарий">
            <textarea
              className="field-area"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder={`Необязательно${form.currency !== "RUB" ? ` · ${currencyDefinition(form.currency).name}` : ""}`}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              className="min-h-11"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="min-h-11"
            >
              {create.isPending || update.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
