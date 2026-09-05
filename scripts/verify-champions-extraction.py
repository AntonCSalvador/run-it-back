"""Verify committed Champions evidence against a pinned VCT Reference DuckDB.

Usage: PYTHONPATH=<duckdb install> python scripts/verify-champions-extraction.py PATH/vct.duckdb --check
The dataset itself is intentionally not downloaded by build/CI.
"""
import argparse, hashlib, json, sys
from collections import Counter, defaultdict
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
SHA256 = "faa56883676dec0b89426c0ba36c65acad232f77d2fbbb5e03878a9522d53792"
EVENTS = {2021: 449, 2022: 1015, 2023: 1657, 2024: 2097, 2025: 2283}
CLASSES = {"astra":"smokes","brimstone":"smokes","clove":"smokes","harbor":"smokes","omen":"smokes","viper":"smokes","iso":"duelist","jett":"duelist","neon":"duelist","phoenix":"duelist","raze":"duelist","reyna":"duelist","waylay":"duelist","yoru":"duelist","breach":"initiator","fade":"initiator","gekko":"initiator","kayo":"initiator","skye":"initiator","sova":"initiator","tejo":"initiator","chamber":"sentinel","cypher":"sentinel","deadlock":"sentinel","killjoy":"sentinel","sage":"sentinel","vyse":"sentinel"}

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("database", type=Path); parser.add_argument("--check", action="store_true"); args = parser.parse_args()
    if digest(args.database) != SHA256: raise SystemExit("pinned database SHA-256 mismatch")
    evidence = json.loads((ROOT / "src/data/champions/evidence.json").read_text(encoding="utf8"))
    if len(evidence) != 404 or len({row["cardId"] for row in evidence}) != 404: raise SystemExit("evidence cardinality mismatch")
    conn = duckdb.connect(str(args.database), read_only=True)
    cards = {card["id"]: card for year in EVENTS for card in json.loads((ROOT / f"src/data/champions/{year}.json").read_text(encoding="utf8"))["cards"]}
    observed = {}
    for year, event in EVENTS.items():
        rows = conn.execute("select pm.player_id,pm.agents from matches m join player_map pm using(match_id) where m.event_id=? and m.listing_status='Completed' and not m.is_showmatch", [event]).fetchall()
        counts = defaultdict(Counter)
        for player_id, agents in rows: counts[player_id].update(CLASSES[agent] for agent in (agents or []))
        wins = dict(conn.execute("select n.player_id,count(*) from notables n join matches m using(match_id) where m.event_id=? and n.stat_type like 'clutch_%' group by 1", [event]).fetchall())
        for row in (entry for entry in evidence if entry["year"] == year):
            player_id = int(cards[row["cardId"]]["playerId"].split("-")[1])
            if row["clutchWins"] != wins.get(player_id, 0): raise SystemExit(f"clutch mismatch {row['cardId']}")
            if row["agentClassMaps"] != {role: counts[player_id][role] for role in ("smokes","duelist","initiator","sentinel")}: raise SystemExit(f"class mismatch {row['cardId']}")
            observed[row["cardId"]] = True
    if len(observed) != 404 or sum(row["clutchWins"] for row in evidence) != 1375: raise SystemExit("clutch aggregate mismatch")
    print("Champions extraction check: 404 cards, 1,375 clutch events")

if __name__ == "__main__": main()
