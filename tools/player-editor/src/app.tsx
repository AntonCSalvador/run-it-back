import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ManualPlayerEntry } from "@/data/champions/manual-data";
import { browserEditorApi, type EditorApi } from "./api";
import { CardEditor } from "./card-editor";
import { catalogFromDraft, changedCardIds, entriesById, filterCards, resetEntryToDerived, undoEntry, validateDraft } from "./model";
import { PlayerList } from "./player-list";
import type { EditorDocument, EditorFilters } from "./types";

const initialFilters: EditorFilters = { query: "", year: "all", teamId: "all", role: "all", review: "all" };
type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string; conflict: boolean };

export function App({ api = browserEditorApi }: { api?: EditorApi }) {
  const [document, setDocument] = useState<EditorDocument | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, ManualPlayerEntry>>({});
  const [draft, setDraft] = useState<Record<string, ManualPlayerEntry>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EditorFilters>(initialFilters);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>({ state: "idle" });
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.load();
      if (generation !== loadGeneration.current) return;
      const entries = entriesById(result.cards.map(card => card.manual));
      setDocument(result);
      setRevision(result.revision);
      setSaved(entries);
      setDraft(structuredClone(entries));
      setSelectedId(result.cards[0]?.generated.id ?? null);
      setSaveState({ state: "idle" });
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void Promise.resolve().then(load);
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const cardIds = useMemo(() => document?.cards.map(card => card.generated.id) ?? [], [document]);
  const changedIds = useMemo(() => changedCardIds(draft, saved), [draft, saved]);
  const errors = useMemo(() => document ? validateDraft(draft, cardIds) : new Map<string, string>(), [cardIds, document, draft]);
  const cards = useMemo(() => document ? filterCards(document.cards, draft, filters, saved).map(card => ({ ...card, manual: draft[card.generated.id] })) : [], [document, draft, filters, saved]);
  const activeId = cards.some(card => card.generated.id === selectedId) ? selectedId : cards[0]?.generated.id ?? null;
  const activeCard = document?.cards.find(card => card.generated.id === activeId);
  const reviewedCount = document?.cards.filter(card => draft[card.generated.id]?.reviewed).length ?? 0;

  useEffect(() => {
    if (!changedIds.size) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changedIds.size]);

  if (loadError) return <main className="load-state"><div role="alert"><p>Unable to load catalog: {loadError}</p><button type="button" onClick={() => void load()}>Retry</button></div></main>;
  if (loading || !document) return <main className="load-state" aria-live="polite">Loading player catalog…</main>;

  const unsavedLabel = `${changedIds.size} unsaved change${changedIds.size === 1 ? "" : "s"}`;
  const changeFilters = (nextFilters: EditorFilters) => {
    const nextCards = filterCards(document.cards, draft, nextFilters, saved);
    setFilters(nextFilters);
    setSelectedId(current => nextCards.some(card => card.generated.id === current) ? current : nextCards[0]?.generated.id ?? null);
  };
  const saveAll = async () => {
    if (!revision || saveState.state === "saving") return;
    const submittedDraft = structuredClone(draft);
    if (validateDraft(submittedDraft, cardIds).size > 0) return;
    const generation = loadGeneration.current;
    setSaveState({ state: "saving" });
    try {
      const result = await api.save({ revision, catalog: catalogFromDraft(submittedDraft, cardIds) });
      if (generation !== loadGeneration.current) return;
      setRevision(result.revision);
      setSaved(structuredClone(submittedDraft));
      setSaveState({ state: "saved" });
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      const message = error instanceof Error ? error.message : String(error);
      const conflict = typeof error === "object" && error !== null && "status" in error && error.status === 409;
      setSaveState({ state: "error", message, conflict });
    }
  };
  const reloadAfterConflict = () => {
    if (window.confirm("Discard unsaved changes and reload player data?")) void load();
  };
  const saveStatus = saveState.state === "saving" ? "Saving…"
    : saveState.state === "saved" ? "All changes saved"
      : saveState.state === "idle" ? "Save state: not saved" : `Save failed: ${saveState.message}`;
  return <main className="editor-shell">
    <header className="editor-header">
      <h1>Run It Back · Local Player Editor</h1>
      <p>{reviewedCount} / {document.cards.length} reviewed</p>
      <p>{unsavedLabel}</p>
      {saveState.state === "error" ? <div role="alert">{saveStatus}{saveState.conflict ? <button type="button" onClick={reloadAfterConflict}>Reload player data</button> : null}</div> : <span aria-live="polite">{saveStatus}</span>}
      <button type="button" disabled={errors.size > 0 || saveState.state === "saving"} onClick={() => void saveAll()}>{saveState.state === "saving" ? "Saving…" : "Save all changes"}</button>
    </header>
    <div className="editor-workspace">
      <PlayerList cards={cards} allCards={document.cards} selectedId={activeId} filters={filters} changedIds={changedIds} invalidIds={new Set(errors.keys())} onFiltersChange={changeFilters} onSelect={setSelectedId} />
      <section className="detail-pane" aria-label="Card editor">
        {activeCard ? <CardEditor
          card={activeCard}
          draft={draft[activeCard.generated.id]}
          saved={saved[activeCard.generated.id]}
          error={errors.get(activeCard.generated.id)}
          traitWeights={document.traitWeights}
          onChange={entry => {
            setSaveState({ state: "idle" });
            setDraft(current => ({ ...current, [entry.cardId]: entry }));
          }}
          onUndo={() => setDraft(current => ({ ...current, [activeCard.generated.id]: undoEntry(activeCard.generated.id, current, saved) }))}
          onReset={() => setDraft(current => ({ ...current, [activeCard.generated.id]: resetEntryToDerived(activeCard, current) }))}
        /> : <p>Select a player card to edit.</p>}
      </section>
    </div>
  </main>;
}
