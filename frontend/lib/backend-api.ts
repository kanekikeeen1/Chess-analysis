export type BackendErrorBody = {
  message?: string;
  fields?: Record<string, string>;
};

export const BACKEND_API_URL = (
  process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

export async function backendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    response = await fetch(`${BACKEND_API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        "X-Requested-With": "ChessAnalysis",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Không thể kết nối backend. Hãy khởi động Spring Boot và MySQL rồi thử lại.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as BackendErrorBody;
    const firstFieldError = body.fields ? Object.values(body.fields)[0] : undefined;
    throw new Error(firstFieldError ?? body.message ?? "Yêu cầu không thành công. Hãy thử lại.");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
