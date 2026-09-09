import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
