const TOKEN_STORAGE_KEY = "learnmate_auth_token";
let inMemoryToken: string | null = null;

export function getStoredAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const val = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (val) {
      inMemoryToken = val;
      return val;
    }
  } catch {
    // Ignore storage access restrictions inside sandboxed iframes
  }
  return null;
}

export function setStoredAuthToken(token: string | null | undefined): void {
  const clean = token && token.trim() ? token.trim() : null;
  inMemoryToken = clean;
  try {
    if (clean) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Fallback to in-memory token if localStorage is blocked
  }
}

export function clearStoredAuthToken(): void {
  setStoredAuthToken(null);
}

export function appendAuthTokenToUrl(url: string): string {
  const token = getStoredAuthToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredAuthToken();
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return window.fetch(input, {
    ...init,
    credentials: init?.credentials ?? "same-origin",
    headers,
  });
}
