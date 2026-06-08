#!/usr/bin/env python3
"""Quality check for generated Pink Trombone WAVs.

Scans a directory of .wav files and flags ones that probably don't "sound
right": silence, near-silence, clipping, anomalous duration, DC offset, or an
unexpected sample rate. Prints per-file flags for the bad ones plus a summary.

Usage:
    python audio_qa.py output/male/wav
    python audio_qa.py output            # recurses into subdirs
    python audio_qa.py output/male/wav --expect-sr 44100 --min-dur 0.1 --max-dur 4.0
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def analyze(path, expect_sr, min_dur, max_dur):
    data, sr = sf.read(path, always_2d=True)
    x = data.mean(axis=1)  # mono
    n = len(x)
    dur = n / sr if sr else 0.0
    peak = float(np.max(np.abs(x))) if n else 0.0
    rms = float(np.sqrt(np.mean(x ** 2))) if n else 0.0
    # fraction of samples below -60 dBFS relative to full scale
    silent_frac = float(np.mean(np.abs(x) < 10 ** (-60 / 20))) if n else 1.0
    clip_frac = float(np.mean(np.abs(x) >= 0.999)) if n else 0.0
    dc = float(np.mean(x)) if n else 0.0

    flags = []
    if n == 0:
        flags.append("EMPTY")
    if peak < 1e-3:
        flags.append("SILENT")
    elif rms < 1e-3:
        flags.append("NEAR_SILENT")
    if clip_frac > 0.01:
        flags.append(f"CLIPPING({clip_frac:.1%})")
    if silent_frac > 0.97:
        flags.append("MOSTLY_SILENCE")
    if dur < min_dur:
        flags.append(f"TOO_SHORT({dur:.2f}s)")
    if dur > max_dur:
        flags.append(f"TOO_LONG({dur:.2f}s)")
    if abs(dc) > 0.02:
        flags.append(f"DC_OFFSET({dc:+.3f})")
    if expect_sr and sr != expect_sr:
        flags.append(f"SR={sr}")
    return dict(dur=dur, sr=sr, peak=peak, rms=rms, clip=clip_frac,
               silent=silent_frac, dc=dc, flags=flags)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="WAV file or directory")
    ap.add_argument("--expect-sr", type=int, default=None,
                    help="flag files whose sample rate differs")
    ap.add_argument("--min-dur", type=float, default=0.08)
    ap.add_argument("--max-dur", type=float, default=5.0)
    ap.add_argument("--show-ok", action="store_true", help="also list clean files")
    args = ap.parse_args()

    root = Path(args.path)
    wavs = sorted(root.rglob("*.wav")) if root.is_dir() else [root]
    if not wavs:
        print(f"No .wav files under {root}")
        return 1

    bad = 0
    durs = []
    for w in wavs:
        try:
            r = analyze(str(w), args.expect_sr, args.min_dur, args.max_dur)
        except Exception as e:
            print(f"[ERROR] {w}: {e}")
            bad += 1
            continue
        durs.append(r["dur"])
        if r["flags"]:
            bad += 1
            print(f"[BAD ] {w.name:20s} {' '.join(r['flags'])}  "
                  f"(dur={r['dur']:.2f}s peak={r['peak']:.3f} rms={r['rms']:.4f})")
        elif args.show_ok:
            print(f"[ok  ] {w.name:20s} dur={r['dur']:.2f}s peak={r['peak']:.3f} rms={r['rms']:.4f} sr={r['sr']}")

    print("-" * 60)
    print(f"Checked {len(wavs)} WAVs | clean: {len(wavs) - bad} | flagged: {bad}")
    if durs:
        d = np.array(durs)
        print(f"Duration: min={d.min():.2f}s mean={d.mean():.2f}s max={d.max():.2f}s")
    return 0 if bad == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
