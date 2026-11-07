import { useState, type FormEvent } from "react";
import { Check, Copy, KeySquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { formatDateTime } from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import { EmptyState, Field } from "./Common";

export default function ApiAccess() {
  const tokens = trpc.access.tokens.useQuery();
  const create = trpc.access.createToken.useMutation();
  const revoke = trpc.access.revokeToken.useMutation();
  const utils = trpc.useUtils();
  const [name, setName] = useState("Мой скрипт");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [expiresDays, setExpiresDays] = useState("30");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await create.mutateAsync({ name, scope, expiresDays: expiresDays ? Number(expiresDays) : null });
      setSecret(result.token); setCopied(false); await utils.access.tokens.invalidate();
    } catch { toast.error("Не удалось создать токен"); }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(secret); setCopied(true); toast.success("Токен скопирован");
  };
  const remove = async (id: number) => {
    try { await revoke.mutateAsync({ id }); await utils.access.tokens.invalidate(); toast.success("Доступ по токену отозван"); }
    catch { toast.error("Не удалось отозвать токен"); }
  };

  return <div className="mt-7 border-t pt-6">
    <div className="flex items-start gap-3"><KeySquare className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><h3 className="font-semibold">Локальный API</h3><p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Для своих скриптов и безопасных интеграций. По умолчанию доступ закрыт; чужой JavaScript приложение не выполняет. Адрес API: <code>/api/v1/</code>.</p></div></div>
    <form onSubmit={submit} className="mt-5 grid items-end gap-4 md:grid-cols-4">
      <Field label="Название токена"><input required maxLength={100} className="field" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Права"><select aria-label="Права" className="field" value={scope} onChange={(event) => setScope(event.target.value as "read" | "write")}><option value="read">Только чтение</option><option value="write">Чтение и добавление операций</option></select></Field>
      <Field label="Срок, дней" hint="Пусто — без срока"><input type="number" min="1" max="365" className="field" value={expiresDays} onChange={(event) => setExpiresDays(event.target.value)} /></Field>
      <Button className="min-h-11" disabled={create.isPending}>Создать токен</Button>
    </form>
    {secret && <div role="status" className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="text-sm font-semibold">Сохраните токен сейчас</p><p className="mt-1 text-sm text-muted-foreground">После обновления страницы секрет больше не будет показан. В базе хранится только его хеш.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-card px-3 py-3 text-xs" aria-label="Новый токен API">{secret}</code><Button type="button" variant="outline" className="min-h-11 shrink-0 gap-2" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Скопировать</Button></div></div>}
    <div className="mt-5">{tokens.data?.length ? <div className="divide-y rounded-xl border px-4">{tokens.data.map((token) => <article key={token.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{token.name} <code className="ml-1 text-xs text-muted-foreground">{token.prefix}…</code></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{token.scope === "read" ? "Чтение" : "Чтение и запись"} · создан {formatDateTime(token.createdAt)}{token.expiresAt ? ` · до ${formatDateTime(token.expiresAt)}` : ""}{token.lastUsedAt ? ` · использован ${formatDateTime(token.lastUsedAt)}` : ""}</p></div><Button type="button" variant="ghost" className="min-h-11 gap-2 self-start text-destructive sm:self-auto" disabled={revoke.isPending} onClick={() => remove(token.id)}><Trash2 className="h-4 w-4" />Отозвать</Button></article>)}</div> : <EmptyState title="Токенов нет" text="Обычному использованию приложения с компьютера и телефона API не нужен." />}</div>
    <details className="mt-5 rounded-xl bg-secondary/45 p-4 text-sm"><summary className="min-h-11 cursor-pointer font-medium leading-10">Пример запроса</summary><pre className="mt-2 overflow-x-auto text-xs leading-relaxed"><code>{`curl -H "Authorization: Bearer ВАШ_ТОКЕН" \\
  "http://127.0.0.1:7100/api/v1/transactions?limit=10"`}</code></pre><p className="mt-3 leading-relaxed text-muted-foreground">GET доступны transactions, assets и notes. POST /transactions добавляет операцию только токеном с записью. Не помещайте токен в URL, заметки или публичный репозиторий.</p></details>
  </div>;
}
