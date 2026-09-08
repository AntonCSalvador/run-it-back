import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExitRunDialog } from "./exit-run-dialog";

describe("ExitRunDialog", () => {
  it("uses an explicit non-modal fallback only when showModal is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: undefined });
    try {
      render(<ExitRunDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />);
      expect(screen.getByRole("dialog", { name: "Exit this run?" })).toHaveAttribute("open");
      expect(screen.getByRole("button", { name: "Keep this run" })).toHaveFocus();
    } finally {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    }
  });

  it("surfaces an unexpected showModal lifecycle error", () => {
    const error = new Error("dialog lifecycle failed");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(() => { throw error; }) });
    try {
      expect(() => render(<ExitRunDialog open onCancel={vi.fn()} onConfirm={vi.fn()} />)).toThrow(error);
    } finally {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
      errors.mockRestore();
    }
  });
});
