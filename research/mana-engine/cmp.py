from sim2 import solve
pub = {(1,1):14,(1,2):13,(1,3):12,(1,4):11,(1,5):10,(1,6):9,(1,7):9,
       (2,2):20,(2,3):18,(2,4):16,(2,5):15,(2,6):14,(2,7):13,
       (3,3):23,(3,4):20,(3,5):19,(3,6):18,(3,7):16}
print(f"{'cost':<10}{'published':<11}{'conditional':<13}{'uncond':<10}")
ec=eu=0.0; n=0
for (p,t),v in sorted(pub.items()):
    c = solve(p,t,trials=30000,conditional=True)
    u = solve(p,t,trials=30000,conditional=False)
    ec+=abs(c-v); eu+=abs(u-v); n+=1
    print(f"{p}pip T{t:<5}{v:<11}{c:<13}{u:<10}")
print(f"\nmean abs error: conditional {ec/n:.2f}   unconditional {eu/n:.2f}")
