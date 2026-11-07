import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

export type OfflineOperation = inferRouterInputs<AppRouter>["workspace"]["transactionCreate"] & { clientId: string };
const KEY = "tochka-offline-operations";
export function readOfflineOperations(): OfflineOperation[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function queueOfflineOperation(operation: OfflineOperation) {
  const queue = readOfflineOperations();
  if (!queue.some((item) => item.clientId === operation.clientId)) queue.push(operation);
  localStorage.setItem(KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent("tochka-offline-queue", { detail: queue.length }));
}
export function writeOfflineOperations(operations: OfflineOperation[]) {
  localStorage.setItem(KEY, JSON.stringify(operations));
  window.dispatchEvent(new CustomEvent("tochka-offline-queue", { detail: operations.length }));
}
