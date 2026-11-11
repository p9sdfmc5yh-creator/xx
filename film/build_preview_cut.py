# Quick 1080p work-in-progress cut: new photoreal stills where they exist, original frames elsewhere,
# producer name replaced on the intro / outro cards.
import sys, os, json, glob, subprocess, numpy as np, cv2
from multiprocessing import Pool
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
R='/home/user/xx/film'
sys.path.insert(0, R+'/compose')
import text as T
W,H=1920,1080
SH=json.load(open(R+'/shots.json'))['shots']
SKIP=set(os.environ.get('WIP_SKIP','').split(','))          # user rejected the current jujube render; placeholder until the redesign lands

def srgb2lin(c): return np.where(c<=0.04045, c/12.92, ((c+0.055)/1.055)**2.4)
def lin2srgb(c): return np.where(c<=0.0031308, c*12.92, 1.055*np.clip(c,0,None)**(1/2.4)-0.055)

def framing_ok(a):
    h,w=a.shape
    col=a[:, w//2-w//50:w//2+w//50].max(axis=1); ys=np.where(col>0.5)[0]
    if len(ys)==0: return False
    apex=ys[0]/h
    return 0.47<=apex<=0.60 and a[-1].mean()>0.97 and a[:int(0.45*h), int(0.2*w):int(0.8*w)].max()<0.05

def pick_still(sid):
    allc=sorted(set(glob.glob(f'{S}/tmp_{sid}/*.png')+glob.glob(f'{S}/previews/{sid}*.png')), key=os.path.getmtime, reverse=True)
    def _w(p):
        try:
            from PIL import Image; return Image.open(p).size[0]
        except Exception: return 0
    big=[p for p in allc if _w(p)>=1280]; small=[p for p in allc if 960<=_w(p)<1280]
    cands=[R+f'/renders/{sid}.png']+big+small
    for p in cands:
        if not os.path.exists(p): continue
        im=cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if im is None or im.ndim!=3 or im.shape[2]!=4: continue
        h,w=im.shape[:2]
        if w<960 or abs(w/h-16/9)>0.01: continue
        mx=65535.0 if im.dtype==np.uint16 else 255.0
        a=im[...,3].astype(np.float32)/mx
        if not framing_ok(a): continue
        interp=cv2.INTER_AREA if w>W else cv2.INTER_LANCZOS4
        im=cv2.resize(im.astype(np.float32)/mx,(W,H),interpolation=interp)
        return p, np.clip(im[...,2::-1],0,1), np.clip(im[...,3],0,1)
    return None, None, None

def orig(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg')[...,::-1].astype(np.float32)/255.0


INK=np.array([0.115,0.092,0.075],np.float32)
_paper=None
def paper_white():
    """warm white aged paper: fibres, faint mottling, faint ruled grid (static, cached)"""
    global _paper
    if _paper is None:
        rng=np.random.default_rng(11)
        base=np.ones((H,W,3),np.float32)*np.array([0.965,0.950,0.915],np.float32)
        fine=cv2.GaussianBlur(rng.standard_normal((H,W)).astype(np.float32),(0,0),0.9)*0.010
        mott=cv2.resize(cv2.GaussianBlur(rng.standard_normal((H//6,W//6)).astype(np.float32),(0,0),9),(W,H),interpolation=cv2.INTER_CUBIC)*0.060
        fib=np.zeros((H,W),np.float32)
        for _ in range(2600):
            x,y=rng.integers(0,W),rng.integers(0,H); a=rng.uniform(0,np.pi); l=rng.uniform(8,34)
            cv2.line(fib,(int(x),int(y)),(int(x+l*np.cos(a)),int(y+l*np.sin(a))),float(rng.uniform(0.25,1.0)),1,cv2.LINE_AA)
        fib=cv2.GaussianBlur(fib,(0,0),0.7)*0.022
        grid=np.zeros((H,W),np.float32); st=60
        for x in range(W//2%st,W,st): grid[:,x]=1
        for y in range(H//2%st,H,st): grid[y,:]=1
        grid=cv2.GaussianBlur(grid,(0,0),0.6)*0.075*(0.75+0.5*cv2.resize(rng.random((H//40,W//40)).astype(np.float32),(W,H),interpolation=cv2.INTER_CUBIC))
        yy,xx=np.mgrid[0:H,0:W].astype(np.float32); r=np.hypot((xx-W/2)/(W/2),(yy-H/2)/(H/2))
        edge=np.clip(r-0.55,0,None)**2*0.10
        tone=(fine+mott-fib-edge)[...,None]*np.array([1.0,1.03,1.12],np.float32)
        _paper=np.clip(base+tone-grid[...,None]*np.array([0.9,1.0,1.05],np.float32),0,1)
    return _paper

def white_page(f):
    """intro / outro card on white paper with dark ink text (text layer recoloured)"""
    lay=T.render_text_layer(f, scale=1)
    lum=lay[...,:3].mean(axis=2)
    ink=np.clip(lay[...,3]*np.clip((lum-0.25)/0.6,0,1),0,1)[...,None]     # fill only, drop the dark shadow
    seg0,seg1=(0,192) if f<192 else (736,1248)
    z=1.0+0.035*(f-seg0)/(seg1-seg0)
    M=np.float32([[z,0,W/2*(1-z)],[0,z,H/2*(1-z)]])
    pg=cv2.warpAffine(paper_white(),M,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
    out=pg*(1-ink*0.94)+INK*ink*0.94
    try: g=float(T.global_fade(f))
    except Exception: g=1.0
    return out*g

_vig=None
def retro(img, f):
    """vintage film look: faded warm grade, halation, vignette, grain, dust, flicker, gate weave"""
    global _vig
    rng=np.random.default_rng(1000+f)
    x=np.clip(img,0,1).astype(np.float32)
    dx,dy=0.7*np.sin(f*0.9)+0.3*np.sin(f*2.3), 0.6*np.sin(f*0.7+1.3)        # gate weave (sub-pixel)
    x=cv2.warpAffine(x,np.float32([[1,0,dx],[0,1,dy]]),(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    lum=(x*np.array([0.299,0.587,0.114],np.float32)).sum(-1,keepdims=True)
    hal=cv2.resize(cv2.GaussianBlur(cv2.resize(np.clip(lum-0.72,0,1),(W//4,H//4)),(0,0),7),(W,H))[...,None]
    x=x+hal*np.array([0.55,0.22,0.08],np.float32)                           # warm halation around highlights
    x=lum+(x-lum)*0.80                                                      # gentle desaturation
    x=x*np.array([1.035,1.0,0.90],np.float32)+np.array([0.012,0.004,-0.006],np.float32)   # warm cast
    x=np.clip(x,0,1); x=0.058+0.905*(x**0.94)                               # lifted blacks, soft whites (faded print)
    x=x+(1-lum)*np.array([0.016,0.008,0.0],np.float32)                      # brown-toned shadows
    if _vig is None:
        yy,xx=np.mgrid[0:H,0:W].astype(np.float32); r=np.hypot((xx-W/2)/(W/2),(yy-H/2)/(H/2))/1.414
        _vig=(1-0.30*np.clip(r,0,1)**2.4)[...,None]
    x=x*_vig*(1+0.012*np.sin(f*1.7)+0.008*rng.standard_normal())            # vignette + flicker
    g=cv2.GaussianBlur(rng.standard_normal((H,W)).astype(np.float32),(0,0),0.75)
    lum2=np.clip(x.mean(-1,keepdims=True),0,1)
    x=x+g[...,None]*0.038*(0.55+0.9*lum2*(1-lum2)*2)                        # film grain, strongest in mid-tones
    for _ in range(rng.integers(2,7)):                                      # dust specks
        cx,cy=int(rng.integers(0,W)),int(rng.integers(0,H)); rr=int(rng.integers(1,3))
        cv2.circle(x,(cx,cy),rr,(0.08,0.07,0.06) if rng.random()<0.7 else (0.95,0.93,0.88),-1,cv2.LINE_AA)
    if rng.random()<0.10:                                                   # occasional hairline scratch
        sx=int(rng.integers(0,W)); x[:,sx:sx+1]=x[:,sx:sx+1]*0.82+0.14
    return np.clip(x,0,1)

_cache={}
def shot_assets(s):
    sid=s['id']
    if sid in _cache: return _cache[sid]
    out=None
    if sid not in SKIP:
        p,rgb,a=pick_still(sid)
        if p is not None:
            import backdrops as B
            sky=B.sky_plate(sid, (s['start']+s['end'])//2, scale=1).astype(np.float32)
            out=(p,rgb,a,sky)
    _cache[sid]=out
    return out

def name_patch(f):
    """original frame with the old producer name inpainted away and the new name drawn"""
    o=orig(f)
    ln=T.render_text_layer(f, use_old_name=False, scale=1); lo=T.render_text_layer(f, use_old_name=True, scale=1)
    diff=np.abs(ln-lo).max(axis=2)
    if diff.max()<1e-3: return o
    m=(np.maximum(lo[...,3],ln[...,3])>0.004)
    ys,xs=np.where(diff>1e-3); y0,y1,x0,x1=max(ys.min()-26,0),min(ys.max()+26,H),max(xs.min()-40,0),min(xs.max()+40,W)
    box=np.zeros((H,W),bool); box[y0:y1,x0:x1]=True
    m=cv2.dilate((m&box).astype(np.uint8),np.ones((7,7),np.uint8))
    o8=(o*255).astype(np.uint8)
    inp=cv2.inpaint(o8[...,::-1].copy(), m, 7, cv2.INPAINT_TELEA)[...,::-1].astype(np.float32)/255.0
    inp=cv2.GaussianBlur(inp,(0,0),3)*m[...,None]+o*(1-m[...,None])     # smooth the fill (sky gradient)
    w=cv2.GaussianBlur(box.astype(np.float32),(0,0),6)[...,None]
    base=inp*w+o*(1-w)
    a=ln[...,3:4]*box[...,None]
    return base*(1-a)+ln[...,:3]*a

def frame_raw(f):
    for s in SH:
        if s['start']<=f<s['end']:
            A=shot_assets(s)
            if A is None: return (np.clip(orig(f),0,1)*255+0.5).astype(np.uint8)
            p,rgb,a,sky=A
            n=s['end']-s['start']; z=1.0+{8:0.012,16:0.02,64:0.05}.get(n,0.02)*(f-s['start'])/max(n-1,1)
            cx,cy=W/2,0.53*H
            M=np.float32([[z,0,cx*(1-z)],[0,z,cy*(1-z)]])
            rgbz=cv2.warpAffine(rgb,M,(W,H),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_REPLICATE)
            az=np.clip(cv2.warpAffine(a,M,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE),0,1)[...,None]
            comp=lin2srgb(srgb2lin(np.clip(rgbz,0,1))*az+srgb2lin(np.clip(sky,0,1))*(1-az))
            t=T.render_text_layer(f, scale=1); ta=t[...,3:4]
            comp=comp*(1-ta)+t[...,:3]*ta
            return (np.clip(comp,0,1)*255+0.5).astype(np.uint8)
    if f<192 or f>=736: return (np.clip(white_page(f),0,1)*255+0.5).astype(np.uint8)
    import backdrops as B
    bg=np.clip(B.backdrop(f, scale=1),0,1).astype(np.float32)
    return (np.clip(T.composite_text(bg, f, scale=1, fade=True),0,1)*255+0.5).astype(np.uint8)

def frame(f):
    try: g=float(T.global_fade(f))
    except Exception: g=1.0
    r=retro(frame_raw(f).astype(np.float32)/255.0, f)
    if f>=1200: r=r*min(1.0,g/max(g,1e-6)) if g>0 else r*0
    return (r*255+0.5).astype(np.uint8)

if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='scan':
        for s in SH:
            p,_,_=pick_still(s['id']); print(s['id'], 'SKIP' if s['id'] in SKIP else (p.replace(S,'S') if p else '-- original'))
    elif mode=='shots':
        tiles=[]
        for s_ in SH:
            fr=frame_raw((s_['start']+s_['end'])//2); t=cv2.resize(fr,(480,270),interpolation=cv2.INTER_AREA)
            A=shot_assets(s_); tag=s_['id']+(' NEW '+os.path.basename(A[0])[:14] if A else ' (orig)')
            cv2.putText(t,tag,(5,262),cv2.FONT_HERSHEY_SIMPLEX,0.45,(255,255,0),1); tiles.append(t)
        while len(tiles)%6: tiles.append(np.zeros((270,480,3),np.uint8))
        sh=np.vstack([np.hstack(tiles[i:i+6]) for i in range(0,len(tiles),6)])
        cv2.imwrite(S+'/wip/shots_sheet.jpg', sh[...,::-1], [cv2.IMWRITE_JPEG_QUALITY,86]); print('shots sheet ok')
    elif mode=='test':
        fs=[60,170,230,290,416,472,536,584,644,800,1000,1200]
        tiles=[cv2.resize(frame(f),(640,360),interpolation=cv2.INTER_AREA) for f in fs]
        sh=np.vstack([np.hstack(tiles[i:i+4]) for i in range(0,12,4)])
        cv2.imwrite(S+'/wip/test_sheet.jpg', sh[...,::-1], [cv2.IMWRITE_JPEG_QUALITY,88]); print('sheet ok')
        cv2.imwrite(S+'/wip/name_crop.jpg', np.hstack([frame(60)[330:560,560:1360], frame(1200)[330:560,560:1360]])[...,::-1])
    else:
        out=sys.argv[2]
        ff=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','30','-i','-','-i',S+'/work/audio_orig.m4a','-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','copy','-movflags','+faststart','-shortest',out],stdin=subprocess.PIPE)
        with Pool(4) as pool:
            for i,fr in enumerate(pool.imap(frame, range(1248), chunksize=8)):
                ff.stdin.write(fr.tobytes())
                if i%200==0: print('frame',i,flush=True)
        ff.stdin.close(); ff.wait(); print('done', out)
