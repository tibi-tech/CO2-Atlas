import json, subprocess, os, re, math
W = "/mnt/c/Users/tpere/AppData/Local/Temp/opencode/demo"
os.chdir(W)
os.makedirs("build", exist_ok=True)
dur = json.load(open("audio/durations.json"))
nar = json.load(open("narration.json", encoding="utf-8-sig"))
SRC = {"tour": "out/tour.webm", "cards": "out/cards.webm", "real": "out/real.webm", "model": "out/model.webm"}

# name, src, start, end, speed, narration key, badge
SEGS = [
 ("title",   "cards", 0.0, 7.0, 1, "title", None),
 ("home",    "tour", 1.6, 15.8, 1, "home", None),
 ("regions", "tour", 15.8, 21.5, 1, "regions", None),
 ("search",  "real", 2.7, 17.0, 1, "search", None),
 ("form",    "real", 17.0, 37.7, 1.7, "form", None),
 ("prog1",   "real", 37.7, 41.7, 1, "progress", None),
 ("prog2",   "real", 41.7, 211.9, 17, None, "TIME-LAPSE  x17"),
 ("results", "real", 211.9, 222.1, 1, "results", None),
 ("atlas",   "real", 222.1, 251.7, 2, "atlas", None),
 ("breakdown","real", 251.7, 257.9, 1, "breakdown", None),
 ("exports", "real", 257.9, 265.9, 1, "exports", None),
 ("model",   "model", 1.6, 17.1, 1, "m1", None),
 ("thesis",  "tour", 33.5, 39.7, 1, "thesis", None),
 ("end",     "cards", 7.0, 16.0, 1, "end", None),
]
PAD = 0.5
def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

t = 0.0
timeline = []
files = []
for name, src, ss, to, sp, key, badge in SEGS:
    L = (to - ss) / sp
    # prog1 + prog2 share one narration: handle by letting prog1 get it, minimum length
    target = L
    if key:
        need = dur[key] + PAD
        if name == "prog1":
            need = 4.0
        target = L if name == "model" else max(L, need)
    extra = target - L
    vf = f"setpts=(PTS-STARTPTS)/{sp},fps=30,scale=1920:1080,format=yuv420p"
    if extra > 0.01:
        vf += f",tpad=stop_mode=clone:stop_duration={extra:.3f}"
    out = f"build/{name}.mp4"
    run("ffmpeg", "-y", "-ss", str(ss), "-to", str(to), "-i", SRC[src], "-vf", vf, "-an",
        "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-t", f"{target:.3f}", out)
    timeline.append(dict(name=name, start=t, end=t + target, key=key, badge=badge))
    files.append(out)
    t += target
total = t
for k, off in (("m2", 4.24), ("m3", 8.69), ("m4", 12.71)):
    m = [x for x in timeline if x["name"] == "model"][0]
    timeline.append(dict(name="model_" + k, start=m["start"] + off - 0.25, end=m["end"], key=k, badge=None))
print("total", total)
open("build/list.txt", "w").write("".join(f"file '{os.path.basename(f)}'\n" for f in files))
run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "build/list.txt", "-c", "copy", "build/video_raw.mp4")

# narration for prog: starts with prog1, runs across prog2
def ts(x):
    h = int(x // 3600); m = int((x % 3600) // 60); s = x % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def chunks(text, n=9):
    words = text.split()
    out = []; cur = []
    for w in words:
        cur.append(w)
        if len(cur) >= n or re.search(r"[.!?]$", w) and len(cur) >= 4:
            out.append(" ".join(cur)); cur = []
    if cur:
        if out and len(cur) < 3:
            out[-1] += " " + " ".join(cur)
        else:
            out.append(" ".join(cur))
    return out

HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Cap,DejaVu Sans,46,&H00FFFFFF,&H000000FF,&H30102A1B,&H30102A1B,-1,0,0,0,100,100,0,0,3,14,0,2,200,200,60,1
Style: Badge,DejaVu Sans Mono,40,&H0035E6C9,&H000000FF,&H30102A1B,&H30102A1B,-1,0,0,0,100,100,0,0,3,14,0,9,0,60,60,1
Style: Credit,DejaVu Sans,28,&H00F0F0F0,&H000000FF,&H30102A1B,&H30102A1B,0,0,0,0,100,100,0,0,3,10,0,1,60,0,40,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
def ass(path, with_caps):
    ev = []
    for tl in timeline:
        if tl["badge"]:
            ev.append(f"Dialogue: 1,{ts(tl['start'])},{ts(tl['end'])},Badge,,0,0,0,,{tl['badge']}")
    if with_caps:
        for tl in timeline:
            k = tl["key"]
            if not k or k in ("title", "end"):
                continue
            text = nar[k]
            s0 = tl["start"] + 0.25
            span = dur[k]
            if k == "progress":
                span = dur[k]  # spans prog1+prog2 naturally
            cs = chunks(text)
            wts = [len(c) for c in cs]
            tot = sum(wts); cur = s0
            for c, w in zip(cs, wts):
                d = span * w / tot
                ev.append(f"Dialogue: 0,{ts(cur)},{ts(cur + d)},Cap,,0,0,0,,{c}")
                cur += d
    open(path, "w", encoding="utf-8").write(HEAD + "\n".join(ev) + "\n")

ass("build/caps.ass", True)
ass("build/nocaps.ass", False)

# audio
inputs = []; filt = []; labels = []
i = 0
for tl in timeline:
    k = tl["key"]
    if not k: continue
    inputs += ["-i", f"audio/{k}.mp3"]
    ms = int((tl["start"] + 0.25) * 1000)
    filt.append(f"[{i}:a]adelay={ms}|{ms},volume=1.0[n{i}]")
    labels.append(f"[n{i}]"); i += 1
inputs += []
fade_out = total - 3
filt.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest[voice]")
filt.append(f"[voice]apad=whole_dur={total:.2f},atrim=0:{total:.2f}[voiceN]")
fc = ";".join(filt)
run("ffmpeg", "-y", *inputs, "-filter_complex", fc, "-map", "[voiceN]", "-c:a", "aac", "-b:a", "192k", "build/audio_vo.m4a")

os.makedirs("final", exist_ok=True)
run("ffmpeg", "-y", "-i", "build/video_raw.mp4", "-vf", "ass=build/caps.ass:fontsdir=/usr/share/fonts",
    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", "final/demo-captions.mp4")
run("ffmpeg", "-y", "-i", "build/video_raw.mp4", "-i", "build/audio_vo.m4a", "-vf", "ass=build/nocaps.ass",
    "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "-shortest", "final/demo-voiceover.mp4")
json.dump(timeline, open("build/timeline.json", "w"), indent=1)
print("done")


