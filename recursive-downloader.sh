#!/bin/bash

# original logic
# 1st create downloads.txt with your links, ensure directories end with a trailing slash to inform wget of a dir
# 2nd invoke
# wget --input-file=downloads.txt --background --output-file=wget.log --no-host-directories --cut-dirs=2 --execute robots=off --no-check-certificate --spider --mirror --no-parent --level=inf --ask-password --user=username
# 3nd let this script process the result
# ~/scripts/recursive-downloader.sh wget.log
# end

# upper case a string
__toupper() { tr [a-z] [A-Z]; } # this works with pipe
# handy pause functions
function pause() { read -p "$*" -n1; }
function generic_pause() { pause 'Press any key to continue...'; echo;echo; }

http_user=username
[ -z "$SPIDER_PW" ] && read -p "enter http password (no echo): " -s SPIDER_PW ; echo

echo "Your EDITOR ($EDITOR) will now open for URI input, one per line."
generic_pause

wget_input=$(mktemp /tmp/mktemp.XXXXXXX)
wget_output=$(mktemp /tmp/mktemp.XXXXXXX)

$EDITOR ${wget_input}

echo wget will now scan the links
generic_pause

wget --input-file=${wget_input} --output-file=>(tee ${wget_output}) --no-host-directories --cut-dirs=2 --execute robots=off --spider --recursive --no-parent --level=inf --user=${http_user} --password=${SPIDER_PW} #--accept index.html

# FIXME check for wget exit code etc

echo; echo
echo wget complete 
generic_pause

max_connections_per_server=10
max_concurrent_downloads=1
split=10
dry_run=false
download_limit=10000K
url_prefix='https://sub.domain.tld:8443/path1/path2/'
working_path="../"
urls_file=$(mktemp /tmp/mktemp.XXXXXXX)
cut_urls_file=$(mktemp /tmp/mktemp.XXXXXXX)
downloads_file=$(mktemp /tmp/mktemp.XXXXXXX)
tsv_downloads=$(mktemp /tmp/mktemp.XXXXXXX)
tsv_non_downloads=$(mktemp /tmp/mktemp.XXXXXXX)

# get a char count to chop from the start of each url
#cut_count=$(echo "$url_prefix" | wc -c | egrep -o '[0-9]+')

# get a list of valid downloads
# grep out the urls, sort and make the list unique
urls=$(egrep -o -- 'https.*' $wget_output | sort | uniq)
echo "$urls" > "$urls_file" #debug

# urldecode the urls, so they can be matched to physical dirs on disk
urls_decoded=$(echo "$urls" | sed 's/%/\\x/g')
urls_decoded=$(echo -e "$urls_decoded");

# pipe to cut to remove the repeated info at the start of each url, so we just have the relative path we're interested in
echo "$urls_decoded" | sed 's,'"$url_prefix"',,' > $cut_urls_file

echo;echo
echo "cut urls:"; echo
cat $cut_urls_file
generic_pause

echo "$urls" | awk -v cut_urls=$cut_urls_file -v tsv_d=$tsv_downloads -v tsv_nd=$tsv_non_downloads '
# seperate fields by forward slashes
BEGIN { FS="/" }
# main logic
{
  # capture $0 before getline
  col1=$0
  getline < cut_urls
  # $NF should be the last component of the URI i.e. the file name
  # $NF is dynamic based on the number of forward slashes in the URI
  # logic: if $NF looks like a file extension and does not match /sample/
  if ($NF ~ /\.[^.]*$/ && tolower($NF) !~ /sample/) {
    print col1"\t"$0 > tsv_d
    print col1
    print " out="$0
    #printf " out=%s\n", $0
  # otherwise we do not want to download it
  } else {
    print col1"\t"$0 > tsv_nd
  }
}
' > $downloads_file


echo;echo
echo "FYI: The following urls we're auto filtered:"
cat $tsv_non_downloads

echo;echo
echo -n "Would you like to view/edit with '$EDITOR' before the download(s) start? [Y/n]? "
read CONTINUE
CONTINUE=$(echo "$CONTINUE" | __toupper)
if [[ "$CONTINUE" != "N" && "$CONTINUE" != "NO" ]]; then
  $EDITOR $downloads_file
fi

echo -n "Would you like to start the download(s)? [Y/n]? "
read CONTINUE
CONTINUE=$(echo "$CONTINUE" | __toupper)
if [[ "$CONTINUE" != "N" && "$CONTINUE" != "NO" ]]; then
  aria2c --dry-run=$dry_run --dir="$working_path" --input-file=$downloads_file --http-auth-challenge=true --http-user=${http_user} --http-passwd=${SPIDER_PW} --max-connection-per-server=${max_connections_per_server} --min-split-size=1M --max-overall-download-limit=$download_limit --max-concurrent-downloads=${max_concurrent_downloads} --conditional-get=true --split=${split}
fi

rm $cut_urls_file $urls_file $downloads_file $tsv_downloads $tsv_non_downloads $wget_output $wget_input

#echo "urls: $urls_file"
#echo "cut urls: $cut_urls_file"
#echo "aria downloads: $downloads_file"
#echo "tab seperated downloads $tsv_downloads"
#echo "tab seperated non downloads $tsv_non_downloads"
