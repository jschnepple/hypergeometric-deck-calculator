import numpy as np, sim2
rng = np.random.default_rng(11)

def sim_exact(deck_size, lands, sources, pips, turn, trials, mode="ge"):
    """mode: 'ge' = condition on >=turn lands ; 'eq' = condition on exactly `turn` lands (on curve, no flood)"""
    deck = np.concatenate([np.full(sources,2), np.full(lands-sources,1),
                           np.zeros(deck_size-lands,dtype=int)])
    draws = turn-1
    idx = np.argsort(rng.random((trials, deck_size)), axis=1); perm = deck[idx]
    seven = perm[:, :7]
    l = (seven>0).sum(1); s = (seven==2).sum(1)
    keep = ~np.isin(l,[0,1,6,7])
    # single simplified mulligan to 6 for rejects
    idx2 = np.argsort(rng.random((trials, deck_size)), axis=1); p2 = deck[idx2]
    s6 = p2[:, :7]; l6=(s6>0).sum(1); s6c=(s6==2).sum(1)
    ex = np.maximum(0, np.minimum(1, l6-3)); sh = np.minimum(ex, l6-s6c)
    l6 = l6-ex; s6c = s6c-(ex-sh)
    l = np.where(keep, l, l6); s = np.where(keep, s, s6c)
    rest = np.where(keep[:,None], perm[:,7:], p2[:,7:])
    if draws>0:
        e = rest[:,:draws]; l = l+(e>0).sum(1); s = s+(e==2).sum(1)
    cond = (l>=turn) if mode=="ge" else (l==turn)
    if cond.sum()==0: return 0.0
    return float((s[cond]>=pips).mean())

def solve2(pips,turn,mode,lands=24,trials=60000,thr=0.90):
    lo,hi=pips,lands
    while lo<hi:
        m=(lo+hi)//2
        if sim_exact(60,lands,m,pips,turn,trials,mode)>=thr: hi=m
        else: lo=m+1
    return lo

pub={(1,1):14,(1,3):12,(1,5):10,(2,2):20,(2,3):18,(2,5):15,(3,3):23,(3,5):19}
print(f"{'cost':<10}{'published':<11}{'cond >=N':<11}{'cond ==N':<10}")
e_ge=e_eq=0
for (p,t),v in sorted(pub.items()):
    a=solve2(p,t,"ge"); b=solve2(p,t,"eq")
    e_ge+=abs(a-v); e_eq+=abs(b-v)
    print(f"{p}pip T{t:<5}{v:<11}{a:<11}{b:<10}")
print(f"\nmean abs err: >=N {e_ge/len(pub):.2f}   ==N {e_eq/len(pub):.2f}")
