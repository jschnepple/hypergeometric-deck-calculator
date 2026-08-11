from math import comb

def hyper_at_least(k, successes, draws, pop):
    """P(at least k successes) drawing `draws` from `pop` with `successes` in pop."""
    if k <= 0: return 1.0
    if successes < k or draws < k: return 0.0
    total = comb(pop, draws)
    # P(X <= k-1)
    cum = 0
    for i in range(0, k):
        if i > successes or (draws - i) > (pop - successes): continue
        cum += comb(successes, i) * comb(pop - successes, draws - i)
    return 1.0 - cum / total

def cards_seen(turn, deck_size=60, on_play=True):
    # opening 7 + one draw per turn after turn 1 (on the play)
    return 7 + (turn - 1) if on_play else 7 + turn

def min_sources(pips, turn, deck_size=60, threshold=0.90, on_play=True):
    seen = cards_seen(turn, deck_size, on_play)
    for s in range(0, deck_size + 1):
        if hyper_at_least(pips, s, seen, deck_size) >= threshold:
            return s
    return None

print("=== KARSTEN COLORED SOURCE TABLE (60-card, on the play, 90% threshold) ===")
print(f"{'Turn':<6}{'seen':<6}{'1 pip':<8}{'2 pips':<8}{'3 pips':<8}")
for t in range(1, 8):
    row = [min_sources(p, t) for p in (1,2,3)]
    print(f"{t:<6}{cards_seen(t):<6}{str(row[0]):<8}{str(row[1] if t>=2 else '-'):<8}{str(row[2] if t>=3 else '-'):<8}")

print()
print("=== Sanity vs published anchors ===")
print("1 pip on turn 1  ->", min_sources(1,1), "(Karsten: 14)")
print("2 pips on turn 2 ->", min_sources(2,2), "(Karsten: 20)")
print("2 pips on turn 3 ->", min_sources(2,3), "(Karsten: 18)")
print("3 pips on turn 3 ->", min_sources(3,3), "(Karsten: 23)")
