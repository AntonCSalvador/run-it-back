const unsafeHandle = /[\p{Cc}\p{Cf}]/u;
export const MAX_HANDLE_LENGTH = 32;

export function normalizeHandle(value: string): string {
  if (unsafeHandle.test(value)) throw new Error("Invalid handle");
  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0 || normalized.length > MAX_HANDLE_LENGTH || unsafeHandle.test(normalized)) throw new Error("Invalid handle");
  return normalized;
}
