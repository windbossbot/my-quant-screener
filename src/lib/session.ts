export function readSessionValue<T>(key: string) {
  const rawValue = sessionStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function writeSessionValue<T>(key: string, value: T) {
  sessionStorage.setItem(key, JSON.stringify(value));
}
