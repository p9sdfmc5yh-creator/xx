#!/usr/bin/env python3
"""audio.py — synthesise the original soundtrack (numpy only, no samples).

Structure mirrors the reference film's sound design:
  0.0 – 3.3 s   sparse plucked notes on each cut over a breath of air
  3.3 – 8.7 s   plucks on every cut, soft drum pulse, drone swelling
  8.7 – 15.96 s the tagline lands: big drum on each text beat, wood-block ticks on every cut,
                tremolo strings + noise riser + drum roll building to a guzheng glissando
  15.96 s       everything stops dead; only the room and a small chime ring on
  17.28 s       a deep temple bell under the second title card, fading out before the loop point

Each film of the series gets its own colour on the same skeleton (see PRESETS):
  arch      D-gong pentatonic · guzheng plucks · big drum · wood block · temple bell
  coins     A-yu (minor) pentatonic · bronze chime-bell (编钟) strikes · coin clinks · a spinning coin under the last card
  antiques  F-gong pentatonic · guqin-like slides + porcelain chimes · jade clicks · singing bowl

  tcm       G-gong pentatonic · soft plucks over guqin bass · brass-mortar knocks · singing bowl

Usage: python3 tools/audio.py [out.wav] [--film arch|coins|antiques|tcm]
"""
import sys, wave, json, os
import numpy as np

SR = 48000
DUR = 20.0
N = int(SR * DUR)
FPS = 25
rng = np.random.default_rng(20261110)

# cut list (frames) — must match src/timeline.js
FRAMES = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5]
CUTS = [0.0]
for f in FRAMES:
    CUTS.append(CUTS[-1] + f / FPS)
T_TITLE = CUTS[-1]            # 15.96
CUTS = CUTS[:-1]              # 37 shot starts
T_BEAT1, T_BEAT2, T_BEAT3 = CUTS[14], CUTS[19], CUTS[24]   # 8.72, 10.68, 12.48
T_CARD_B = T_TITLE + 33 / FPS  # 17.28

# D-gong pentatonic (D E F# A B)
def note(name):
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + (octave - 4) * 12) / 12)

PENTA = [note(n) for n in ['D3', 'E3', 'F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6']]


def band_noise(n, lo, hi, soft=0.25):
    """white noise band-limited to [lo, hi] Hz with soft edges (FFT domain)."""
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    w = np.clip((f - lo * (1 - soft)) / (lo * soft + 1e-9), 0, 1) * np.clip((hi * (1 + soft) - f) / (hi * soft + 1e-9), 0, 1)
    y = np.fft.irfft(X * w, n)
    return y / (np.max(np.abs(y)) + 1e-9)


def pluck(f, dur=2.4, vel=1.0, bright=1.0, bend=0.0, vib=0.0):
    """plucked silk/steel string (guzheng-ish): additive harmonics with faster decay up high, a noisy pick attack,
    optional pitch bend (semitones, decays into the note) and delayed vibrato."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f * 2 ** ((bend * np.exp(-t / 0.07)) / 12)
    if vib:
        fr = fr * (1 + vib * 0.006 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.12) / 0.2, 0, 1))
    phase = 2 * np.pi * np.cumsum(fr) / SR
    base_tau = 1.05 * (220.0 / f) ** 0.45
    nh = int(min(36, (SR * 0.42) / f))
    y = np.zeros(n)
    for k in range(1, nh + 1):
        fk = k * np.sqrt(1 + 0.00035 * k * k)
        amp = (np.sin(np.pi * k * 0.17) ** 2 + 0.12) / k ** (1.25 - 0.25 * bright)
        tau = base_tau / (1 + 0.32 * (k - 1) / bright)
        y += amp * np.exp(-t / tau) * np.sin(fk * phase + rng.uniform(0, 2 * np.pi))
    y /= np.max(np.abs(y)) + 1e-9
    att = band_noise(n, 1500, 7000) * np.exp(-t / 0.0035) * 0.5 * bright
    y = (y + att) * np.clip(t / 0.0015, 0, 1)
    return y * vel


def drum(dur=1.6, f0=58.0, vel=1.0, tau=0.38, slap=0.6):
    """big barrel drum (大鼓): pitch-dropping body + membrane mode + skin slap."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f0 * (1 + 1.9 * np.exp(-t / 0.028))
    body = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / tau)
    mode = 0.35 * np.sin(2 * np.pi * f0 * 2.31 * t + 0.4) * np.exp(-t / (tau * 0.35))
    sl = band_noise(n, 300, 2600) * np.exp(-t / 0.014) * slap
    y = (body + mode + sl) * np.clip(t / 0.001, 0, 1)
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def woodblock(vel=1.0, f=1180.0):
    """梆子 / 板: short hollow click."""
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.022) + 0.55 * np.sin(2 * np.pi * f * 2.36 * t) * np.exp(-t / 0.012)
    y += band_noise(n, 2000, 9000) * np.exp(-t / 0.003) * 0.5
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def chime(f=2093.0, dur=3.2, vel=1.0):
    """small bronze chime (碰铃)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * r * t + p) * np.exp(-t / d)
            for r, a, d, p in [(1, 1, 1.5, 0), (2.04, 0.5, 0.9, 1), (2.76, 0.32, 0.6, 2), (4.1, 0.18, 0.35, 3), (1.003, 0.6, 1.4, 0.5)])
    return y / (np.max(np.abs(y)) + 1e-9) * vel * np.clip(t / 0.002, 0, 1)


def bell(f0=146.83, dur=3.4, vel=1.0):
    """deep temple bell (钟): hum / prime / tierce / quint / nominal partials with slow beating."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    parts = [(0.5, 1.0, 5.5), (1.0, 0.85, 4.0), (1.19, 0.5, 3.0), (1.5, 0.42, 2.4), (2.0, 0.55, 2.0), (2.51, 0.28, 1.4), (3.01, 0.2, 1.1), (4.17, 0.12, 0.7), (5.43, 0.07, 0.45)]
    y = np.zeros(n)
    for r, a, d in parts:
        for det in (-0.35, 0.35):
            y += 0.5 * a * np.sin(2 * np.pi * (f0 * r + det * r) * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
    strike = band_noise(n, 200, 3500) * np.exp(-t / 0.02) * 0.35
    y = (y + strike) * np.clip(t / 0.003, 0, 1)
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def chimebell(f, dur=1.8, vel=1.0, bright=1.0, bend=0.0, vib=0.0):
    """bronze chime-bell (编钟): strong strike tone, minor-third-ish partial, quick metallic shimmer."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    parts = [(1.0, 1.0, 0.9), (2.0, 0.45, 0.55), (2.41, 0.5, 0.42), (3.0, 0.22, 0.32), (4.07, 0.25 * bright, 0.22), (5.3, 0.14 * bright, 0.15), (6.8, 0.08 * bright, 0.1)]
    base = (330.0 / f) ** 0.35
    y = np.zeros(n)
    for r, a, d in parts:
        for det in (-0.6, 0.6):
            y += 0.5 * a * np.sin(2 * np.pi * (f * r + det) * t + rng.uniform(0, 6.28)) * np.exp(-t / (d * base))
    strike = band_noise(n, 900, 6000) * np.exp(-t / 0.006) * 0.45 * bright
    y = (y + strike) * np.clip(t / 0.001, 0, 1)
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def porcelain(f, dur=1.6, vel=1.0, bright=1.0, bend=0.0, vib=0.0):
    """thin porcelain / glass tap: pure, slightly sharp upper partials, soft attack."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    parts = [(1.0, 1.0, 0.7), (2.76, 0.35, 0.3), (5.4, 0.16 * bright, 0.14), (1.002, 0.5, 0.65), (8.9, 0.05 * bright, 0.06)]
    base = (440.0 / f) ** 0.3
    y = sum(a * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.28)) * np.exp(-t / (d * base)) for r, a, d in parts)
    y = (y + band_noise(n, 2500, 9000) * np.exp(-t / 0.002) * 0.2) * np.clip(t / 0.002, 0, 1)
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def guqin(f, dur=2.8, vel=1.0, bright=1.0, bend=0.0, vib=0.0):
    """guqin-like low silk string: dark, long, with a slide into the note and slow vibrato."""
    return pluck(f, dur=dur, vel=vel, bright=0.55 * bright, bend=bend if bend else -1.5, vib=max(vib, 1.4))


def coin_clink(vel=1.0, f=3100.0):
    """two coins touching: bright inharmonic ring, a few ms of contact noise."""
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * r * t + p) * np.exp(-t / d) for r, a, d, p in [(1, 1, 0.05, 0), (1.52, 0.7, 0.04, 1), (2.07, 0.5, 0.03, 2), (2.9, 0.3, 0.02, 3)])
    y += band_noise(n, 3000, 11000) * np.exp(-t / 0.002) * 0.6
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def jade_click(vel=1.0, f=2200.0):
    """two pieces of jade tapped together: short, glassy, a touch lower than the coin."""
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.03) + 0.4 * np.sin(2 * np.pi * f * 2.63 * t) * np.exp(-t / 0.014)
    y += band_noise(n, 2500, 8000) * np.exp(-t / 0.0015) * 0.35
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def coin_spin(dur=2.4, vel=1.0, f=2650.0):
    """a coin spinning down on a table: a ring whose wobble accelerates until it settles."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    wob = 9 * np.exp(2.6 * u)                       # wobble rate rises
    am = 0.5 + 0.5 * np.cos(2 * np.pi * np.cumsum(wob) / SR)
    env = np.clip(t / 0.02, 0, 1) * (1 - u) ** 0.8 * np.clip((1 - u) / 0.06, 0, 1)
    y = sum(a * np.sin(2 * np.pi * f * r * t + p) for r, a, p in [(1, 1, 0), (1.51, 0.55, 1), (2.1, 0.3, 2)]) * am * env
    y += band_noise(n, 1500, 7000) * am ** 3 * env * 0.25
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def bowl(f0=196.0, dur=3.4, vel=1.0):
    """singing bowl / 磬: clean beating partials, very slow decay."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for r, a, d in [(1.0, 1.0, 5.0), (2.71, 0.55, 3.2), (5.15, 0.3, 1.8), (8.2, 0.12, 1.0)]:
        for det in (-0.5, 0.5):
            y += 0.5 * a * np.sin(2 * np.pi * (f0 * r + det * r ** 0.5) * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
    y = (y + band_noise(n, 300, 2500) * np.exp(-t / 0.03) * 0.15) * np.clip(t / 0.004, 0, 1)
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def mortar(vel=1.0, f=1560.0):
    """pestle on a small brass mortar (铜冲): a short, warm bell-like knock."""
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * r * t + p) * np.exp(-t / d) for r, a, d, p in [(1, 1, 0.07, 0), (2.32, 0.5, 0.045, 1), (3.9, 0.25, 0.025, 2), (0.5, 0.35, 0.05, 0.5)])
    y += band_noise(n, 800, 5000) * np.exp(-t / 0.004) * 0.5
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def scale(names):
    return [note(n) for n in names]


PRESETS = {
    'arch': dict(
        scale=scale(['D3', 'E3', 'F#3', 'A3', 'B3', 'D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6']),
        gliss=scale(['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6']),
        root=note('D2'), fifth=note('A2'), pad=['D2', 'A2', 'D3', 'A3'], trem=['A4', 'D5', 'E5', 'A5'],
        lead=pluck, lead_gain=0.0, low=pluck, tick=woodblock, tick_f=(1180.0, 1.19), chimes=['A6', 'D7'], ending='bell', end_f=note('D3'), end_extra=note('A3')),
    'coins': dict(
        scale=scale(['A2', 'C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5']),
        gliss=scale(['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6']),
        root=note('A1'), fifth=note('E2'), pad=['A1', 'E2', 'A2', 'E3'], trem=['E4', 'A4', 'C5', 'E5'],
        lead=chimebell, lead_gain=1.5, low=pluck, tick=coin_clink, tick_f=(3100.0, 1.12), chimes=['E6', 'A6'], ending='coin', end_f=note('A2'), end_extra=note('E3')),
    'antiques': dict(
        scale=scale(['F2', 'G2', 'A2', 'C3', 'D3', 'F3', 'G3', 'A3', 'C4', 'D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5']),
        gliss=scale(['F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6', 'C7']),
        root=note('F1'), fifth=note('C2'), pad=['F2', 'C3', 'F3', 'C4'], trem=['C4', 'F4', 'G4', 'C5'],
        lead=guqin, lead_gain=1.0, low=guqin, tick=jade_click, tick_f=(2200.0, 1.26), chimes=['C6', 'F6'], ending='bowl', end_f=note('F2'), end_extra=note('C3'),
        sparkle=porcelain),
    'tcm': dict(
        scale=scale(['G2', 'A2', 'B2', 'D3', 'E3', 'G3', 'A3', 'B3', 'D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5']),
        gliss=scale(['G3', 'A3', 'B3', 'D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5', 'B5', 'D6']),
        root=note('G1'), fifth=note('D2'), pad=['G2', 'D3', 'G3', 'D4'], trem=['D4', 'G4', 'A4', 'D5'],
        lead=pluck, lead_gain=0.5, low=guqin, tick=mortar, tick_f=(1560.0, 1.33), chimes=['D6', 'G6'], ending='bowl', end_f=note('G2'), end_extra=note('D3')),
}


class Mix:
    def __init__(self):
        self.dry = np.zeros((N + SR * 6, 2))
        self.send = np.zeros((N + SR * 6, 2))

    def add(self, y, t0, pan=0.0, gain=1.0, send=0.25):
        i = int(round(t0 * SR))
        if i < 0:
            y = y[-i:]; i = 0
        n = min(len(y), len(self.dry) - i)
        if n <= 0:
            return
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        seg = y[:n] * gain
        self.dry[i:i + n, 0] += seg * l; self.dry[i:i + n, 1] += seg * r
        self.send[i:i + n, 0] += seg * l * send; self.send[i:i + n, 1] += seg * r * send


def db(x):
    return 10 ** (x / 20)


def build(film='arch'):
    P = PRESETS[film]
    PENTA = P['scale']
    lead, low, tick = P['lead'], P['low'], P['tick']
    m = Mix()
    t = np.arange(N) / SR

    # ── 1. plucked melody: one note per cut, climbing ──
    #    index into PENTA for each of the 37 cuts
    melody = [0, 3, 5,            # slow holds: D3, A3, D4
              6, 7, 8, 9,         # quick run up: E4 F#4 A4 B4
              8, 7, 8, 9, 10, 9, 10,   # medium section, a wave that keeps rising
              11, 10, 11, 12, 11,      # beat 1
              12, 13, 12, 13, 14,      # beat 2
              13, 14, 15, 14, 15, 13, 14, 15, 14, 15, 15, 15, 15]  # beat 3
    for i, (tc, mi) in enumerate(zip(CUTS, melody)):
        u = tc / T_TITLE
        vel = db(-27 + 23 * u ** 0.85)
        f = PENTA[mi]
        bend = -1.0 if i in (1, 2, 7, 11, 14, 19, 24) else (0.6 if i % 5 == 3 else 0.0)
        y = lead(f, dur=2.6 if i < 3 else 1.6, vel=vel * db(P['lead_gain']), bright=0.8 + 0.7 * u, bend=bend, vib=1.0 if i < 14 else 0.0)
        if P.get('sparkle') and i >= 3:   # a porcelain tap doubling the melody two octaves up
            m.add(P['sparkle'](f * 4, vel=vel * 0.5, bright=0.8 + 0.6 * u), tc + 0.004, pan=(0.5 if i % 2 else -0.5), send=0.5)
        m.add(y, tc + 0.004, pan=(-0.35 if i % 2 else 0.35) * (0.4 + 0.6 * u), send=0.4)
        if i >= 24:  # double with the octave below for body during the last push
            m.add(pluck(f / 2 if f > 300 else f, dur=1.0, vel=vel * 0.55, bright=1.2), tc + 0.004, pan=0.0, send=0.3)
    # low string anchors
    R0, R5 = P['root'], P['fifth']
    for tc, f, v in [(0.02, R0, -27), (CUTS[3], R0, -21), (CUTS[7], R5, -18), (CUTS[10], R0, -15),
                     (T_BEAT1, R0, -8), (T_BEAT2, R5, -7), (T_BEAT3, R0, -6)]:
        m.add(low(f * (2 if f < 60 else 1), dur=3.2, vel=db(v), bright=0.7), tc, pan=0, send=0.3)

    # ── 2. drums ──
    for i, tc in enumerate(CUTS):
        if 3 <= i < 14:   # soft pulse on each cut, growing
            m.add(drum(vel=db(-27 + 11 * (i - 3) / 11), f0=64, tau=0.22, slap=0.3), tc, send=0.18)
        elif i >= 14:     # after the text arrives, the pulse is firm
            u = (tc - T_BEAT1) / (T_TITLE - T_BEAT1)
            m.add(drum(vel=db(-13 + 5 * u), f0=62, tau=0.2, slap=0.5), tc, send=0.15)
    for tc, v in [(T_BEAT1, -5.5), (T_BEAT2, -4.5), (T_BEAT3, -3.5)]:   # the three text beats
        m.add(drum(dur=2.2, vel=db(v), f0=50, tau=0.55, slap=0.8), tc, send=0.35)
    # accelerating roll into the title (small drum), 13.9 → 15.96
    tt, k = 13.92, 0
    while tt < T_TITLE - 0.02:
        u = (tt - 13.92) / (T_TITLE - 13.92)
        m.add(drum(dur=0.5, vel=db(-24 + 15 * u) * (1.0 if k % 2 == 0 else 0.72), f0=118 + 14 * u, tau=0.07, slap=0.9), tt, pan=0.25 * (-1) ** k, send=0.2)
        tt += 0.125 * (1 - 0.62 * u) + 0.012
        k += 1

    # ── 3. wood-block ticks on every cut once the text is up ──
    for i, tc in enumerate(CUTS):
        if i >= 14:
            u = (tc - T_BEAT1) / (T_TITLE - T_BEAT1)
            m.add(tick(vel=db(-17 + 6 * u), f=P['tick_f'][0] * (1.0 if i % 2 else P['tick_f'][1])), tc, pan=0.5 * (-1) ** i, send=0.3)
        elif i >= 4:
            m.add(tick(vel=db(-31), f=P['tick_f'][0] * 0.83), tc, pan=0.3 * (-1) ** i, send=0.35)

    # ── 4. drone: open fifth on D, swelling the whole way ──
    swell = np.interp(t, [0, 1.0, 3.3, 8.7, 12.5, T_TITLE - 0.02, T_TITLE], [-60, -44, -37, -26, -20, -14, -14])
    gate = (t < T_TITLE).astype(float)
    pad = np.zeros((N, 2))
    for ch in (0, 1):
        for f, a in zip([note(x) for x in P['pad']], [1.0, 0.7, 0.5, 0.3]):
            for det in (-0.4, 0.0, 0.5):
                ff = f * (1 + det * 0.004) * (1 + 0.0015 * (ch * 2 - 1))
                for h, ha in [(1, 1.0), (2, 0.42), (3, 0.22), (4, 0.1)]:
                    bright = np.clip((t / T_TITLE) ** 1.5, 0, 1) if h > 1 else 1.0
                    pad[:, ch] += a * ha * bright * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) * (1 + 0.15 * np.sin(2 * np.pi * rng.uniform(0.07, 0.19) * t + rng.uniform(0, 6.28)))
    pad /= np.max(np.abs(pad)) + 1e-9
    pad *= (db(swell) * gate)[:, None]
    m.dry[:N] += pad; m.send[:N] += pad * 0.2

    # ── 5. tremolo strings from beat 2, rising cluster ──
    trem = np.zeros((N, 2))
    env = np.interp(t, [T_BEAT2 - 0.3, T_BEAT2 + 0.3, T_BEAT3, T_TITLE - 0.02, T_TITLE], [-70, -30, -23, -14.5, -14.5]) * 1.0
    for j, f in enumerate([note(x) for x in P['trem']]):
        rate = 12.5 + 1.3 * j
        am = 0.5 + 0.5 * np.abs(np.sin(np.pi * rate * t + rng.uniform(0, 6.28))) ** 0.8
        v = sum(np.sin(2 * np.pi * f * h * t * (1 + 0.0012 * (j - 1.5)) + rng.uniform(0, 6.28)) / h ** 1.3 for h in range(1, 9))
        late = np.clip((t - (T_BEAT2 + 0.9 * j)) / 0.6, 0, 1)   # voices enter one by one
        pan = -0.6 + 0.4 * j
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        trem[:, 0] += v * am * late * l; trem[:, 1] += v * am * late * r
    trem /= np.max(np.abs(trem)) + 1e-9
    trem *= (db(env) * gate)[:, None]
    m.dry[:N] += trem; m.send[:N] += trem * 0.35

    # ── 6. noise riser from beat 3 ──
    riser = np.zeros(N)
    bands = [(300, 600), (600, 1200), (1200, 2400), (2400, 4400), (4400, 7000)]
    for j, (lo, hi) in enumerate(bands):
        start = T_BEAT3 - 0.6 + j * 0.55
        e = np.clip((t - start) / (T_TITLE - start), 0, 1) ** 2.2
        riser += band_noise(N, lo, hi) * e * (0.9 - 0.1 * j)
    riser *= db(-21) * gate
    air = band_noise(N, 150, 900) * db(np.interp(t, [0, 0.4, 2.5, 6, T_TITLE], [-56, -44, -46, -50, -50])) * gate   # dawn air
    for ch in (0, 1):
        m.dry[:N, ch] += riser + air * (1.0 if ch == 0 else 0.9)
    m.send[:N, 0] += riser * 0.2; m.send[:N, 1] += riser * 0.2

    # ── 7. guzheng glissando sweeping up into the cut (刮奏), 15.50 → 15.94 ──
    gl = P['gliss']
    for j, f in enumerate(gl):
        tt = 15.50 + 0.44 * (j / (len(gl) - 1)) ** 0.85
        m.add(pluck(f, dur=0.9, vel=db(-13 + 6 * j / len(gl)), bright=1.5), tt, pan=-0.6 + 1.2 * j / len(gl), send=0.5)
    # a softer downward sweep announcing beat 3
    for j, f in enumerate(reversed(gl[3:11])):
        m.add(pluck(f, dur=0.8, vel=db(-20), bright=1.2), T_BEAT3 - 0.26 + 0.03 * j, pan=0.5 - j * 0.12, send=0.5)

    # hard stop at the title: dry signal is cut within 6 ms; only the reverb send that is already in the air survives
    cut = int(T_TITLE * SR); fade = int(0.006 * SR)
    ramp = np.linspace(1, 0, fade)
    for bus in (m.dry, m.send):
        bus[cut - fade:cut] *= ramp[:, None]
        bus[cut:] = 0

    # ── 8. after the cut ──
    m.add(chime(f=note(P['chimes'][0]), vel=db(-23)), T_TITLE + 0.02, pan=0.2, send=0.8)
    m.add(chime(f=note(P['chimes'][1]), vel=db(-27)), T_TITLE + 0.34, pan=-0.3, send=0.8)
    if P['ending'] == 'bell':
        m.add(bell(f0=P['end_f'], dur=3.4, vel=db(-10.5)), T_CARD_B, pan=0, send=0.5)
    elif P['ending'] == 'coin':
        m.add(bell(f0=P['end_f'], dur=3.2, vel=db(-13.5)), T_CARD_B, pan=0, send=0.5)
        m.add(chimebell(P['end_f'] * 4, dur=2.4, vel=db(-15)), T_CARD_B + 0.01, pan=-0.2, send=0.6)
        m.add(coin_spin(dur=2.2, vel=db(-21)), T_CARD_B + 0.12, pan=0.25, send=0.35)
    else:
        m.add(bowl(f0=P['end_f'] * 2, dur=3.4, vel=db(-10.5)), T_CARD_B, pan=0, send=0.55)
        m.add(porcelain(P['end_f'] * 8, dur=2.0, vel=db(-22)), T_CARD_B + 0.03, pan=0.3, send=0.7)
    m.add(low(P['root'] * (2 if P['root'] < 60 else 1), dur=3.0, vel=db(-17), bright=0.6), T_CARD_B, send=0.4)
    m.add(pluck(P['end_extra'], dur=2.4, vel=db(-23), bright=0.8, bend=-1), T_CARD_B + 0.02, pan=0.3, send=0.5)

    # ── reverb: decaying coloured noise impulse response, one per channel ──
    ir_len = int(2.6 * SR)
    ti = np.arange(ir_len) / SR
    out = m.dry.copy()
    for ch in (0, 1):
        ir = rng.standard_normal(ir_len) * np.exp(-ti / 0.62)
        # darker tail: blend toward a low-passed copy over time
        X = np.fft.rfft(ir); f = np.fft.rfftfreq(ir_len, 1 / SR)
        dark = np.fft.irfft(X / (1 + (f / 2200) ** 2), ir_len)
        mixk = np.clip(ti / 0.5, 0, 1)
        ir = ir * (1 - mixk) + dark * mixk * 2.2
        ir[: int(0.012 * SR)] = 0   # pre-delay
        ir /= np.sqrt(np.sum(ir ** 2))
        L = len(m.send) + ir_len
        nfft = 1 << int(np.ceil(np.log2(L)))
        wet = np.fft.irfft(np.fft.rfft(m.send[:, ch], nfft) * np.fft.rfft(ir, nfft), nfft)[: len(out)]
        out[:, ch] += wet * 0.75
    out = out[:N]

    # tail fade so the loop point is silent
    fo = np.clip((DUR - 0.04 - t) / 1.0, 0, 1) ** 1.5
    out *= fo[:, None]
    # gentle high-pass (remove DC / sub rumble) and soft limiter
    X = np.fft.rfft(out, axis=0); f = np.fft.rfftfreq(N, 1 / SR)
    hp = (f / 28) ** 2 / (1 + (f / 28) ** 2)
    out = np.fft.irfft(X * hp[:, None], N, axis=0)
    peak = np.max(np.abs(out))
    out = out / peak * 1.2
    out = np.tanh(out * 1.05) / np.tanh(1.05 * 1.2) * db(-2.5)
    return out


def main():
    argv = sys.argv[1:]
    film = 'arch'
    if '--film' in argv:
        i = argv.index('--film'); film = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    path = argv[0] if argv else os.path.join(os.path.dirname(__file__), '..', 'build', film, 'soundtrack.wav')
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    y = build(film)
    pcm = np.clip(y, -1, 1)
    pcm = (pcm * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    hop = int(0.25 * SR)
    env = [20 * np.log10(np.sqrt(np.mean(y[i:i + hop] ** 2)) + 1e-9) for i in range(0, N, hop)]
    print(json.dumps({'film': film, 'file': os.path.abspath(path), 'seconds': DUR, 'peak_dbfs': round(float(20 * np.log10(np.max(np.abs(y)))), 2),
                      'title_cut': T_TITLE, 'card_b': T_CARD_B, 'rms_db_per_250ms': [round(float(e), 1) for e in env]}))


if __name__ == '__main__':
    main()
