import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Field, Section } from "./Common";

export default function AccountSecurity() {
  const account = trpc.auth.account.useQuery();
  const change = trpc.auth.changePassword.useMutation();
  const utils = trpc.useUtils();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 10) { setError("Новый пароль должен содержать не менее 10 символов"); return; }
    if (newPassword !== confirmation) { setError("Новые пароли не совпадают"); return; }
    if (newPassword === currentPassword) { setError("Новый пароль должен отличаться от текущего"); return; }
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      await utils.auth.account.invalidate();
      toast.success("Пароль изменён. Сеансы на остальных устройствах завершены.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сменить пароль");
    }
  };

  if (!account.data) return null;
  return <Section title="Вход и безопасность" description="Одна локальная учётная запись для MacBook и iPhone. Данные и пароль не отправляются в облако.">
    <div className="mb-5 flex items-start gap-3 rounded-xl bg-secondary/55 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="text-sm"><p>Логин: <b>{account.data.username}</b></p><p className="mt-1 text-muted-foreground">Активных сессий: {account.data.sessionCount}. Смена пароля сохраняет текущее устройство и отключает остальные.</p></div></div>
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
      <Field label="Текущий пароль"><input required type="password" autoComplete="current-password" maxLength={128} className="field" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
      <Field label="Новый пароль" hint="Минимум 10 символов"><input required minLength={10} type="password" autoComplete="new-password" maxLength={128} className="field" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field>
      <Field label="Повторите новый пароль"><input required minLength={10} type="password" autoComplete="new-password" maxLength={128} className="field" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field>
      <div className="lg:col-span-3">{error && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}<Button type="submit" className="min-h-11 gap-2" disabled={change.isPending}>{change.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Сменить пароль</Button></div>
    </form>
    <div className="mt-6 border-t pt-5 text-sm leading-relaxed"><p className="font-medium">Забыли пароль?</p><p className="mt-1 text-muted-foreground">Откройте Терминал в папке проекта на MacBook и выполните <code className="rounded bg-secondary px-1.5 py-0.5">npm run auth:reset</code>. Команда попросит новый пароль, не показывая его на экране, и завершит все старые сессии. Права root не нужны.</p></div>
  </Section>;
}
