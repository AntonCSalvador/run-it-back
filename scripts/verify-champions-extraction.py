"""Audit/extract the immutable Champions raw inputs. See docs/data-methodology.md."""
import argparse
import hashlib
import json
import subprocess
from collections import defaultdict
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
SHA256 = "faa56883676dec0b89426c0ba36c65acad232f77d2fbbb5e03878a9522d53792"
EVENTS = {2021: 449, 2022: 1015, 2023: 1657, 2024: 2097, 2025: 2283}
RAW = ROOT / "src/data/champions/raw-extraction.json"


def extract(conn):
    cards, matches, teams = [], [], []
    for year, event in EVENTS.items():
        event_matches = conn.execute("""
            SELECT match_id, team0_id, team1_id, series_stage, series_round, score0, score1
            FROM matches WHERE event_id=? AND listing_status='Completed' AND NOT is_showmatch
            ORDER BY match_id
        """, [event]).fetchall()
        match_teams = {row[0]: row[1:3] for row in event_matches}
        matches.extend(dict(zip(["matchId", "team0", "team1", "stage", "round", "score0", "score1"], row), year=year) for row in event_matches)
        team_ids = sorted({value for row in event_matches for value in row[1:3]})
        for team_id in team_ids:
            name = conn.execute("SELECT team_name FROM teams WHERE team_id=?", [team_id]).fetchone()[0]
            teams.append({"year": year, "teamId": team_id, "name": name})
        rows = conn.execute("""
            SELECT pm.player_id,p.player_name,pm.match_id,pm.game_id,pm.team_idx,pm.agents,
                   mp.performance_available,pm.rating_all,pm.acs_all,pm.assists_all,pm.deaths_all
            FROM matches m JOIN player_map pm USING(match_id)
            JOIN maps mp USING(match_id,game_id) JOIN players p USING(player_id)
            WHERE m.event_id=? AND m.listing_status='Completed' AND NOT m.is_showmatch
            ORDER BY pm.player_id,pm.match_id,pm.game_id
        """, [event]).fetchall()
        groups = defaultdict(list)
        seen = set()
        for player, name, match, game, team_idx, agents, *metrics in rows:
            if team_idx not in (0, 1) or len(agents or []) != 1:
                raise ValueError("ambiguous player-map team/agent")
            key = (player, match, game)
            if key in seen:
                raise ValueError("duplicate participation")
            seen.add(key)
            team = match_teams[match][team_idx]
            groups[(player, name, team)].append([match, game, team_idx, agents[0], *metrics])
        clutches = defaultdict(int)
        for player, match, game in conn.execute("""
            SELECT n.player_id,n.match_id,n.game_id FROM notables n JOIN matches m USING(match_id)
            WHERE m.event_id=? AND m.listing_status='Completed' AND NOT m.is_showmatch
              AND n.stat_type LIKE 'clutch_%'
        """, [event]).fetchall():
            if (player, match, game) not in seen:
                raise ValueError("clutch without participation")
            clutches[player] += 1
        for (player, name, team), maps in sorted(groups.items()):
            cards.append({"year": year, "playerId": player, "playerName": name, "teamId": team,
                          "maps": maps, "clutchWins": clutches[player]})
    if len(cards) != 404 or len(teams) != 80 or len({row['playerId'] for row in cards}) != 239:
        raise ValueError("participation cardinality mismatch")
    if sum(row['clutchWins'] for row in cards) != 1375:
        raise ValueError("clutch aggregate mismatch")
    if sum(len(row['maps']) for row in cards) != 4150:
        raise ValueError("player-map cardinality mismatch")
    return {"databaseSha256": SHA256, "teams": teams, "matches": matches, "cards": cards}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("--check", action="store_true", help="default: compare raw artifact and validate every derived field")
    parser.add_argument("--extract", action="store_true", help="explicitly regenerate raw artifact; review checksum change")
    args = parser.parse_args()
    with args.database.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != SHA256:
            raise SystemExit("pinned database SHA-256 mismatch")
    with duckdb.connect(str(args.database), read_only=True) as conn:
        raw = extract(conn)
    encoded = (json.dumps(raw, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8")
    if args.extract:
        RAW.write_bytes(encoded)
        print("raw SHA-256:", hashlib.sha256(encoded).hexdigest())
    else:
        if RAW.read_bytes() != encoded:
            raise SystemExit("raw extraction differs from pinned database")
        subprocess.run(["node", str(ROOT / "node_modules/tsx/dist/cli.mjs"), "scripts/validate-data.mts"], cwd=ROOT, check=True)
        print("Full Champions audit: 404 player-event cards, 239 identities, 80 teams, 4,150 player-maps, 1,375 clutch events; all roles and traits verified")


if __name__ == "__main__":
    main()
