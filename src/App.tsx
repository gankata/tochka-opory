import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import AppShell from "@/components/app/AppShell";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Planning = lazy(() => import("@/pages/Planning"));
const FinancialCalendar = lazy(() => import("@/pages/FinancialCalendar"));
const Mood = lazy(() => import("@/pages/Mood"));
const Notes = lazy(() => import("@/pages/Notes"));
const DataCenter = lazy(() => import("@/pages/DataCenter"));
const Assets = lazy(() => import("@/pages/Assets"));

function PageLoader() {
  return <div className="flex min-h-[45dvh] items-center justify-center" role="status"><LoaderCircle className="h-7 w-7 animate-spin text-primary" /><span className="sr-only">Загрузка раздела</span></div>;
}

function ProtectedLayout() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: LOGIN_PATH });
  if (isLoading) return <div className="flex min-h-[100dvh] items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-primary" /><span className="sr-only">Проверка входа</span></div>;
  if (!user) return null;
  return <AppShell />;
}

export default function App() {
  return <Suspense fallback={<PageLoader />}><Routes>
    <Route path={LOGIN_PATH} element={<Login />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/operations" element={<Transactions />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/plan" element={<Planning />} />
      <Route path="/calendar" element={<FinancialCalendar />} />
      <Route path="/mood" element={<Mood />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/assets" element={<Assets />} />
      <Route path="/data" element={<DataCenter />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes></Suspense>;
}
