import type { ManualPlayerEntry } from "@/data/champions/manual-data";
import { ROLES, type Role, type Traits } from "@/features/game/domain";
import type { EditorCard, EditorDocument } from "./types";

interface CardEditorProps {
  card: EditorCard;
  draft: ManualPlayerEntry;
  saved: ManualPlayerEntry;
  error?: string;
  traitWeights: EditorDocument["traitWeights"];
  onChange(entry: ManualPlayerEntry): void;
  onUndo(): void;
  onReset(): void;
}

const traits: (keyof Traits)[] = ["firepower", "utility", "survival", "clutch", "consistency", "leadership"];
const labelFor = (value: string) => value.replace(/^./, letter => letter.toUpperCase());
const invalidTrait = (value: number) => !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100;

export function CardEditor({ card, draft, saved, error, traitWeights, onChange, onUndo, onReset }: CardEditorProps) {
  const update = (changes: Partial<ManualPlayerEntry>) => onChange({ ...draft, ...changes });
  const updateTrait = (trait: keyof Traits, value: number) => onChange({ ...draft, traits: { ...draft.traits, [trait]: value } });
  const toggleRole = (role: Role) => update({
    eligibleRoles: draft.eligibleRoles.includes(role)
      ? draft.eligibleRoles.filter(item => item !== role)
      : [...draft.eligibleRoles, role],
  });
  const roleError = draft.eligibleRoles.length === 0;

  return <article className="card-editor" aria-labelledby="editor-title">
    <header>
      <h2 id="editor-title">{card.generated.displayHandle} · {card.generated.mapsPlayed} maps played</h2>
      <p>{card.team.name} · {card.generated.year} · {card.generated.id}</p>
    </header>
    {error && <p className="error" id="card-error" role="alert">{roleError ? "Select at least one role. " : ""}{error}</p>}
    <fieldset>
      <legend>ROLES</legend>
      <div className="role-grid">
        {ROLES.map(role => <label className="role-control" key={role}>
          <input type="checkbox" checked={draft.eligibleRoles.includes(role)} aria-invalid={roleError} onChange={() => toggleRole(role)} />
          {labelFor(role)}
        </label>)}
      </div>
    </fieldset>
    <div className="toggles">
      <label><input type="checkbox" checked={draft.historicalIgl} onChange={() => update({ historicalIgl: !draft.historicalIgl })} />Historical IGL</label>
      <label><input type="checkbox" checked={draft.reviewed} onChange={() => update({ reviewed: !draft.reviewed })} />Mark this card reviewed</label>
    </div>
    <section aria-labelledby="traits-title">
      <h3 id="traits-title">Manual ratings</h3>
      <div className="trait-grid" role="table" aria-label="Manual ratings compared with derived values">
        {traits.map(trait => {
          const manual = draft.traits[trait];
          const derived = card.generated.traits[trait];
          const delta = manual - derived;
          return <div className="trait-row" role="row" key={trait}>
            <div className="trait-context" role="cell"><strong>{labelFor(trait)}</strong>{trait !== "leadership" && <small>Weight {traitWeights[trait]}</small>}</div>
            <label className="trait-input" role="cell"><span className="sr-only">{labelFor(trait)}</span><input aria-label={labelFor(trait)} type="number" min="0" max="100" step="1" aria-invalid={invalidTrait(manual)} aria-describedby={invalidTrait(manual) ? "card-error" : undefined} value={Number.isNaN(manual) ? "" : manual} onChange={event => updateTrait(trait, event.currentTarget.value === "" ? Number.NaN : Number(event.currentTarget.value))} /></label>
            <span className="trait-derived" role="cell">{derived}</span>
            <span className={`trait-delta ${delta === 0 ? "" : "changed"}`} role="cell">{Number.isNaN(delta) ? "invalid" : `${delta > 0 ? "+" : ""}${delta}`}</span>
          </div>;
        })}
      </div>
    </section>
    <div className="editor-actions">
      <button type="button" onClick={onUndo} disabled={JSON.stringify(draft) === JSON.stringify(saved)}>Undo changes</button>
      <button type="button" onClick={onReset}>Reset to derived</button>
    </div>
    <details>
      <summary>Evidence</summary>
      <dl>
        <dt>Maps played</dt><dd>{card.evidence.mapsPlayed}</dd>
        <dt>Performance coverage</dt><dd>{card.evidence.performanceAvailableMaps}</dd>
        <dt>Class map counts</dt><dd>{Object.entries(card.evidence.agentClassMaps).map(([role, count]) => `${role}: ${count}`).join(", ")}</dd>
        <dt>Threshold</dt><dd>{card.evidence.threshold}</dd>
        <dt>Suggested roles</dt><dd>{card.evidence.suggestedRoles.join(", ")}</dd>
        <dt>Derived ratings</dt><dd>{traits.map(trait => `${labelFor(trait)}: ${card.generated.traits[trait]}`).join(", ")}</dd>
        <dt>Override</dt><dd>{card.evidence.override ? JSON.stringify(card.evidence.override) : "None"}</dd>
      </dl>
    </details>
  </article>;
}
