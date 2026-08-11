import random

def build(deck_size, lands, sources):
    # 2 = colored source land, 1 = other land, 0 = spell
    return [2]*sources + [1]*(lands-sources) + [0]*(deck_size-lands)

def keep_hand(hand, size):
    """Karsten's mulligan heuristic: reject hands too land-light or land-heavy."""
    l = sum(1 for c in hand if c)
    if size == 7: return l not in (0,1,6,7)
    if size == 6: return l not in (0,1,5,6)
    if size == 5: return l not in (0,5)
    return True

def bottom(hand, target_lands, keep_n):
    """Bottom down to keep_n cards, shedding excess lands first, Wastes before sources."""
    hand = sorted(hand, key=lambda c: (c==0, c==2))  # order: other-lands, sources, spells
    lands = [c for c in hand if c]
    spells = [c for c in hand if not c]
    while len(lands)+len(spells) > keep_n and len(lands) > target_lands:
        lands.pop(0)   # sheds non-source lands before sources
    out = lands + spells
    return out[:keep_n] if len(out) > keep_n else out

def opening(deck):
    d = deck[:]; random.shuffle(d)
    for size, tgt in ((7,3),(6,3),(5,3),(4,2)):
        hand, rest = d[:7], d[7:]
        if size < 7:
            hand = bottom(hand, tgt, size)
        if size == 4 or keep_hand(hand, size):
            return hand, rest
        random.shuffle(d)
    return hand, rest

def run(deck_size, lands, sources, pips, turn, trials=200000, on_play=True, conditional=True):
    deck = build(deck_size, lands, sources)
    ok = tot = 0
    draws = (turn-1) if on_play else turn
    for _ in range(trials):
        hand, rest = opening(deck)
        hand = hand + rest[:draws]
        nl = sum(1 for c in hand if c)
        ns = sum(1 for c in hand if c == 2)
        if conditional and nl < turn:
            continue          # Karsten excludes games you were land-screwed in
        tot += 1
        if ns >= pips and nl >= turn: ok += 1
    return ok/tot if tot else 0

def solve(pips, turn, deck_size=60, lands=24, thr=0.90, trials=60000, conditional=True):
    for s in range(1, lands+1):
        if run(deck_size, lands, s, pips, turn, trials, conditional=conditional) >= thr:
            return s
    return None

random.seed(7)
print("=== CONDITIONAL model (exclude land-screw games), 60 cards / 24 lands, 90% ===")
print(f"{'Turn':<6}{'1 pip':<8}{'2 pips':<8}{'3 pips':<8}")
for t in range(1,8):
    r = [solve(p,t) if t>=p else None for p in (1,2,3)]
    print(f"{t:<6}{str(r[0]):<8}{str(r[1] or '-'):<8}{str(r[2] or '-'):<8}")

print("\n=== vs published Karsten anchors ===")
for (p,t,exp) in ((1,1,14),(2,2,20),(2,3,18),(3,3,23),(1,3,12)):
    print(f"{p} pip(s) turn {t}: derived {solve(p,t,trials=150000)}  published {exp}")
