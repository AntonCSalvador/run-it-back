import type { EditorDocument, SaveRequest, SaveResponse } from "./types";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T | { error?: string };
  if (!response.ok) {
    throw Object.assign(
      new Error(typeof body === "object" && body !== null && "error" in body && body.error ? body.error : `Request failed (${response.status})`),
      { status: response.status },
    );
  }
  return body as T;
}

export interface EditorApi {
  load(): Promise<EditorDocument>;
  save(request: SaveRequest): Promise<SaveResponse>;
}

export function createEditorApi(request: typeof fetch = fetch): EditorApi {
  return {
    load: () => request("/api/player-data").then(response => json<EditorDocument>(response)),
    save: payload => request("/api/player-data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(response => json<SaveResponse>(response)),
  };
}

export const browserEditorApi = createEditorApi();
