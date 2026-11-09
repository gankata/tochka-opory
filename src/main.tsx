import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, useTheme } from "next-themes";
import { TRPCProvider } from "@/providers/trpc";
import "@/lib/logger";
import "./index.css";
import App from "./App";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{ closeButtonAriaLabel: "Закрыть уведомление" }}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js"); });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        storageKey="tochka-theme"
      >
        <TRPCProvider>
          <AppErrorBoundary><App /></AppErrorBoundary>
          <ThemedToaster />
        </TRPCProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
