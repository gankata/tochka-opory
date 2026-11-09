import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/Common";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { ONBOARDING_PENDING_KEY, writeLocalFlag } from "@/lib/app-guide";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);
  return url.toString();
}

export default function Login() {
  const { user, isLoading } = useAuth();
  const status = trpc.auth.status.useQuery();
  const setup = trpc.auth.setup.useMutation();
  const login = trpc.auth.login.useMutation();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const initialized = status.data?.initialized ?? true;
  const isLocal = status.data?.isLocal ?? true;
  const pending = setup.isPending || login.isPending;

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!initialized && password !== confirmation) { setError("Пароли не совпадают"); return; }
    if (!initialized && password.length < 10) { setError("Пароль должен содержать не менее 10 символов"); return; }
    try {
      if (initialized) await login.mutateAsync({ username, password });
      else {
        await setup.mutateAsync({ username, password });
        writeLocalFlag(ONBOARDING_PENDING_KEY, "1");
      }
      await utils.invalidate();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти. Проверьте данные и повторите.");
    }
  };

  if (isLoading || status.isLoading || user) return <div className="flex min-h-[100dvh] items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-primary" /><span className="sr-only">Проверка входа</span></div>;
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
    <main className="w-full max-w-md">
      <div className="mb-7 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary"><LockKeyhole className="h-7 w-7" /></div><h1 className="editorial text-3xl font-semibold">Точка опоры</h1><p className="mt-2 text-sm text-muted-foreground">Личные деньги, состояние и заметки</p></div>
      <Card className="border shadow-sm">
        <CardHeader><CardTitle>{isLocal ? initialized ? "Вход в ваше пространство" : "Создайте локальный вход" : "Вход в «Точку опоры»"}</CardTitle><CardDescription>{isLocal ? initialized ? "Та же учётная запись работает на компьютере и телефоне." : "Логин и пароль задаются один раз. Ваши существующие записи останутся на месте." : "Используйте учётную запись своего пространства."}</CardDescription></CardHeader>
        <CardContent>
          {!isLocal ? <Button className="min-h-11 w-full" size="lg" onClick={() => { window.location.href = getOAuthUrl(); }}>Войти</Button> : <form className="space-y-4" onSubmit={submit}>
            <Field label="Логин"><input required minLength={3} maxLength={64} autoComplete="username" autoCapitalize="none" className="field" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Например, somebody" /></Field>
            <Field label="Пароль" hint={!initialized ? "Не менее 10 символов. Используйте уникальную фразу." : undefined}><div className="relative"><input required minLength={initialized ? 1 : 10} maxLength={128} type={showPassword ? "text" : "password"} autoComplete={initialized ? "current-password" : "new-password"} className="field pr-12" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ваш пароль" /><button type="button" className="absolute right-1 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>
            {!initialized && <Field label="Повторите пароль"><input required minLength={10} maxLength={128} type={showPassword ? "text" : "password"} autoComplete="new-password" className="field" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Ещё раз" /></Field>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="min-h-11 w-full" size="lg" disabled={pending}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{pending ? "Проверка…" : initialized ? "Войти" : "Создать вход и продолжить"}</Button>
          </form>}
        </CardContent>
      </Card>
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Пароль хранится только как хеш с солью. Сессия находится в защищённой cookie. Для телефона используйте личную сеть, а не общественный Wi-Fi.</p>
    </main>
  </div>;
}
