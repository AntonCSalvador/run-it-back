import type { EditorCard, EditorFilters } from "./types";

interface PlayerListProps {
  cards: EditorCard[];
  allCards: EditorCard[];
  selectedId: string | null;
  filters: EditorFilters;
  changedIds: Set<string>;
  invalidIds: Set<string>;
  onFiltersChange(filters: EditorFilters): void;
  onSelect(cardId: string): void;
}

const roles = ["smokes", "duelist", "initiator", "sentinel", "flex"];
const labelFor = (value: string) => value.replace(/^./, letter => letter.toUpperCase());

export function PlayerList({ cards, allCards, selectedId, filters, changedIds, invalidIds, onFiltersChange, onSelect }: PlayerListProps) {
  const years = [...new Set(allCards.map(card => card.generated.year))].sort();
  const teams = [...new Map(allCards.map(card => [card.team.id, card.team])).values()];
  const update = <Key extends keyof EditorFilters>(key: Key, value: EditorFilters[Key]) => onFiltersChange({ ...filters, [key]: value });

  return <aside className="player-pane" aria-label="Player cards">
    <div className="filter-panel">
      <label>
        Search player cards
        <input type="search" role="searchbox" value={filters.query} onChange={event => update("query", event.currentTarget.value)} />
      </label>
      <div className="filter-grid">
        <label>Year<select value={filters.year} onChange={event => update("year", event.currentTarget.value === "all" ? "all" : Number(event.currentTarget.value))}><option value="all">All years</option>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        <label>Team<select value={filters.teamId} onChange={event => update("teamId", event.currentTarget.value)}><option value="all">All teams</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label>Role<select value={filters.role} onChange={event => update("role", event.currentTarget.value as EditorFilters["role"])}><option value="all">All roles</option>{roles.map(role => <option key={role} value={role}>{labelFor(role)}</option>)}</select></label>
        <label>Review<select value={filters.review} onChange={event => update("review", event.currentTarget.value as EditorFilters["review"])}><option value="all">All cards</option><option value="needs-review">Needs review</option><option value="reviewed">Reviewed</option><option value="changed">Changed</option></select></label>
      </div>
      <p aria-live="polite">{cards.length} result{cards.length === 1 ? "" : "s"}</p>
    </div>
    {cards.length === 0 ? <p className="empty">No player cards match these filters</p> : <ul className="player-list">
      {cards.map(card => {
        const id = card.generated.id;
        const manual = card.manual;
        return <li key={id}>
          <button type="button" className="player-row" aria-current={id === selectedId ? "true" : undefined} onClick={() => onSelect(id)}>
            <strong>{card.generated.displayHandle}</strong>
            <span>{card.team.name} · {card.generated.year}</span>
            <small>{manual.eligibleRoles.map(labelFor).join(", ")}</small>
            <small>{manual.historicalIgl ? "Historical IGL" : "Not historical IGL"} · {manual.reviewed ? "Reviewed" : "Not reviewed"}</small>
            {changedIds.has(id) && <small>Changed</small>}
            {invalidIds.has(id) && <small className="error">Invalid</small>}
          </button>
        </li>;
      })}
    </ul>}
  </aside>;
}
