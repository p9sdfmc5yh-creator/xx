import json,os,numpy as np
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
h=np.load(f'{S}/tmp_backdrops/hz_build.npz')
out=dict(hz_g=h['gt'].astype(np.float32),hz_Bo=h['Bo'],hz_Bi=h['Bi'],hz_Go=h['Go'],hz_Gi=h['Gi'])
shots=json.load(open('/home/user/xx/film/shots.json'))['shots']; done=[]
for s in shots:
    p=f'{S}/tmp_backdrops/sky_{s["id"]}.npz'
    if not os.path.exists(p): continue
    z=np.load(p); u=z['u'].astype(np.float64).reshape(135,2,240,2,3).mean((1,3))
    out['sky_'+s['id']]=np.clip(np.rint(u*256),0,65535).astype(np.uint16)
    out['hs_'+s['id']]=z['hs'].astype(np.float16); out['stars_'+s['id']]=z['cat'].astype(np.float32); m=z['mot'].astype(np.float64)
    if m[0]==0 and m[1]==0: m=np.array([0.0,-np.pi/6000,959.5,3380.9,s['start']])
    out['mot_'+s['id']]=m; done.append(s['id'])
out['shot_ids']=np.array([s['id'] for s in shots]); out['shot_start']=np.array([s['start'] for s in shots]); out['shot_end']=np.array([s['end'] for s in shots])
out['_about']=np.array('Data of film/compose/backdrops.py, reverse-engineered from the original 1920x1080 film (builder scripts: film/compose/backdrops_build/: a2-a5 horizon maps, b_hz tables, y1/y2 yin-yang, s1 + b_sky stars/horizon, b_sky2 sky fit, b_pack). hz_B*/hz_G*: base / glow tables over (distance from limb [1 px rows; i = inner -99.5..5.5, o = outer -5.5..1149.5], |x-959.5| [16 px bins]), levels 0-255. hz_g: glow level per film frame. sky_<shot>: smooth sky, 135x240 grid (8 px cells), uint16 = level*256. hs_<shot>: old foreground silhouette y per column. stars_<shot>: x, y at the first frame of the shot (1080p pixel-centre coords), flux r,g,b (levels*px^2). mot_<shot>: lam, omega, cx, cy, t0 of p(t)=c+(p0-c)*exp((lam+i*omega)(f-t0)).')
np.savez_compressed('/home/user/xx/film/compose/backdrops_data.npz',**out)
print('packed',len(done),'shots; size MB',os.path.getsize('/home/user/xx/film/compose/backdrops_data.npz')/1e6)
