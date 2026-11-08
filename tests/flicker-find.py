# R12.6: the flicker finder's second half: marks pixels that flip A->B->A across the frames (magenta), counts them
import sys, numpy as np
from PIL import Image
d, names = sys.argv[1], sys.argv[2].split(",")
for n in names:
    F=[np.asarray(Image.open(f"{d}/{n}-{k}.png").convert("RGB")).astype(int) for k in range(7)]
    flip=np.zeros(F[0].shape[:2],int)
    for k in range(1,6):
        a,b,c=F[k-1],F[k],F[k+1]
        dab=np.abs(a-b).sum(2); dbc=np.abs(b-c).sum(2); dac=np.abs(a-c).sum(2)
        flip+=((dab>60)&(dbc>60)&(dac<25))
    m=flip>=2
    img=F[3].astype(np.uint8).copy(); img[m]=[255,0,255]
    Image.fromarray(img).save(f"{d}/{n}-flick.png")
    print(f"{n:14s} flicker px: {int(m.sum())}")
