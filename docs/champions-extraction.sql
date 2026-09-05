-- VCT Reference DuckDB audit extraction. Database SHA-256 is in provenance.
-- Run once per event ID: 449, 1015, 1657, 2097, 2283.
SELECT pm.player_id, pm.game_id, pm.agents, mp.performance_available,
  pm.rating_all, pm.acs_all, pm.assists_all, pm.deaths_all
FROM matches AS m JOIN player_map AS pm USING (match_id)
JOIN maps AS mp USING (match_id, game_id)
WHERE m.event_id = $event_id AND m.listing_status = 'Completed' AND NOT m.is_showmatch;

SELECT n.player_id, n.match_id, n.game_id, n.stat_type, n.round_num
FROM notables AS n JOIN matches AS m USING (match_id)
WHERE m.event_id = $event_id AND n.stat_type LIKE 'clutch_%';
