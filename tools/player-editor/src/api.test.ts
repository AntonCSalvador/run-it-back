import { describe, expect, it, vi } from "vitest";
import { createEditorApi } from "./api";

describe("editor API", () => {
  it("loads and saves through the fixed endpoint", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "a", cards: [], traitWeights: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: "b" }), { status: 200 }));
    const api = createEditorApi(request);

    await expect(api.load()).resolves.toMatchObject({ revision: "a" });
    await expect(api.save({ revision: "a", catalog: { version: 1, cards: [] } })).resolves.toEqual({ revision: "b" });
    expect(request.mock.calls[0][0]).toBe("/api/player-data");
    expect(request.mock.calls[1][1]).toMatchObject({ method: "PUT" });
  });

  it("surfaces the server message and status", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: "reload before saving" }), { status: 409 }));

    await expect(createEditorApi(request).load()).rejects.toMatchObject({ message: "reload before saving", status: 409 });
  });
});
