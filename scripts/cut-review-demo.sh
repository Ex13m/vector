set -e
V=/c/Users/User/Downloads/vector-review-demo.mp4
OUT="$1"
F="C\:/Windows/Fonts/segoeuib.ttf"
ffmpeg -y -loglevel error -ss 89 -t 19 -i "$V" \
 -vf "drawbox=x=0:y=ih-96:w=iw:h=96:color=black@0.72:t=fill,\
drawtext=fontfile='$F':text='Ride in progress \- Vector in the foreground':fontcolor=white:fontsize=21:x=(w-text_w)/2:y=h-62:enable='between(t,0,4)',\
drawtext=fontfile='$F':text='Screen switched OFF, phone goes in the pocket':fontcolor=white:fontsize=21:x=(w-text_w)/2:y=h-62:enable='between(t,4,8)',\
drawtext=fontfile='$F':text='Screen off \- voice keeps announcing the target':fontcolor=0x1AFF7A:fontsize=21:x=(w-text_w)/2:y=h-62:enable='gt(t,8)',\
drawbox=x=0:y=0:w=iw:h=52:color=black@0.72:t=fill,\
drawtext=fontfile='$F':text='Vector \- cz.konsalting.vektor \- foreground location demo':fontcolor=0xC8CCC8:fontsize=17:x=(w-text_w)/2:y=18" \
 -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$OUT"
