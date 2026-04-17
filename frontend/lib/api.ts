import { User } from 'firebase/auth';

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

/** Returns Authorization header for a Firebase user, or empty object if no user. */
export async function authHeader(user: User | null): Promise<Record<string, string>> {
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/** Fetch wrapper that automatically injects the Firebase token. */
export async function apiFetch(
  path: string,
  user: User | null,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(await authHeader(user)),
    ...(init.headers as Record<string, string> | undefined),
  };

  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(`${BACKEND}${path}`, { ...init, headers });
}
