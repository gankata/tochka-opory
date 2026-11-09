import { useSyncExternalStore } from "react";
import {
  readFeatureHintsEnabled,
  subscribeFeatureHints,
  writeFeatureHintsEnabled,
} from "@/lib/feature-hints";

const serverSnapshot = () => true;

export function useFeatureHints() {
  const enabled = useSyncExternalStore(subscribeFeatureHints, readFeatureHintsEnabled, serverSnapshot);
  return [enabled, writeFeatureHintsEnabled] as const;
}
