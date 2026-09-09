import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app";
import type { EditorApi } from "./api";
import { makeEditorDocument } from "./test-fixtures";

function api(): EditorApi {
  return { load: vi.fn(async () => structuredClone(makeEditorDocument())), save: vi.fn() };
}

async function editBoasterFirepower(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(await screen.findByLabelText("Firepower"));
  await user.type(screen.getByLabelText("Firepower"), "52");
}

async function clearAllRoles(user: ReturnType<typeof userEvent.setup>) {
  for (const role of ["Smokes", "Duelist", "Initiator", "Sentinel", "Flex"]) {
    const input = screen.getByLabelText(role) as HTMLInputElement;
    if (input.checked) await user.click(input);
  }
}

describe("App", () => {
  it("loads and searches player cards", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await user.type(screen.getByRole("searchbox", { name: "Search player cards" }), "2024-card-id");
    expect(screen.getByRole("button", { name: /2024 Player.*Not historical IGL.*Not reviewed/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Boaster/ })).not.toBeInTheDocument();
  });

  it("edits a card and shows changes", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await user.click(screen.getByLabelText("Initiator"));
    await editBoasterFirepower(user);
    await user.click(screen.getByLabelText("Historical IGL"));
    await user.click(screen.getByLabelText("Mark this card reviewed"));
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  it("undoes an edit to the saved value", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Undo changes" }));
    expect(screen.getByLabelText("Firepower")).toHaveValue(47);
  });

  it("resets an edit to the generated value", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Reset to derived" }));
    expect(screen.getByLabelText("Firepower")).toHaveValue(47);
  });

  it("blocks saving an entry without any roles", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await clearAllRoles(user);
    expect(screen.getByRole("button", { name: "Save all changes" })).toBeDisabled();
    expect(screen.getByText(/select at least one role/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Boaster.*Invalid/i })).toBeInTheDocument();
  });

  it("saves the complete ordered catalog and adopts the returned revision", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue({ revision: "b".repeat(64) });
    render(<App api={{ load: vi.fn().mockResolvedValue(structuredClone(makeEditorDocument())), save }} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Save all changes" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      revision: "a".repeat(64),
      catalog: expect.objectContaining({
        version: 1,
        cards: [
          expect.objectContaining({ cardId: "boaster-fnatic-2023", traits: expect.objectContaining({ firepower: 52 }) }),
          expect.objectContaining({ cardId: "2024-card-id" }),
        ],
      }),
    });
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    expect(screen.getByText("0 unsaved changes")).toBeInTheDocument();
  });

  it("keeps edits and reports a failed save", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue(new Error("disk full"));
    render(<App api={{ load: vi.fn().mockResolvedValue(structuredClone(makeEditorDocument())), save }} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Save all changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    expect(screen.getByLabelText("Firepower")).toHaveValue(52);
  });

  it("disables saving and shows progress while a save is in flight", async () => {
    const user = userEvent.setup();
    let resolveSave!: (value: { revision: string }) => void;
    const save = vi.fn(() => new Promise<{ revision: string }>(resolve => { resolveSave = resolve; }));
    render(<App api={{ load: vi.fn().mockResolvedValue(structuredClone(makeEditorDocument())), save }} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Save all changes" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    resolveSave({ revision: "b".repeat(64) });
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
  });

  it("keeps edits and offers a reload after a revision conflict", async () => {
    const user = userEvent.setup();
    const conflict = Object.assign(new Error("Player data changed on disk; reload before saving"), { status: 409 });
    const save = vi.fn().mockRejectedValue(conflict);
    render(<App api={{ load: vi.fn().mockResolvedValue(structuredClone(makeEditorDocument())), save }} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Save all changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Player data changed on disk; reload before saving");
    expect(screen.getByRole("button", { name: "Reload player data" })).toBeInTheDocument();
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  it("only reloads conflicted player data after confirming discard", async () => {
    const user = userEvent.setup();
    const original = makeEditorDocument();
    const latest = makeEditorDocument();
    latest.revision = "c".repeat(64);
    latest.cards[0].manual.traits.firepower = 81;
    const load = vi.fn().mockResolvedValueOnce(structuredClone(original)).mockResolvedValueOnce(structuredClone(latest));
    const save = vi.fn().mockRejectedValue(Object.assign(new Error("Player data changed on disk; reload before saving"), { status: 409 }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App api={{ load, save }} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await editBoasterFirepower(user);
    await user.click(screen.getByRole("button", { name: "Save all changes" }));
    await user.click(await screen.findByRole("button", { name: "Reload player data" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes and reload player data?");
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Firepower")).toHaveValue(52);

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Reload player data" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Firepower")).toHaveValue(81);
    expect(screen.getByText("0 unsaved changes")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("shows a blocking load error and retries", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("cannot load catalog")).mockResolvedValue(structuredClone(makeEditorDocument()));
    const user = userEvent.setup();
    render(<App api={{ load, save: vi.fn() }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot load catalog");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /Boaster/ })).toBeInTheDocument();
  });

  it("replaces a failed API load without showing stale errors or results", async () => {
    const failedApi: EditorApi = { load: vi.fn().mockRejectedValue(new Error("cannot load catalog")), save: vi.fn() };
    const successfulApi: EditorApi = { load: vi.fn().mockResolvedValue(structuredClone(makeEditorDocument())), save: vi.fn() };
    const view = render(<App api={failedApi} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot load catalog");
    view.rerender(<App api={successfulApi} />);
    expect(await screen.findByRole("button", { name: /Boaster/ })).toBeInTheDocument();
    expect(screen.queryByText("Unable to load catalog")).not.toBeInTheDocument();
  });

  it("shows the exact empty-filter message", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await user.type(screen.getByRole("searchbox", { name: "Search player cards" }), "no-such-player");
    expect(screen.getByText("No player cards match these filters")).toBeInTheDocument();
  });

  it("selects the first filtered card when a filter excludes the active card", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    await user.click(screen.getByRole("button", { name: /2024 Player/ }));
    await user.selectOptions(screen.getByLabelText("Year"), "2023");
    expect(screen.getByRole("button", { name: /Boaster/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: /Boaster.*10 maps played/i })).toBeInTheDocument();
  });

  it("warns before unload only while there are unsaved changes", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    await screen.findByRole("button", { name: /Boaster/ });
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
    await editBoasterFirepower(user);
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
  });

  it("marks out-of-range and fractional traits invalid", async () => {
    const user = userEvent.setup();
    render(<App api={api()} />);
    const input = await screen.findByRole("spinbutton", { name: "Firepower" });
    await user.clear(input);
    await user.type(input, "101");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/firepower/i);
    await user.clear(input);
    await user.type(input, "10.5");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
