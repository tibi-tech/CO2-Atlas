set -e
cd /mnt/c/Users/tpere/AppData/Local/Temp/opencode/demo
V=/home/tpere/github/CO2-Absorption-Calculator/docs/video
mkdir -p backup patched
[ -f backup/demo-captions.mp4 ] || cp $V/demo-captions.mp4 $V/demo-voiceover.mp4 backup/

OA=4.44; OB=8.26; NA=6.96; NB=10.76
SC=$(python3 -c "print(($OB-$OA)/($NB-$NA))")
PATCH="[1:v]trim=start=$NA:end=$NB,setpts=(PTS-STARTPTS)*$SC+$OA/TB,scale=1920:1080,format=yuv420p"

cat > patched/caps.ass <<'EOF'
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Cap,DejaVu Sans,46,&H00FFFFFF,&H000000FF,&H30102A1B,&H30102A1B,-1,0,0,0,100,100,0,0,3,14,0,2,200,200,60,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:04.16,0:00:07.36,Cap,,0,0,0,,month, for any region up to a thousand square
Dialogue: 0,0:00:07.36,0:00:09.00,Cap,,0,0,0,,kilometres, using free satellite and climate data.
EOF

ENC="-c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart"

# voiceover: no captions
ffmpeg -v error -y -i backup/demo-voiceover.mp4 -i out/home2.webm -filter_complex \
 "$PATCH[p];[0:v][p]overlay=enable='between(t,$OA,$OB)':eof_action=pass:repeatlast=0[v]" \
 -map "[v]" -map 0:a $ENC patched/demo-voiceover.mp4

# captions: re-burn the two caption chunks on the patch
ffmpeg -v error -y -i backup/demo-captions.mp4 -i out/home2.webm -filter_complex \
 "$PATCH,ass=patched/caps.ass:fontsdir=/usr/share/fonts[p];[0:v][p]overlay=enable='between(t,$OA,$OB)':eof_action=pass:repeatlast=0[v]" \
 -map "[v]" -map 0:a $ENC patched/demo-captions.mp4

ls -la patched
for f in captions voiceover; do ffmpeg -v error -y -ss 5.0 -i patched/demo-$f.mp4 -frames:v 1 -vf scale=960:-1 chk_${f}_5.png; ffmpeg -v error -y -ss 7.6 -i patched/demo-$f.mp4 -frames:v 1 -vf scale=960:-1 chk_${f}_76.png; done
ffmpeg -v error -y -i chk_captions_5.png -i chk_captions_76.png -i chk_voiceover_5.png -i chk_voiceover_76.png -filter_complex 'xstack=inputs=4:layout=0_0|960_0|0_540|960_540' sheet_patched.png
