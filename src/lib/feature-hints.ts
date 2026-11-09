export const FEATURE_HINTS_KEY = "tochka-feature-hints";
const FEATURE_HINTS_EVENT = "tochka-feature-hints-change";
let localOverride: boolean | null = null;

export function readFeatureHintsEnabled(): boolean {
  if (localOverride !== null) return localOverride;
  try {
    return window.localStorage.getItem(FEATURE_HINTS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeFeatureHintsEnabled(enabled: boolean) {
  localOverride = enabled;
  try {
    window.localStorage.setItem(FEATURE_HINTS_KEY, enabled ? "1" : "0");
  } catch {
    // The in-memory choice still works when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(FEATURE_HINTS_EVENT));
}

export function subscribeFeatureHints(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== FEATURE_HINTS_KEY) return;
    localOverride = null;
    onChange();
  };
  window.addEventListener(FEATURE_HINTS_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(FEATURE_HINTS_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}
