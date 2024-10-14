#!/bin/bash

# This script was developed on Debian.
# The majority of this script should be POSIX compliant. 

#  pipefail is primarily a bash feature, which is the main reason for using bash
#+ rather than sh in this script.
#+ https://manpages.debian.org/stable/bash/bash.1.en.html#pipefail
#+ A future version of Debian shell (dash) should support pipefail see:
#+ https://stackoverflow.com/a/78501655/490487
#+ In the future, the script could be tested with dash supporting pipefail and
#+ become POSIX compliant.
set -o pipefail

version=2024.42.1
#  version convention: YEAR.WEEK.RELEASE - date +'%G.%V.1'
#+ where 1 is incremented per release within the given week

me="${0##*/}" # basename
me="${me%.sh}" # strip .sh suffix
print_version() { printf "%s version: %s\n" "$me" "$version"; }

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

2024-10-14 - version 2024.42.1
* Added information on the bash pipefile option
* Added a note on POSIX compliance
* Improved definition of the version convention
* Changed most internal variables to env vars
* Fixed some problems with tilde expansion
* Changed PATH modification to preprend rather than append
* Improved validation that CONFIG_FILE and URI_FILE are set and not empty,
  otherwise use defaults
* Renamed __toupper() function to toupper()
* Added scroll_up() function
* Updated the terminate() function, it now uses the systems kill command (binary
  not shell builtin) to kill the process group.
* Added node and nodejs commands to dependency checks
* The script now prints its runtime configuration on startup and checks that
  each variable has a non-empty value.
* Updated the invocation of spider.js to use its #! defined interpreter
  (casperjs.js) which uses node. This removes the dependency on the CasperJS
  Python startup wrapper.
* Blank lines in spider.js output are now removed.
* Added an INFO block regarding a possible future enhancement to replace the
  shell process with aria2c via exec.
CHANGELOG


######################################################################
# START defaults & variables
min_tls_version=TLSv1.2
enable_rpc=false
rpc_listen_port=6800

: "${MAX_CONCURRENT_DOWNLOADS:=1}"
: "${MAX_CONNECTIONS_PER_SERVER:=10}"
: "${SPLIT:=10}"
#  ^^ MAX_CONCURRENT_DOWNLOADS=1 MAX_CONNECTIONS_PER_SERVER=10 SPLIT=10
#+ download max one URI at a time, split/multi-thread up to 10 connections per
#+ download.

# Relates to the aria2 --dry-run feature, does not change spider.js behaviour
dry_run=false

# Set the aria2 --max-overall-download-limit option
: "${DOWNLOAD_LIMIT:=0}"

# http basic auth credentials
# TODO make a http request to test credentials prior to execuing spider.js?
if [ -n "$HTTP_USER" ] && [ -z "$HTTP_PW" ]; then
  read -rp "enter http password (no echo): " -s HTTP_PW ; echo
  export HTTP_PW
fi

#  TODO InfoSec: write a aria2c config to temp file, to mitigate credentials
#+ appearing in the process list

# Set a default if EDITOR is not set
# TODO upgrade this logic to the example in install.sh
: "${EDITOR:=vim}"

# Set a default if URI_FILE is not set
# URI_FILE is used by spider.js to specify the file containing URIs
#+ Note: It is not possible to use tilde expansion within quoted brace
#+ expansion, hence this approach.
[ -z "${URI_FILE+x}" ] && export URI_FILE=~/spider-uris.txt

#  A POSIX compliant approach to get the canonicalised dirname
#+ i.e. the absolute physical path to the current scripts pwd
#+ greadlink for OS X compatiblity
if ! script_dir=$( { dirname -- "$( greadlink -f -- "$0" || readlink -f -- "$0" )"; } 2>/dev/null ); then
  die 'There was a problem detecting script_dir. Aborting.'
fi

[ -d "${script_dir}/node_modules/casperjs" ] || die 'Unable to detect CasperJS installation. Aborting.'

# Update the PATH so that the shell can find the commands.
PATH=${script_dir}/node_modules/phantomjs-prebuilt/bin:${script_dir}/node_modules/casperjs/bin:${PATH}

# Set default config file env var if not set
#+ Note: It is not possible to use tilde expansion within quoted brace
#+ expansion, hence this approach.
# Note: the ~/ cannot be quoted or tilde expansion will fail
[ -z "${CONFIG_FILE+x}" ] && export CONFIG_FILE=~/".config/${me}/config.yaml"

######################################################################
# START functions

# upper case a string
toupper() { tr '[:lower:]' '[:upper:]'; } # this works with pipe
# handy pause functions - not POSIX compliant
pause() { read -rp "$*" -n1; }
generic_pause() { pause 'Press any key to continue...'; }
# complain to STDERR and exit with error
die() { echo "$*" 1>&2; exit 2; }

# https://askubuntu.com/a/997893
# equivalent to keystroke CTRL+L
scroll_up() {
  printf '\33[H\33[2J'
}


######################################################################
# START validation of options, arguments and dependencies

# FIXME 'which' is not POSIX
# we require which to find the kill command not the shell builtin
[ -x "$(command -v which)" ] || die "Command 'which' dependency not found. aborting."
kill_path=$(which kill)

# dependency checks
for dep in "$kill_path" aria2c cat tac sed casperjs mktemp node nodejs; do
  [ -x "$(command -v "$dep")" ] || die "Command '$dep' dependency not found. Aborting."
done


######################################################################
# START trap logic

terminate() {
  trap - TERM INT EXIT # ignore further signals
  printf "\n%s\n" "$me has been signaled to clean up and terminate..." 1>&2

  # ensure temp file(s) are cleaned up
  #shellcheck disable=SC2066
  for tmp_file in "$aria_downloads_manifest"; do
    [ -e "$tmp_file" ] && { echo "removing temp file: $tmp_file" 1>&2; rm "$tmp_file"; }
  done

  # kill the process group -$$ 
  # Try to kill any lingering procs spawned by this script 
  # https://stackoverflow.com/a/2173421/490487
  "$kill_path" -- -$$
}

# trap the following signals with terminate function
trap "terminate || true" TERM INT EXIT

# END trap

######################################################################
# START temp files

aria_downloads_manifest=$(mktemp /tmp/mktemp.XXXXXXX)

######################################################################
# START main script

scroll_up

print_version 1>&2

cat <<EOM

Runtime configuration:
DEBUG=$DEBUG
EOM

# check and print runtime config
for envvar in EDITOR CONFIG_FILE URI_FILE DOWNLOAD_LIMIT MAX_CONCURRENT_DOWNLOADS MAX_CONNECTIONS_PER_SERVER SPLIT; do
  if eval '[ -z "${'"$envvar"'+x}" ]'; then
    die "$envvar is not set. Aborting."
  else
    code=$(cat <<CODE
printf '%s=%s\n' "\$envvar" "\$$envvar"
CODE
)
    eval "$code"
    unset code
  fi
done
unset envvar

cat <<EOM

---------------------------

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
  #+ would otherwise need to be escaped if the path was not stored in a
  #+ variable? This must be due to shell internal handling?

  # cd to $script_dir - important that spider.js can find node_modules etc
  cd -- "$script_dir" || die "Could not change dir to script dir: $script_dir. Aborting."

  #  TODO consider splitting stdout and stderr into seperate variables
  #+ https://stackoverflow.com/q/11027679
  
  # spider.js must be available on $PATH which is setup by install.sh
  if output=$(spider.js 2>&1); then
    # The sed removes blank lines and extracts the relevant output
    echo "$output" | tac | sed -n '/^$/d;/==CUT==/q;p' | tac > "$aria_downloads_manifest"
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
continue=$(echo "$continue" | toupper)
if [ "N" != "$continue" ] && [ "NO" != "$continue" ]; then
  unset continue
  $EDITOR "$aria_downloads_manifest"
fi

echo
echo -n "Would you like to start the download(s)? [Y/n]? "
read -r continue
continue=$(echo "$continue" | toupper)
if [ "N" != "$continue" ] && [ "NO" != "$continue" ]; then
  unset continue
  : <<INFO
  This is the end of the script. No further shell functionality is required
  other than the terminate trap. It would be nice to "exec" and replace the
  shell process with aria2c, but this would skip the terminate and clean up
  logic. Prematurely removing the --input file may cause problems for aria2c (as
  the process will be using the file handle). Further testing is needed to see
  if "exec" can be used. For example, when an in-use file is removed, its file
  handle is marked as "deleted" and would be removed when the running process is
  terminated. In theory this is fine. It really depends if aria2c would
  open/close the --input file more than once.
INFO
  aria2c --dry-run="$dry_run" --disable-ipv6 --input-file="$aria_downloads_manifest" --http-auth-challenge=true --http-user="$HTTP_USER" --http-passwd="$HTTP_PW" --max-connection-per-server="$MAX_CONNECTIONS_PER_SERVER" --min-split-size=1M --max-overall-download-limit="$DOWNLOAD_LIMIT" --max-concurrent-downloads="$MAX_CONCURRENT_DOWNLOADS" --conditional-get=true --split="$SPLIT" --enable-rpc="$enable_rpc" --rpc-listen-port="$rpc_listen_port" --min-tls-version="$min_tls_version"
fi
