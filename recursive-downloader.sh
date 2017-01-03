#!/bin/bash
# shellcheck disable=SC2001
set -o pipefail

version='2017.01.1'
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
CHANGELOG


######################################################################
# START defaults & variables
max_connections_per_server=10
max_concurrent_downloads=1
split=10
#  ^^ max_connections_per_server=10 max_concurrent_downloads=1 split=10
#+ download one at a time, split/multi-thread up to 10 connections per download
dry_run=false
download_limit=10000K
# primary URI filter, what to download AND what to strip to create OS paths
uri_prefix_regex='https://sub.domain.tld:8443/path1/path2/'
# secondary URI filter, removes unwanted URI's matching on the URL decoded cut URI's
cut_uri_filter_regex='(sample|screens)'
# where to store downloads
aria_working_path="../"
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
 
  for tmp_file in "$cut_uris_file" "$aria_downloads_manifest" "$tsv_downloads" "$tsv_non_downloads" "$wget_output" "$wget_input"; do
    [ -e "$tmp_file" ] && { echo "removing temp file: $tmp_file" 1>&2; rm "$tmp_file"; }
  done

  echo "deleting the following wget --spider cruft"
  [ -d "$wget_working_path" ] && find "$wget_working_path" -depth -a -print -a -delete 1>&2

  exit
}

# trap the following signals with terminate function
trap "terminate || true" TERM INT EXIT

# END trap


######################################################################
# START temp files
wget_input=$(mktemp /tmp/mktemp.XXXXXXX)
wget_output=$(mktemp /tmp/mktemp.XXXXXXX)
cut_uris_file=$(mktemp /tmp/mktemp.XXXXXXX)
aria_downloads_manifest=$(mktemp /tmp/mktemp.XXXXXXX)
tsv_downloads=$(mktemp /tmp/mktemp.XXXXXXX)
tsv_non_downloads=$(mktemp /tmp/mktemp.XXXXXXX)
# temp dir
wget_working_path=$(mktemp -d /tmp/mktemp.XXXXXXX)


######################################################################
# START main script

echo "Your EDITOR ($EDITOR) will now open for URI input, one per line."
echo "Save and exit the editor to continue."
generic_pause

$EDITOR "${wget_input}"

echo "wget will now --spider the URI's"
generic_pause

wget --directory-prefix="$wget_working_path" --input-file="${wget_input}" --output-file=>(tee "${wget_output}") --no-host-directories --cut-dirs=2 --execute robots=off --spider --recursive --no-parent --level=inf --user="${http_user}" --password="${HTTP_PW}" #--accept index.html
exit_code="$?"
#  TODO the wget exit code in --spider mode cannot really be used to determine
#+ anything specific about the outcome of URI retrieval.
#+ It would be possible to check other exit codes. See man wget EXIT STATUS
#+ For example, if one of more retrievals return a 200, and one or more
#+ retrievals return a 404 the exit code will be 8.

echo; echo
echo "wget complete, exit code: $exit_code"; unset exit_code
generic_pause

# grep the URI's from the wget log, sort and unique the list
#  TODO This simple grep -Eo is somewhat brittle and likely to be a source of
#+ future bugs; an improvement would be to write a proper wget log format parser
#+ that parses each requst into records, and can throw an exception if parsing
#+ fails. For example the simple grep doesn't check for requests with non 200
#+ http status codes. sed+awk combo might be suitable.
#uris=$(grep -Eo -- 'http(s)?://.*' "$wget_output" | sort | uniq)
uris=$(grep -Eo -- "${uri_prefix_regex}.*" "$wget_output" | sort | uniq)

[ -z "$uris" ] && die "no uris detected in wget log"

# urldecode the uris, will be used for path names on disk
uris_decoded=$(echo "$uris" | sed 's/%/\\x/g')
# expand the escape sequences to characters
uris_decoded=$(echo -e "$uris_decoded");

# here we mimic wget --cut-dirs and save a list of cut uris to file
# similar logic to tar --strip-components
echo "$uris_decoded" | sed -E 's,'"$uri_prefix_regex"',,' > "$cut_uris_file"

echo;echo
echo "cut uris:"; echo
cat "$cut_uris_file"
generic_pause

#  Provide $uris to awk stdin and $cut_uris_file, and then iterate over both to
#+ create the aria2c download manifest
echo "$uris" | awk -v cut_uris="$cut_uris_file" -v tsv_d="$tsv_downloads" -v tsv_nd="$tsv_non_downloads" -v cut_uri_filter_regex="$cut_uri_filter_regex" '
# seperate fields by forward slashes, seperate output fields by tabs
BEGIN { FS="/"; OFS="\t" }
# main logic
{
  # capture $0 before getline
  uri=$0
  getline < cut_uris
  # $0 is now set to the cut_uri corrisponding to the uri
  cut_uri=$0
  # $NF should be the last component of the cut_uri
  # $NF is dynamic based on the number of forward slashes in the cut_uri
  # logic: if $NF looks like a file extension and cut_uri does not match cut_uri_filter_regex
  if ($NF ~ /\.[^.]*$/ && tolower(cut_uri) !~ cut_uri_filter_regex) {
    print uri cut_uri >> tsv_d
    print uri
    print " out="cut_uri
  # otherwise we do not want to download it
  } else {
    print uri cut_uri >> tsv_nd
  }
}
' > "$aria_downloads_manifest"

echo;echo
echo "FYI: The following uris we're filtered:"
cat "$tsv_non_downloads"

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
  aria2c --dry-run="$dry_run" --disable-ipv6 --dir="$aria_working_path" --input-file="$aria_downloads_manifest" --http-auth-challenge=true --http-user="${http_user}" --http-passwd="${HTTP_PW}" --max-connection-per-server="${max_connections_per_server}" --min-split-size=1M --max-overall-download-limit="$download_limit" --max-concurrent-downloads="${max_concurrent_downloads}" --conditional-get=true --split="${split}" --enable-rpc=false --rpc-listen-port=6800 
fi
continue=
