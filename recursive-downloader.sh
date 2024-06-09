#!/bin/bash

set -o pipefail

version='2024.24.1'
#  version convention: DIN ISO 8601 date +%G\.%V\.1 (YEAR.WEEK.RELEASE)
#+ where 1 is incremented per release within the given week

me="${0##*/}" # basename
me="${me%.sh}" # strip .sh suffix
print_version() { printf "%s version: %s\n" "$me" "$version"; }

print_version 1>&2

: <<CHANGELOG
2012-11-23 - version 2012.47.1
* Script was born, early logic parsed wget log to create aria2c download
manifest and start aria2c.

2013-03-12 - version 2013.11.1
* Script was refined and fully interactive. User prompted to paste URI's, wget
is then called, wget log is parsed, user prompted to view/edit download
manifest, and then start or abort the download with aria2c.

2017-01-03 - version 2017.01.1
* Script checked with shellcheck and refined, improved structure and code docs.
* Added trap/terminate logic to improve cleanup and cruft removal.

2019-12-14 - version 2019.50.1
Script updated to use spider.js (CasperJS) instead of wget

2024-06-10 - version 2024.24.1
* Support URI_FILE env var - the file spider.js will use for URI's.
* Re-enable support editing URI_FILE prior to running the spider.
* Removed redundant aria_working_path var - logic is handled by spider.js.
* Logic to detect the $script_dir
* spider.js is run in a subshell where the cwd is changed to $script_dir to
ensure dependencies are available regardless of the cwd/pwd.
* Implemented basic exit status handling for spider.js command
* aria2 min-tls-version, enable-rpc and rpc-listen-port are now variables
* HTTP basic auth is now optional by default
* HTTP_USER is no longer stored in the script and must be provided via env var
* Added dependency checks
* Setting the PhantomJS and CasperJS bin PATH's early on
CHANGELOG


######################################################################
# START defaults & variables
min_tls_version=TLSv1.2
enable_rpc=false
rpc_listen_port=6800
max_connections_per_server=10
max_concurrent_downloads=1
split=10
#  ^^ max_connections_per_server=10 max_concurrent_downloads=1 split=10
#+ download one at a time, split/multi-thread up to 10 connections per download
dry_run=false
download_limit=0
# http basic auth credentials
# TODO make a http request to test credentials?
if [ -n "$HTTP_USER" ] && [ -z "$HTTP_PW" ]; then
  read -rp "enter http password (no echo): " -s HTTP_PW ; echo
  export HTTP_PW
fi

#  TODO InfoSec: write a aria2c config to temp file, to mitigate credentials
#+ appearing in the process list

# set a default if EDITOR is not set
: "${EDITOR:=vim}"

# set a default if URI_FILE is not set
: "${URI_FILE:=$HOME/spider-uris.txt}"
# used as an override in spider.js to specify file with URI's
export URI_FILE

#  A POSIX compliant approach to get the canonicalised dirname
#+ i.e. the absolute physical path to the current scripts pwd
#+ greadlink for OS X compatiblity
if ! script_dir=$( { dirname -- "$( greadlink -f -- "$0" || readlink -f -- "$0" )"; } 2>/dev/null ); then
  die 'There was a problem detecting script_dir. Aborting.'
fi

[ -d "${script_dir}/node_modules/casperjs" ] || die 'Unable to detect CasperJS installation. Aborting.'

PATH=$PATH:${script_dir}/node_modules/phantomjs-prebuilt/bin:${script_dir}/node_modules/casperjs/bin


######################################################################
# START functions

# upper case a string
__toupper() { tr '[:lower:]' '[:upper:]'; } # this works with pipe
# handy pause functions
function pause() { read -rp "$*" -n1; }
function generic_pause() { pause 'Press any key to continue...'; }
# complain to STDERR and exit with error
die() { echo "$*" 1>&2; exit 2; }


######################################################################
# START validation of options, arguments and dependencies

for dep in aria2c cat tac sed casperjs mktemp; do
  [ -x "$(command -v "$dep")" ] || die "Command '$dep' dependency not found. Aborting."
done


######################################################################
# START trap
terminate() {
  trap '' TERM INT EXIT # ignore further signals
  printf "\n%s\n" "$me has been signaled to clean up and terminate..." 1>&2
  #shellcheck disable=SC2066
  for tmp_file in "$aria_downloads_manifest"; do
    [ -e "$tmp_file" ] && { echo "removing temp file: $tmp_file" 1>&2; rm "$tmp_file"; }
  done

  exit
}

# trap the following signals with terminate function
trap "terminate || true" TERM INT EXIT

# END trap

######################################################################
# START temp files

aria_downloads_manifest=$(mktemp /tmp/mktemp.XXXXXXX)

######################################################################
# START main script

cat <<EOM

Your EDITOR ($EDITOR) will now open for URI input, one per line.

URI_FILE: $URI_FILE

Save and exit the editor to continue.

EOM

generic_pause

$EDITOR "$URI_FILE"

cat <<EOM


spider.js (CasperJS) will now spider the URI's

EOM
generic_pause

# execute in a subshell, preserves the main script cwd/pwd
(
  #  WHY? does $script_dir path NOT need to be escaped if it contains chars that
  #+ would otherwise need to be escaped if the path was not stored in a variable?

  #  change dir to $script_dir - important that recursive-downloader can find
  #+ to spider.js, and spider.js  has access to libs and configs etc
  cd -- "$script_dir" || die "Could not change dir to script dir: $script_dir. Aborting."

  if output=$(casperjs bin/spider.js); then
    echo "$output" | tac | sed -n '/==CUT==/q;p' | tac > "$aria_downloads_manifest"
  else
    die "

There was an error in the spider.js command. Aborting.

The captured output was:

$output
"
  fi
) || die 'There was an error in the spider.js subshell. Aborting.'

echo;echo
echo -n "Would you like to view/edit the download manifest with $EDITOR before the download(s) start? [Y/n]? "
read -r continue
continue=$(echo "$continue" | __toupper)
if [ "N" != "$continue" ] && [ "NO" != "$continue" ]; then
  $EDITOR "$aria_downloads_manifest"
fi
continue=

echo -n "Would you like to start the download(s)? [Y/n]? "
read -r continue
continue=$(echo "$continue" | __toupper)
if [ "N" != "$continue" ] && [ "NO" != "$continue" ]; then
  aria2c --dry-run="$dry_run" --disable-ipv6 --input-file="$aria_downloads_manifest" --http-auth-challenge=true --http-user="$HTTP_USER" --http-passwd="$HTTP_PW" --max-connection-per-server="$max_connections_per_server" --min-split-size=1M --max-overall-download-limit="$download_limit" --max-concurrent-downloads="$max_concurrent_downloads" --conditional-get=true --split="$split" --enable-rpc="$enable_rpc" --rpc-listen-port="$rpc_listen_port" --min-tls-version="$min_tls_version"
fi
continue=
