-- VCT Reference DuckDB audit extraction. Database SHA-256 is in provenance.
-- Run once per event ID: 449, 1015, 1657, 2097, 2283.
SELECT m.match_id, m.series_stage, m.series_round, m.utc_timestamp,
  m.team0_id, m.team1_id, pm.player_id, pm.team_idx, pm.game_id, pm.agents,
  mp.performance_available, pm.rating_all, pm.acs_all, pm.assists_all, pm.deaths_all
FROM matches AS m JOIN player_map AS pm USING (match_id)
JOIN maps AS mp USING (match_id, game_id)
WHERE m.event_id = $event_id AND m.listing_status = 'Completed' AND NOT m.is_showmatch;

SELECT n.player_id, n.match_id, n.game_id, n.stat_type, n.round_num
FROM notables AS n JOIN matches AS m USING (match_id)
WHERE m.event_id = $event_id AND m.listing_status = 'Completed'
  AND NOT m.is_showmatch AND n.stat_type LIKE 'clutch_%';

-- Team-index mapping and bracket progression use these unmodified inputs.
SELECT match_id, team0_id, team1_id, series_stage, series_round, score0, score1
FROM matches WHERE event_id = $event_id AND listing_status = 'Completed'
  AND NOT is_showmatch ORDER BY match_id;

-- Executable extraction, ordering, duplicate checks, and player/team name joins:
-- scripts/verify-champions-extraction.py. Pure role/rating formulas:
-- src/data/champions/derivation.ts.
