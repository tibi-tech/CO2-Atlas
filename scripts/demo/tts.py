import json, asyncio, subprocess, edge_tts, sys
VOICE = "en-US-AriaNeural"
lines = json.load(open("narration.json", encoding="utf-8-sig"))
async def main():
    import os
    os.makedirs("audio", exist_ok=True)
    out = {}
    for k, v in lines.items():
        say = v.replace("CO₂", "C O two")
        await edge_tts.Communicate(say, VOICE, rate=("+14%" if k.startswith("m") and len(k)==2 else "+0%")).save(f"audio/{k}.mp3")
        d = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"audio/{k}.mp3"]))
        out[k] = round(d, 2)
        print(k, out[k])
    json.dump(out, open("audio/durations.json", "w"))
asyncio.run(main())



