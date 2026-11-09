export const ONBOARDING_PENDING_KEY = "tochka-onboarding-pending";
export const LAST_SEEN_VERSION_KEY = "tochka-last-seen-version";

export function readLocalFlag(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalFlag(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing or a full storage quota must not block registration.
  }
}

export function removeLocalFlag(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The guide remains usable even when browser storage is unavailable.
  }
}
