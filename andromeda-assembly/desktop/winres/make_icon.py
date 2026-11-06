import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
S=1024
def tile():
    img=Image.new('RGBA',(S,S),(0,0,0,0))
    # background gradient tile
    bg=Image.new('RGBA',(S,S))
    px=bg.load()
    for y in range(S):
        for x in range(S):
            dx,dy=(x-S*0.62)/S,(y-S*0.35)/S
            d=math.sqrt(dx*dx+dy*dy)
            t=min(1,d*1.4)
            r=int(46*(1-t)+8*t); g=int(22*(1-t)+8*t); b=int(92*(1-t)+22*t)
            px[x,y]=(r,g,b,255)
    mask=Image.new('L',(S,S),0)
    ImageDraw.Draw(mask).rounded_rectangle([40,40,S-40,S-40],radius=210,fill=255)
    img.paste(bg,(0,0),mask)
    # stars
    rnd=random.Random(7)
    st=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(st)
    for _ in range(140):
        x,y=rnd.uniform(80,S-80),rnd.uniform(80,S-80); r=rnd.choice([2,2,3,4])
        a=rnd.randint(90,230); d.ellipse([x-r,y-r,x+r,y+r],fill=(220,220,255,a))
    img=Image.alpha_composite(img,Image.composite(st,Image.new('RGBA',(S,S),(0,0,0,0)),mask))
    # galaxy: layered tilted ellipses with glow
    gal=Image.new('RGBA',(S*2,S*2),(0,0,0,0)); gd=ImageDraw.Draw(gal)
    C=S
    layers=[(820,300,(139,92,246,60)),(700,250,(139,92,246,110)),(560,190,(167,139,250,170)),(420,140,(196,181,253,210)),(280,95,(237,233,254,240))]
    for rx,ry,col in layers:
        gd.ellipse([C-rx,C-ry,C+rx,C+ry],fill=col)
    gal=gal.filter(ImageFilter.GaussianBlur(28))
    # spiral dust lane
    lane=Image.new('RGBA',(S*2,S*2),(0,0,0,0)); ld=ImageDraw.Draw(lane)
    ld.arc([C-600,C-205,C+600,C+205],start=195,end=330,fill=(30,14,60,170),width=34)
    ld.arc([C-480,C-160,C+480,C+160],start=15,end=150,fill=(30,14,60,140),width=26)
    lane=lane.filter(ImageFilter.GaussianBlur(10))
    gal=Image.alpha_composite(gal,lane)
    core=Image.new('RGBA',(S*2,S*2),(0,0,0,0)); cd=ImageDraw.Draw(core)
    for r,a in [(230,60),(160,120),(105,200),(70,255)]:
        cd.ellipse([C-r,C-r*0.8,C+r,C+r*0.8],fill=(255,248,235,a))
    core=core.filter(ImageFilter.GaussianBlur(18))
    gal=Image.alpha_composite(gal,core)
    gal=gal.rotate(25,resample=Image.BICUBIC).resize((S,S),Image.LANCZOS)
    gal=Image.composite(gal,Image.new('RGBA',(S,S),(0,0,0,0)),mask)
    img=Image.alpha_composite(img,gal)
    # subtle rim highlight
    rim=Image.new('RGBA',(S,S),(0,0,0,0))
    ImageDraw.Draw(rim).rounded_rectangle([42,42,S-42,S-42],radius=208,outline=(196,181,253,90),width=6)
    img=Image.alpha_composite(img,rim)
    return img
img=tile()
img.save('icon-1024.png')
img.resize((256,256),Image.LANCZOS).save('icon.png')
img.save('app.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('ok')
