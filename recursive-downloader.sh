#!/bin/bash

set -o pipefail

version='2019.50.1'
#  version convention: DIN ISO 8601 date +%G\.%V\.1 (YEAR.WEEK.RELEASE)
#+ where 1 is incremented per release within the given week

me="${0##*/}" # basename
me="${me%.sh}" # strip .sh suffix
print_version() { printf "%s version: %s\n" "$me" "$version"; }

print_version 1>&2

: <<CHANGELOG
2012-11-23 - version 2012.47.1
Script was born, early logic parsed wget log to create aria2c download manifest
and start aria2c.

2013-03-12 - version 2013.11.1
Script was refined and fully interactive. User prompted to paste URI's, wget is
then called, wget log is parsed, user prompted to view/edit download manifest,
and then start or abort the download with aria2c.

2017-01-03 - version 2017.01.1
Script checked with shellcheck and refined, improved structure and code docs.
Added trap/terminate logic to improve cleanup and cruft removal.

2019-12-14 - version 2019.50.1
Script updated to use spider.js (CasperJS) instead of wget
CHANGELOG


######################################################################
# START defaults & variables
max_connections_per_server=10
max_concurrent_downloads=1
split=10
#  ^^ max_connections_per_server=10 max_concurrent_downloads=1 split=10
#+ download one at a time, split/multi-thread up to 10 connections per download
dry_run=false
download_limit=0
aria_working_path="."
# http basic auth credentials
# TODO do a wget test call to verify pw
http_user=ano
[ -z "$HTTP_PW" ] && read -rp "enter http password (no echo): " -s HTTP_PW ; echo

#  TODO InfoSec: write a aria2c config to temp file, to mitigate credentials
#+ appearing in the process list

# set a default if EDITOR is not set
: "${EDITOR:=vim}"


######################################################################
# START functions

# upper case a string
__toupper() { tr '[:lower:]' '[:upper:]'; } # this works with pipe
# handy pause functions
function pause() { read -rp "$*" -n1; }
function generic_pause() { pause 'Press any key to continue...'; echo;echo; }
# complain to STDERR and exit with error
die() { echo "$*" 1>&2; exit 2; }


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

echo;echo
echo "spider.js (CasperJS) will now spider the URI's"
generic_pause

# 2021-12-15 read the NOTES.txt and thx to this answer: https://stackoverflow.com/a/31124453/490487
OPENSSL_CONF=/dev/null PATH=$PATH:node_modules/phantomjs-prebuilt/bin node_modules/casperjs/bin/casperjs --ssl-protocol=TLSv1.2 --ignore-ssl-errors=yes bin/spider.js </dev/null | tac | sed -n '/==CUT==/q;p' | tac > "$aria_downloads_manifest" 

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
  aria2c --dry-run="$dry_run" --disable-ipv6 --dir="$aria_working_path" --input-file="$aria_downloads_manifest" --http-auth-challenge=true --http-user="${http_user}" --http-passwd="${HTTP_PW}" --max-connection-per-server="${max_connections_per_server}" --min-split-size=1M --max-overall-download-limit="$download_limit" --max-concurrent-downloads="${max_concurrent_downloads}" --conditional-get=true --split="${split}" --enable-rpc=false --rpc-listen-port=6800 --min-tls-version=TLSv1.2
fi
continue=
