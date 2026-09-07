"use client";

import { useLayoutEffect, useRef } from "react";

export interface ExitRunDialogProps {
  open: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function ExitRunDialog({ open, onCancel, onConfirm }: ExitRunDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !wasOpen.current) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof node.showModal === "function") node.showModal();
      else node.setAttribute("open", "");
      cancelButton.current?.focus();
    } else if (!open && wasOpen.current) {
      if (typeof node.close === "function") node.close();
      else node.removeAttribute("open");
      returnFocus.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return <dialog
    ref={dialog}
    className="exit-run-dialog"
    aria-labelledby="exit-run-title"
    onCancel={event => { event.preventDefault(); onCancel(); }}
  >
    <h2 id="exit-run-title">Exit this run?</h2>
    <p>Your current draft and tournament progress will be lost. Saved results stay in your history.</p>
    <div className="exit-run-dialog__actions">
      <button ref={cancelButton} type="button" onClick={onCancel}>Keep this run</button>
      <button className="action-button" type="button" onClick={onConfirm}>Exit run and lose progress</button>
    </div>
  </dialog>;
}
