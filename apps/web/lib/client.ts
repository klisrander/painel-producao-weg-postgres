export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api/backend/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ code: "error" }));
    throw Error(err.code || "error");
  }
  return r.json();
}
export const today = () => new Date().toISOString().slice(0, 10);
export const datePart = (value: string) => value.slice(0, 10);
export const numeric = (value: string) => (value === "" ? null : Number(value));
export function download(
  text: string,
  name: string,
  mime = "text/csv;charset=utf-8",
) {
  const a = document.createElement("a"),
    u = URL.createObjectURL(new Blob([text], { type: mime }));
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export function downloadBytes(bytes: Uint8Array, name: string) {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
