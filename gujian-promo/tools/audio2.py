#!/usr/bin/env python3
"""audio2.py — original soundtrack for the square plate films (coins2), synthesised with the instruments of tools/audio.py.

The arrangement follows the picture, cut for cut (cut times are read from the film's timeline.js):
  slow plates      one bronze chime-bell note on every cut, climbing, over low plucked anchors and a soft drum that wakes up
  flashes          a coin clink + wood tick on every 3-frame plate, a pentatonic run that keeps rising, a pulse every fourth plate, a noise riser;
                   a chime-bell marks the first plate of each character (志 → 和 → 诚)
  three holds      three big drum-and-bell hits (the pour, the plum branch, the hundred coins)
  the coins fly    a glissando and a rush of air into the title cut, with coins clinking away to the sides
  title / brand    everything stops dead; a deep bell under the film's name, a second softer bell and a spinning coin under the house name

Usage: python3 tools/audio2.py [out.wav] [--film coins2]
"""
import os, re, sys, json, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio as A

SR, N, DUR, db = A.SR, A.N, A.DUR, A.db
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 25


def cut_list(film):
    src = open(os.path.join(ROOT, 'src', 'films', film, 'timeline.js'), encoding='utf-8').read()
    rows = re.findall(r'\{ id: "([^"]+)", scene: "[^"]+", frames: (\d+)', src)
    out, f = [], 0
    for sid, n in rows:
        out.append((sid, f / FPS, int(n))); f += int(n)
    if f != int(DUR * FPS):
        raise SystemExit(f'timeline has {f} frames, the soundtrack is built for {int(DUR * FPS)}')
    return out


def build(film='coins2'):
    C = cut_list(film); T = {sid: t for sid, t, _ in C}
    P = A.PRESETS['coins']; PENTA = P['scale']; gl = P['gliss']; R0, R5 = P['root'], P['fifth']
    m = A.Mix(); t = np.arange(N) / SR
    slow = [c for c in C if c[0][0] == 'p']
    flash = [c for c in C if c[0][0] == 'f']
    t_h1, t_h2, t_h3, t_z1, t_title, t_brand = T['h1'], T['h2'], T['h3'], T['z1'], T['title'], T['brand']
    t_fly = t_z1 + 12 / FPS                       # the coins leave the page

    # ── 1. slow plates ──
    mel = [0, 3, 5, 6, 8, 7, 9, 10, 9, 11, 10, 12, 11, 12, 13, 14]
    for i, (sid, tc, n) in enumerate(slow):
        u = min(1.0, i / 10)
        m.add(A.chimebell(PENTA[mel[i % len(mel)]], dur=2.6 if i < 4 else 1.5, vel=db(-23 + 9 * u), bright=0.8 + 0.5 * u, vib=1.0 if i < 4 else 0.0),
              tc + 0.004, pan=(-0.3 if i % 2 else 0.3), send=0.45)
        if i >= 1:
            m.add(A.coin_clink(vel=db(-31 + 8 * u), f=3100.0 * (1.0 if i % 2 else 1.12)), tc, pan=0.45 * (-1) ** i, send=0.3)
        if i >= 3:
            m.add(A.drum(vel=db(-26 + 9 * (i - 3) / 9), f0=64, tau=0.22, slap=0.3), tc, send=0.18)
    lowf = lambda f: f * (2 if f < 60 else 1)
    m.add(A.pluck(lowf(R0), dur=3.4, vel=db(-23), bright=0.6), 0.02, send=0.35)
    if len(slow) > 7:
        m.add(A.pluck(lowf(R5), dur=3.0, vel=db(-20), bright=0.6), slow[3][1], send=0.3)
        m.add(A.pluck(lowf(R0), dur=3.0, vel=db(-17), bright=0.7), slow[7][1], send=0.3)

    # ── 2. the flashes ──
    nF = len(flash)
    for k, (sid, tc, n) in enumerate(flash):
        u = k / max(1, nF - 1)
        m.add(A.coin_clink(vel=db(-26 + 9 * u), f=2500.0 * (1 + 0.45 * u) * (1.0 if k % 2 else 1.19)), tc, pan=0.6 * (-1) ** k, send=0.25)
        m.add(A.woodblock(vel=db(-28 + 8 * u), f=1180.0 * (1.0 if k % 2 else 1.19)), tc, pan=0.4 * (-1) ** (k + 1), send=0.2)
        if k % 2 == 0:
            idx = min(len(PENTA) - 1, 4 + int(round(11 * u)))
            m.add(A.pluck(PENTA[idx], dur=0.7, vel=db(-22 + 8 * u), bright=1.0 + 0.6 * u), tc + 0.003, pan=-0.4 + 0.8 * u, send=0.35)
        if k % 4 == 0:
            m.add(A.drum(vel=db(-16 + 6 * u), f0=62, tau=0.2, slap=0.5), tc, send=0.15)
    # the three runs (志 / 和 / 诚): a low anchor and a chime-bell on the first plate of each character
    for j, (f0, hi) in enumerate([(R0, 9), (R5, 11), (R0, 13)]):
        t0 = flash[min(nF - 1, j * (nF // 3))][1]
        m.add(A.pluck(lowf(f0), dur=3.0, vel=db(-12 + j), bright=0.8), t0, send=0.3)
        m.add(A.chimebell(PENTA[hi], dur=1.6, vel=db(-15 + 1.5 * j), bright=1.1), t0 + 0.004, pan=(-0.3, 0.0, 0.3)[j], send=0.45)
    riser = np.zeros(N)
    for j, (lo, hi) in enumerate([(300, 600), (600, 1200), (1200, 2400), (2400, 4400), (4400, 7000)]):
        start = flash[0][1] + j * 0.7
        e = np.clip((t - start) / (t_h2 - start), 0, 1) ** 2.2 * (t < t_h2)
        riser += A.band_noise(N, lo, hi) * e * (0.9 - 0.1 * j)
    riser *= db(-24)
    edge = int(0.004 * SR); k2 = int(t_h2 * SR); riser[k2 - edge:k2] *= np.linspace(1, 0, edge)

    # ── 3. the three holds ──
    m.add(A.chimebell(PENTA[12], dur=1.0, vel=db(-17)), t_h1, pan=0.2, send=0.4)
    for tc, v, f in [(t_h2, -5.0, R0), (t_h3, -4.5, R5), (t_z1, -4.0, R0)]:
        m.add(A.drum(dur=2.2, vel=db(v), f0=50, tau=0.55, slap=0.8), tc, send=0.35)
        m.add(A.pluck(lowf(f), dur=3.0, vel=db(v - 5), bright=0.9), tc, send=0.3)
    m.add(A.chimebell(PENTA[10], dur=2.2, vel=db(-12)), t_h2 + 0.004, pan=-0.25, send=0.5)
    m.add(A.chimebell(PENTA[12], dur=2.2, vel=db(-12)), t_h3 + 0.004, pan=0.25, send=0.5)
    m.add(A.chimebell(PENTA[14], dur=2.2, vel=db(-11)), t_z1 + 0.004, pan=0.0, send=0.5)
    for j in range(5):                              # petals falling in the plum plate
        m.add(A.porcelain(PENTA[11 + j % 4] * 2, dur=1.0, vel=db(-27)), t_h3 + 0.14 + 0.14 * j, pan=-0.5 + 0.25 * j, send=0.6)

    # ── 4. the coins fly off ──
    span = t_title - 0.03 - t_fly
    for j, f in enumerate(gl):
        m.add(A.pluck(f, dur=0.9, vel=db(-15 + 7 * j / len(gl)), bright=1.5), t_fly + span * (j / (len(gl) - 1)) ** 0.8, pan=-0.6 + 1.2 * j / len(gl), send=0.5)
    for j in range(10):
        m.add(A.coin_clink(vel=db(-23 + 8 * j / 10), f=2600.0 * (1 + 0.04 * j)), t_fly + span * ((j + 0.5) / 10), pan=(-1) ** j * min(0.9, 0.3 + 0.07 * j), send=0.4)
    whoosh = A.band_noise(N, 500, 6000) * (np.clip((t - t_fly) / (t_title - t_fly), 0, 1) ** 2.5) * (t < t_title) * db(-16)
    air = A.band_noise(N, 150, 900) * db(np.interp(t, [0, 0.4, 2.5, 6, t_title], [-56, -45, -47, -50, -50])) * (t < t_title)
    for ch in (0, 1):
        m.dry[:N, ch] += riser + whoosh + air * (1.0 if ch == 0 else 0.9)
    m.send[:N, 0] += (riser + whoosh) * 0.2; m.send[:N, 1] += (riser + whoosh) * 0.2

    # hard stop at the title card: only the reverb already in the air survives
    cut = int(t_title * SR); fade = int(0.006 * SR); ramp = np.linspace(1, 0, fade)
    for bus in (m.dry, m.send):
        bus[cut - fade:cut] *= ramp[:, None]; bus[cut:] = 0

    # ── 5. the two cards ──
    ef = P.get('end_f', A.note('A2'))
    m.add(A.bell(f0=ef, dur=3.4, vel=db(-10.5)), t_title + 0.01, pan=0, send=0.5)
    m.add(A.chimebell(ef * 4, dur=2.4, vel=db(-15)), t_title + 0.02, pan=-0.2, send=0.6)
    m.add(A.chime(f=A.note(P['chimes'][0]), vel=db(-25)), t_title + 0.3, pan=0.3, send=0.8)
    for j, dt in enumerate((0.18, 0.46, 0.8)):      # the last coins leaving the red card
        m.add(A.coin_clink(vel=db(-25 - 2 * j), f=2900.0 * (1 + 0.07 * j)), t_title + dt, pan=0.6 * (-1) ** j, send=0.5)
    m.add(A.bell(f0=ef * 1.5, dur=2.4, vel=db(-13.5)), t_brand + 0.01, pan=0, send=0.5)
    m.add(A.chimebell(ef * 6, dur=2.0, vel=db(-17)), t_brand + 0.02, pan=0.2, send=0.6)
    m.add(A.coin_spin(dur=1.5, vel=db(-22)), t_brand + 0.1, pan=0.25, send=0.35)
    m.add(A.pluck(lowf(R0), dur=2.2, vel=db(-18), bright=0.6), t_brand, send=0.4)

    # ── master: reverb (decaying coloured noise), tail fade, high-pass, soft limiter — same chain as tools/audio.py ──
    ir_len = int(2.6 * SR); ti = np.arange(ir_len) / SR
    out = m.dry.copy()
    for ch in (0, 1):
        ir = A.rng.standard_normal(ir_len) * np.exp(-ti / 0.62)
        X = np.fft.rfft(ir); f = np.fft.rfftfreq(ir_len, 1 / SR)
        dark = np.fft.irfft(X / (1 + (f / 2200) ** 2), ir_len)
        mixk = np.clip(ti / 0.5, 0, 1)
        ir = ir * (1 - mixk) + dark * mixk * 2.2
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        nfft = 1 << int(np.ceil(np.log2(len(m.send) + ir_len)))
        out[:, ch] += np.fft.irfft(np.fft.rfft(m.send[:, ch], nfft) * np.fft.rfft(ir, nfft), nfft)[: len(out)] * 0.75
    out = out[:N]
    out *= (np.clip((DUR - 0.04 - t) / 0.8, 0, 1) ** 1.5)[:, None]
    X = np.fft.rfft(out, axis=0); f = np.fft.rfftfreq(N, 1 / SR)
    out = np.fft.irfft(X * ((f / 28) ** 2 / (1 + (f / 28) ** 2))[:, None], N, axis=0)
    out = out / np.max(np.abs(out)) * 1.2
    out = np.tanh(out * 1.05) / np.tanh(1.05 * 1.2) * db(-2.5)
    return out, dict(h2=t_h2, h3=t_h3, z1=t_z1, fly=t_fly, title=t_title, brand=t_brand)


def main():
    argv = sys.argv[1:]
    film = 'coins2'
    if '--film' in argv:
        i = argv.index('--film'); film = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    path = argv[0] if argv else os.path.join(ROOT, 'build', film, 'soundtrack.wav')
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    y, marks = build(film)
    pcm = (np.clip(y, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    hop = int(0.25 * SR)
    env = [round(float(20 * np.log10(np.sqrt(np.mean(y[i:i + hop] ** 2)) + 1e-9)), 1) for i in range(0, N, hop)]
    print(json.dumps({'film': film, 'file': os.path.abspath(path), 'seconds': DUR, 'peak_dbfs': round(float(20 * np.log10(np.max(np.abs(y)))), 2), 'marks': marks, 'rms_db_per_250ms': env}))


if __name__ == '__main__':
    main()
