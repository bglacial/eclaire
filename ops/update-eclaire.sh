#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C.UTF-8
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=10'
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"

repo="$HOME/apps/eclaire"
runtime="$HOME/.local/share/eclaire"
state_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/deploy-state"
mkdir -p "$state_dir"
exec 8>"$state_dir/eclaire.lock"
flock -n -E 75 8 || { result=$?; [[ $result == 75 ]] && exit 0; exit "$result"; }

clean_checkout() {
    [[ $(git -C "$repo" branch --show-current) == main && -z $(git -C "$repo" status --porcelain) ]]
}
clean_checkout || { echo 'FAILED: Eclaire checkout must be clean on main' >&2; exit 1; }
current=$(git -C "$repo" rev-parse HEAD)
git -C "$repo" fetch --no-tags origin main
target=$(git -C "$repo" rev-parse FETCH_HEAD)
git -C "$repo" merge-base --is-ancestor "$current" "$target" || {
    echo 'FAILED: Eclaire history diverged' >&2; exit 1;
}
if [[ $current == "$target" && $(cat "$state_dir/eclaire.revision" 2>/dev/null || true) == "$target" ]]; then
    echo "Eclaire unchanged: $target"
    exit 0
fi

export JAVA_HOME="$runtime/jdk"
export PATH="$runtime/node/bin:$JAVA_HOME/bin:$PATH"
export MAVEN_OPTS=-Xmx256m
export NODE_OPTIONS=--max-old-space-size=256
[[ -x $JAVA_HOME/bin/javac && -x $runtime/node/bin/node ]] || {
    echo 'FAILED: Eclaire requires the user-local JDK and Node runtimes' >&2; exit 1;
}
work=$(mktemp -d "$runtime/build.XXXXXX")
previous="$runtime/previous"
rollback=0
source_updated=0
ready() {
    for attempt in {1..60}; do
        if curl -fsS --max-time 2 http://127.0.0.1:8788/api/health 2>/dev/null |
            python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("status") != "ready")' 2>/dev/null; then
            return 0
        fi
        sleep 2
    done
    return 1
}
cleanup() {
    result=$?
    trap - EXIT INT TERM
    if [[ $rollback == 1 ]]; then
        set +e
        echo 'FAILED: restoring previous Eclaire build' >&2
        systemctl --user stop eclaire.service
        rm -rf "$repo/dist"
        cp -a "$previous/dist" "$repo/dist"
        cp -a "$previous/eclaire-routing.jar" "$repo/server/target/eclaire-routing.jar"
        if [[ $source_updated == 1 ]]; then git -C "$repo" reset --keep "$current"; fi
        if systemctl --user start eclaire.service && ready; then
            echo 'Eclaire previous build restored' >&2
        else
            echo 'FAILED: Eclaire rollback health check' >&2
        fi
    fi
    rm -rf "$work"
    exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

git -C "$repo" archive "$target" | tar -x -C "$work"
for env_file in .env .env.local .env.production .env.production.local; do
    if [[ -f $repo/$env_file ]]; then cp "$repo/$env_file" "$work/$env_file"; fi
done
(
    cd "$work"
    npm ci --no-audit --no-fund
    npm test
    npm run build
    npm run server:build -- --batch-mode --no-transfer-progress -DargLine=-Xmx256m
)
[[ -s $work/dist/index.html && -s $work/server/target/eclaire-routing.jar ]]
clean_checkout && [[ $(git -C "$repo" rev-parse HEAD) == "$current" ]] || {
    echo 'FAILED: Eclaire checkout changed during build' >&2; exit 1;
}

rm -rf "$previous"
mkdir -p "$previous"
cp -a "$repo/dist" "$previous/dist"
cp -a "$repo/server/target/eclaire-routing.jar" "$previous/eclaire-routing.jar"
if [[ -f $state_dir/eclaire.revision ]]; then
    cp "$state_dir/eclaire.revision" "$previous/eclaire.revision"
fi
rollback=1
systemctl --user stop eclaire.service
rm -rf "$repo/dist"
mv "$work/dist" "$repo/dist"
install -m 644 "$work/server/target/eclaire-routing.jar" "$repo/server/target/eclaire-routing.jar"
systemctl --user start eclaire.service
ready || { echo 'FAILED: Eclaire health check' >&2; exit 1; }
git -C "$repo" merge --ff-only "$target"
source_updated=1
printf '%s\n' "$target" > "$state_dir/eclaire.revision.tmp"
mv "$state_dir/eclaire.revision.tmp" "$state_dir/eclaire.revision"
rollback=0
echo "Eclaire deployed: $target"
