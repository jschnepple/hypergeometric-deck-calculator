import numpy as np
rng = np.random.default_rng(7)

def simulate(deck_size, lands, sources, pips, turn, trials, on_play=True, conditional=True):
    """Vectorised. Deck codes: 2=colored source, 1=other land, 0=spell."""
    deck = np.concatenate([np.full(sources,2), np.full(lands-sources,1),
                           np.zeros(deck_size-lands,dtype=int)])
    draws = (turn-1) if on_play else turn
    # permute whole deck per trial
    idx = np.argsort(rng.random((trials, deck_size)), axis=1)
    perm = deck[idx]

    keep_n = np.full(trials, 7)
    hand_l = np.zeros(trials, dtype=int)
    hand_s = np.zeros(trials, dtype=int)
    resolved = np.zeros(trials, dtype=bool)

    for stage, size in enumerate((7,6,5,4)):
        # each mulligan is a fresh 7 off a fresh shuffle
        if stage > 0:
            idx = np.argsort(rng.random((trials, deck_size)), axis=1)
            perm = deck[idx]
        seven = perm[:, :7]
        l7 = (seven > 0).sum(1)
        s7 = (seven == 2).sum(1)
        tobottom = 7 - size
        # bottom non-source lands first, then source lands, only while lands > target
        tgt = 3 if size >= 5 else 2
        excess = np.maximum(0, np.minimum(tobottom, l7 - tgt))
        shed_other = np.minimum(excess, l7 - s7)
        shed_src = excess - shed_other
        l = l7 - excess
        s = s7 - shed_src
        # remaining bottoming comes off spells (no effect on l/s)
        if size == 7:  ok = ~np.isin(l, [0,1,6,7])
        elif size == 6: ok = ~np.isin(l, [0,1,5,6])
        elif size == 5: ok = ~np.isin(l, [0,5])
        else: ok = np.ones(trials, dtype=bool)
        take = ok & ~resolved
        hand_l[take] = l[take]; hand_s[take] = s[take]
        # store the post-hand remainder for draws
        if stage == 0:
            rest = perm[:, 7:]
            rest_store = rest.copy()
        else:
            rest_store[take] = perm[take, 7:]
        resolved |= take
        if resolved.all(): break

    if draws > 0:
        extra = rest_store[:, :draws]
        hand_l = hand_l + (extra > 0).sum(1)
        hand_s = hand_s + (extra == 2).sum(1)

    enough_land = hand_l >= turn
    denom = enough_land if conditional else np.ones(trials, dtype=bool)
    if denom.sum() == 0: return 0.0
    return float(((hand_s >= pips) & enough_land)[denom].mean())

def solve(pips, turn, deck_size=60, lands=24, thr=0.90, trials=40000, conditional=True):
    lo, hi = pips, lands
    while lo < hi:
        mid = (lo+hi)//2
        if simulate(deck_size, lands, mid, pips, turn, trials, conditional=conditional) >= thr:
            hi = mid
        else:
            lo = mid+1
    return lo

import sys
if __name__!="__main__": sys.exit
if __name__=="__main__":
    print("=== CONDITIONAL (Karsten: exclude land-screwed games) 60 cards / 24 lands / 90% ===")
    print(f"{'Turn':<6}{'1 pip':<8}{'2 pips':<8}{'3 pips':<8}")
    for t in range(1,8):
        r=[solve(p,t) if t>=p else None for p in (1,2,3)]
        print(f"{t:<6}{str(r[0]):<8}{str(r[1] or '-'):<8}{str(r[2] or '-'):<8}")
    
    print("\n=== vs published anchors ===")
    for (p,t,exp) in ((1,1,14),(2,2,20),(2,3,18),(3,3,23),(1,3,12),(1,5,10)):
        print(f"  {p} pip turn {t}: derived {solve(p,t,trials=120000):>3}   published {exp}")
    