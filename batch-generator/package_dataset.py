#!/usr/bin/env python3
"""Package generated output into a Hugging Face dataset (parquet), no heavy deps.

Builds parquet shards in the exact HF layout (audio as struct<bytes,path> plus
embedded `huggingface` feature metadata), so the Hub viewer and `datasets`
recognise the Audio feature without torchcodec at write time.

Columns: id (string), audio (Audio @44100), utterance (string JSON),
landmarks (string JSON), sex ('M'/'F').

Examples:
    python package_dataset.py --out hf_dataset                 # all of output/
    python package_dataset.py --out /tmp/ds_test --limit 50    # quick test
    python package_dataset.py --out hf_dataset --push mcamara/all-words-in-english-with-pink-trombone
"""
import argparse
import json
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

VOICES = {"male": "M", "female": "F"}
SHARD_ROWS = 16000

HF_FEATURES = {
    "info": {"features": {
        "id": {"dtype": "string", "_type": "Value"},
        "audio": {"sampling_rate": 44100, "_type": "Audio"},
        "utterance": {"dtype": "string", "_type": "Value"},
        "landmarks": {"dtype": "string", "_type": "Value"},
        "sex": {"dtype": "string", "_type": "Value"},
    }}
}

AUDIO_TYPE = pa.struct([("bytes", pa.binary()), ("path", pa.string())])
SCHEMA = pa.schema(
    [
        ("id", pa.string()),
        ("audio", AUDIO_TYPE),
        ("utterance", pa.string()),
        ("landmarks", pa.string()),
        ("sex", pa.string()),
    ],
    metadata={b"huggingface": json.dumps(HF_FEATURES).encode("utf-8")},
)


def collect(output_dir, limit):
    out = Path(output_dir)
    recs = []
    for voice, sex in VOICES.items():
        wd, ld, ud = out / voice / "wav", out / voice / "landmarks", out / voice / "utterance"
        if not wd.is_dir():
            continue
        wavs = sorted(wd.glob("*.wav"))
        if limit:
            wavs = wavs[:limit]
        for w in wavs:
            recs.append((w.stem, voice, sex, w, ud / f"{w.stem}.json", ld / f"{w.stem}.json"))
    recs.sort(key=lambda r: (r[0], r[2]))  # by word, then voice
    return recs


def write_shard(recs, path):
    ids, audios, utts, lms, sexes = [], [], [], [], []
    for wid, voice, sex, wav, uttp, lmp in recs:
        ids.append(wid)
        audios.append({"bytes": wav.read_bytes(), "path": f"{voice}/{wid}.wav"})
        utts.append(uttp.read_text(encoding="utf-8") if uttp.exists() else "")
        lms.append(lmp.read_text(encoding="utf-8") if lmp.exists() else "")
        sexes.append(sex)
    tbl = pa.Table.from_arrays(
        [
            pa.array(ids, pa.string()),
            pa.array(audios, AUDIO_TYPE),
            pa.array(utts, pa.string()),
            pa.array(lms, pa.string()),
            pa.array(sexes, pa.string()),
        ],
        schema=SCHEMA,
    )
    pq.write_table(tbl, path)
    return len(recs)


def build_readme(num_examples):
    card = Path(__file__).with_name("dataset_card.md")
    prose = card.read_text(encoding="utf-8") if card.exists() else "# Pink Trombone English Dataset"
    yaml = f"""---
license: mit
language: en
pretty_name: "Pink Trombone English Phonetic & Landmark Dataset"
tags:
  - audio
  - speech-synthesis
  - acoustic-landmarks
  - phonetics
dataset_info:
  features:
  - name: id
    dtype: string
  - name: audio
    dtype:
      audio:
        sampling_rate: 44100
  - name: utterance
    dtype: string
  - name: landmarks
    dtype: string
  - name: sex
    dtype: string
  splits:
  - name: train
    num_examples: {num_examples}
configs:
- config_name: default
  data_files:
  - split: train
    path: data/train-*
---

"""
    return yaml + prose


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output-dir", default="output")
    ap.add_argument("--out", help="write dataset (data/ + README.md) here")
    ap.add_argument("--push", help="dataset repo id to upload to")
    ap.add_argument("--private", action="store_true")
    ap.add_argument("--limit", type=int, default=None, help="cap words per voice (testing)")
    args = ap.parse_args()

    recs = collect(args.output_dir, args.limit)
    if not recs:
        print(f"No output under {args.output_dir}/<voice>/wav")
        return 1
    n_m = sum(1 for r in recs if r[2] == "M")
    n_f = sum(1 for r in recs if r[2] == "F")
    print(f"{len(recs)} rows (M={n_m}, F={n_f})")

    outdir = Path(args.out) if args.out else None
    if not outdir and args.push:
        outdir = Path("hf_dataset")
    if not outdir:
        print("Nothing to do: pass --out and/or --push")
        return 1

    datadir = outdir / "data"
    datadir.mkdir(parents=True, exist_ok=True)
    n_shards = max(1, (len(recs) + SHARD_ROWS - 1) // SHARD_ROWS)
    for i in range(n_shards):
        chunk = recs[i * SHARD_ROWS:(i + 1) * SHARD_ROWS]
        p = datadir / f"train-{i:05d}-of-{n_shards:05d}.parquet"
        n = write_shard(chunk, str(p))
        print(f"  wrote {p.name} ({n} rows)")
    (outdir / "README.md").write_text(build_readme(len(recs)), encoding="utf-8")
    print(f"Dataset written to {outdir} ({n_shards} shards + README.md)")

    if args.push:
        from huggingface_hub import HfApi
        api = HfApi()
        api.create_repo(args.push, repo_type="dataset", private=args.private, exist_ok=True)
        print(f"Uploading to {args.push} ...")
        api.upload_folder(folder_path=str(outdir), repo_id=args.push, repo_type="dataset")
        print("Push complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
