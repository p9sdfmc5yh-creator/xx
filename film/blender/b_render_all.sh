#!/bin/bash
# VERSION B: render every top-down still at 1920x1080 native (opaque 16-bit PNG) into film/renders_b/<id>.png
# (+ b31_empty.png = the landing page without the characters, identical camera / light / paper).
#
#   nohup film/blender/b_render_all.sh > $S/b_logs/runner.out 2>&1 &        # everything that is stale
#   film/blender/b_render_all.sh b17 b31 b31_empty                          # only these (still make-style)
#   FORCE=1 film/blender/b_render_all.sh b17                                # re-render regardless of time stamps
#   LOOP=1  film/blender/b_render_all.sh                                    # keep watching (re-renders when a module changes)
#
# Make-style: a still is up to date when its entry in shots_b.json is unchanged (hash kept in
# b_logs/<id>.key; bump "rev" in shots_b_src.py to force one shot) and it is newer than the ingredient
# modules it uses (IGNORE_MODULES=1 switches that off; CODE_STALE=1 also compares flatlay.py).  One shot at a time
# through the machine-wide render lock (shared with version A's queue).
S=/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad
R=/home/user/xx/film
PY=$S/bvenv/bin/python
OUT=$R/renders_b
LOG=$S/b_logs
LOCK=$S/final_render.lock
OPTS="--quality final --res 1920x1080 --spp 32 --threads 4"
mkdir -p "$OUT" "$LOG"

# id list + per-shot key (hash of the table entry) + sources, from shots_b.json
table() {
  $PY - <<'EOF'
import json, hashlib
t = json.load(open('/home/user/xx/film/shots_b.json', encoding='utf-8'))
for s in t['scenes']:
    key = hashlib.md5(json.dumps({k: v for k, v in s.items() if k not in ('note', 'label', 'start', 'end', 'text_mode', 'reveal')},
                                 sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
    print(s['id'], key, ','.join(s['source']), s['layout'])
EOF
}

stale() {   # id key sources png
  local id=$1 key=$2 srcs=$3 png=$4
  [ -n "$FORCE" ] && return 0
  [ -f "$png" ] || return 0
  [ "$(cat $LOG/$(basename $png .png).key 2>/dev/null)" = "$key" ] || return 0
  if [ -n "$CODE_STALE" ]; then                         # opt-in: flatlay.py is edited often, a table 'rev' bump is the normal way
    [ $R/blender/flatlay.py -nt "$png" ] && return 0
    [ $R/blender/glyph_layout.py -nt "$png" ] && return 0
  fi
  local m
  for m in ${srcs//,/ }; do
    [ -f $R/blender/shots/$m.py ] || return 1          # module not written yet: cannot render
    [ -z "$IGNORE_MODULES" ] && [ $R/blender/shots/$m.py -nt "$png" ] && return 0
  done
  return 1
}

render_one() {   # id key sources name extra...
  local id=$1 key=$2 srcs=$3 name=$4; shift 4
  local png=$OUT/$name.png m
  for m in ${srcs//,/ }; do
    [ -f $R/blender/shots/$m.py ] || { echo "$(date +%H:%M:%S) SKIP  $name (module $m missing)" >> $LOG/queue.log; return 1; }
  done
  stale $id $key $srcs $png || return 1
  if [ -f $LOG/$name.fail ] && [ "$(cat $LOG/$name.failkey 2>/dev/null)" = "$key" ] && [ ! $R/blender/flatlay.py -nt $LOG/$name.fail ] && [ -z "$FORCE" ]; then
    return 1                                            # failed with exactly this input: wait for a fix
  fi
  echo "$(date +%H:%M:%S) START $name" >> $LOG/queue.log
  local t0=$(date +%s)
  if (cd $R/blender && flock $LOCK $PY flatlay.py --shot $id $OPTS "$@" --out $OUT/.tmp_$name.png --jpg $LOG/$name.jpg) > $LOG/$name.log 2>&1 \
       && [ -f $OUT/.tmp_$name.png ]; then
    mv -f $OUT/.tmp_$name.png $png
    [ -f $OUT/.tmp_${name}_layout.json ] && mv -f $OUT/.tmp_${name}_layout.json $OUT/${name}_layout.json
    [ -f $OUT/.tmp_${name}_depth.npy ] && mv -f $OUT/.tmp_${name}_depth.npy $OUT/${name}_depth.npy
    echo "$key" > $LOG/$name.key
    rm -f $LOG/$name.fail $LOG/$name.failkey
    echo "$(date +%H:%M:%S) DONE  $name $(( $(date +%s) - t0 ))s  $(grep -o 'spp<=.*' $LOG/$name.log | head -1)" >> $LOG/queue.log
  else
    tail -n 15 $LOG/$name.log > $LOG/$name.fail; echo "$key" > $LOG/$name.failkey
    rm -f $OUT/.tmp_$name.png
    echo "$(date +%H:%M:%S) FAIL  $name (see $LOG/$name.log)" >> $LOG/queue.log
  fi
  return 0
}

want() {   # is this name requested on the command line (or no arguments = everything)?
  [ ${#ARGS[@]} -eq 0 ] && return 0
  local a
  for a in "${ARGS[@]}"; do
    [ "$a" = "$1" ] && return 0
    [ "$a" = "${1%%_*}" ] && [ "$1" != "b31_empty" ] && return 0
  done
  return 1
}

ARGS=("$@")
while true; do
  did=0
  while read -r id key srcs layout; do
    [ -f $LOG/STOP ] && { echo "$(date +%H:%M:%S) STOP file found" >> $LOG/queue.log; exit 0; }
    if want $id; then render_one $id $key $srcs $id && did=1; fi
    if [ "$layout" = landing ] && want b31_empty; then render_one $id $key $srcs b31_empty --empty && did=1; fi
  done < <(table)
  [ -z "$LOOP" ] && break
  [ $did = 0 ] && sleep 20
done
echo "$(date +%H:%M:%S) runner finished" >> $LOG/queue.log
