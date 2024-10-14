#!/usr/bin/env sh

{ # this ensures the entire script is downloaded prior to interpretation

# this script was inspired by the nvm project installer
# this script was checked with shellcheck

: <<'TODO'
* Consider adding logic to check [ -p /dev/stdin ] and [ sh = $0 ] to determine
  if the script was invoked via pipe or via command_file. This changes the
  interactivity of the script. In addition check [ -t 1 ] to determine if stdout
  is a terminal or has been redirected/piped, and check [ -t 0 ] to determine if
  stdin is a terminal and supports interactive user input.

* Consider adding getopts logic which would support options like --root-ok,
  --uninstall and --this-is-fine as an alternaitve to env vars.

* Consider adding --python-is-python3 option to support any CasperJS python
  dependencies.

* Add the URI for the install.sh code should users wish to review.

* Consider improving shell detection similar to nvm install.sh, to detect and
  update the shell specific profile, to better support shells like zsh, ksh, etc

* Update install() code to download latest stable release

* Write the uninstall() logic, see NOTES in the function
TODO

######################################################################
# START defaults 

install_target_name=recursive-downloader
# set the INSTALL_VERSION if not set
: "${INSTALL_VERSION:=2024.42.1}"

curl_connection_timeout=5

######################################################################
# START functions

# https://askubuntu.com/a/997893
# equivalent to keystroke CTRL+L
scroll_up() {
  printf '\33[H\33[2J'
}

# https://stackoverflow.com/a/61835747/490487 
is_num() { case ${1#[-+]} in '' | . | *[!0-9.]* | *.*.* ) return 1;; esac ;}

# Function to check if a program is available
# This uses the shells "Search and Execution" logic. See man sh.
is_available() {
  \type "$1" 1> /dev/null 2>&1
}

#  Function to check if a program is available AND is executable.
#+ Returns false if the program is missing OR an alias OR a builtin
is_executable() {
  is_available "$1" && \test -x "$(\command -v "$1")"
}

# complain to STDERR and exit with error
die() { echo "$*" >&2; exit 2; }

detect_editor() {
  for ed in /usr/bin/editor /etc/alternatives/editor vim vi pico nano emacs; do
    if is_executable "$ed"; then
      ed=$(readlink -f "$(command -v "$ed")")
      return 0
    fi
  done
  return 1
}

detect_user() {
  error_msg='Unable to detect current username. Aborting.'
  is_executable passwd || die "$error_msg"
  if is_executable id; then
    username=$(id -un) || die "$error_msg" # effective user
  elif is_executable whoami; then
    username=$(whoami) || die "$error_msg" # effective user
  elif is_executable ps; then
    username=$(ps -o euser= -p $$) || die "$error_msg" # ps effective user fallback
  elif is_executable logname; then
    username=$(logname) || die "$error_msg" # last resort
  else
    die "$error_msg"
  fi
  # verify $username via passwd -S
  if [ "$username" != "$(passwd -S | awk '{print $1}')" ]; then
    die "$error_msg"
  fi
  unset error_msg
}

detect_user_id() {
  error_msg='Unable to detect current user id. Aborting.'
  if is_executable id; then
    user_id=$(id -u) || die "$error_msg" # effective user id
  elif is_executable getent; then
    # use getent to include support for NSS users
    user_id=$(getent passwd "$username" | awk -F: '{print $3}') || die "$error_msg"
  else
    # fallback to /etc/passwd lookup
    if ! user_id=$(awk -F: -v username="$username" '$1 == username {print $3}' /etc/passwd); then
      if is_executable ps; then
        # fallback to ps effective user id
        user_id=$(ps -o euid= -p $$) || die "$error_msg"
      fi
    fi
  fi
  is_num "$user_id" || die "$error_msg"
  unset error_msg
}

detect_shell() {
  error_msg='Unable to detect the current users shell. Aborting.'
  if is_executable getent; then
    # prefer getent to include support for NSS users
    result=$(getent passwd "$username" | awk -F: '{print $NF}') || die "$error_msg"
  else
    # fallback to /etc/passwd lookup
    result=$(awk -F: -v username="$username" '$1 == username {print $NF}' /etc/passwd) || die "$error_msg"
  fi
  # To avoid using a modified $SHELL var, check if $SHELL matches the $result
  [ "$SHELL" != "$result" ] && SHELL=$result
  unset result
  unset error_msg
}

load_nvm() {
  export NVM_DIR="$HOME/.nvm"
  if [ -d "$NVM_DIR" ]; then
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
}

# This functions logic was developed and tested but not used, see comments
python_is_python3() {

  #  CasperJS dependends on python in a few places but not for most of its core
  #+ functionality. The CasperJS code paths that $install_target_name exercises
  #+ do not depend on python, therefore $install_target_name does not strictly
  #+ depend on python and right now the logic in this function is redudant.
  #  I made a decision not to use the logic for now. I have added a TODO for the
  #+ future, in case there is a demand to use parts of CasperJS that depend on
  #+ python.
  #+ For example, CasperJS bin/casperjs is a python wrapper to launch CasperJS
  #+ For example, CasperJS tests/clitests/runtests.py utilises python
  
  # Part 1: dep check
  if ! is_executable python; then
    is_executable python3 || die 'Dependency not found... command: python or python3. Aborting.'
    python_path=$(command -v python3)
  else
    python_path=$(command -v python)
  fi

  # Part 2: symlink
  #  Since python was sunset 2020-Jan, some distros do not provide python on the
  #+ PATH. So, if required, create $bin_path symlink python -> python3 so
  #+ CasperJS can run its python dependencies.
  #+ At this stage, we already checked that python OR python3
  #+ is_executable, and set the $python_path variable. So, for the following if
  #+ statement to be true, python3 is_available but python is not.
  if ! is_available python && [ ! -e "$bin_path/python" ]; then
    ln -s "$python_path" "$bin_path/python"
    cat <<EOM
---------------------------

  A symlink to python3 has been created: $bin_path/python
  
  This is to support CasperJS which expects the python command to be the PATH.
  
  If you wish to make this system wide, check if your distro has the package:
  python-is-python3 OR just create the relevant symlinks yourself.

EOM
  fi #endif python not available
}

######################################################################
# START dependencies checks, warnings and notices

# awk dep check
is_executable awk || die 'Dependency not found... command: awk. Aborting.'

detect_user
detect_user_id
detect_shell

# cat dep check
is_executable cat || die 'Dependency not found... command: cat. Aborting.'

# running as root check
# Text to ASCII Art Generator (TAAG)
# https://www.patorjk.com/software/taag/#p=display&f=ANSI%20Regular&t=WARNING

if [ "Y" != "$RUN_AS_ROOT" ] && [ 0 -eq "$user_id" ]; then
  scroll_up
  cat <<EOM


  ██     ██  █████  ██████  ███    ██ ██ ███    ██  ██████  
  ██     ██ ██   ██ ██   ██ ████   ██ ██ ████   ██ ██       
  ██  █  ██ ███████ ██████  ██ ██  ██ ██ ██ ██  ██ ██   ███ 
  ██ ███ ██ ██   ██ ██   ██ ██  ██ ██ ██ ██  ██ ██ ██    ██ 
   ███ ███  ██   ██ ██   ██ ██   ████ ██ ██   ████  ██████  

  If you wish to run the script as root, please set the following env var

  export RUN_AS_ROOT=Y

  Note: Scripts piped to sh run non-interactively, so prompts won't work. This
  env var approach works for any invocation style.

EOM
  die 'Aborting.'
fi

# the uninstaller
uninstall() {
  # TODO
  : <<'NOTES'
  find ~/.nvm ~/.npm ~/.local/$install_target_name ~/.config/$install_target_name -depth -a -delete

  It is probably a good idea to prompt the user and give them the option to
  uninstall nvm and npm, as they may have been installed previously. In this
  context, it is probably a good idea to force the user to invoke --uninstall
  interactively, so that the script can prompt them for decisions.

  Maybe provide the user with an uninstall preview?

  remove .profile and .bashrc changes
NOTES
}

# the installer
install() {

  # set the default pager to printf as a fallback
  : "${PAGER:=printf}"
  # evaluate which pager is available, use the first available from the list
  # background: https://en.wikipedia.org/wiki/Terminal_pager
  for cmd in "$PAGER" less most more; do
    if is_executable "$cmd"; then
      PAGER="$cmd"
      break
    fi
  done

  # if THIS_IS_FINE env var is not set, show the user welcome message
  if [ "Y" != "$THIS_IS_FINE" ]; then
    
    welcome=$(cat <<EOM
  
  You are viewing this notification with: $PAGER

  ██ ███    ██ ███████ ████████  █████  ██      ██         ███████ ██   ██ 
  ██ ████   ██ ██         ██    ██   ██ ██      ██         ██      ██   ██ 
  ██ ██ ██  ██ ███████    ██    ███████ ██      ██         ███████ ███████ 
  ██ ██  ██ ██      ██    ██    ██   ██ ██      ██              ██ ██   ██ 
  ██ ██   ████ ███████    ██    ██   ██ ███████ ███████ ██ ███████ ██   ██

  Hello $username,

  Welcome to install.sh for $install_target_name.

  This notice gives you a chance to check what this installer will do to your
  user/system, because who likes installers that run arbitrary code without
  checking first?

  To skip this notice and run the installer set the following env var:
  
  export THIS_IS_FINE=Y

  Alt with pipe: curl -sSL <URL> | THIS_IS_FINE=Y sh 
  Alt for cwd file: THIS_IS_FINE=Y ./install.sh

  Note: Scripts piped to sh run non-interactively, so prompts won't work. This
  env var approach works for any invocation style.

  You can view the install.sh code here:
  TODO <<<URL>>>

  This installer creates and modifies your \$HOME folder. It does NOT make any
  system wide changes. It does NOT require root or sudo.


  Q: What does the install.sh script do?

  1. Check the prerequisites and dependencies, and let the user know if any are
     missing.

  2. Check for an EDITOR and prompt user to install one if missing. 

  3. Automate the install of the latest nvm release if nvm is not available.

     nvm is a node version manager and installs a recent version of node.js and
     npm on a per-user basis. nvm can manage/switch multiple node.js versions.
     Project link: https://github.com/nvm-sh/nvm/

  4. Install the latest $install_target_name release and required node.js
     dependencies via npm.

  5. If necessary, update the user profile to add \$HOME/.local/bin to the users
     \$PATH.

  6. Set up relevant commands in \$HOME/.local/bin. 

  7. Provide information about the $install_target_name config file and how to
     invoke ${install_target_name}.

  
EOM
    ) # the space in the trailing whitespace prevents command substitution performing whitespace trimming

    if [ "echo" = "$PAGER" ]; then
      "$PAGER" "$welcome"
    else
      printf "%s" "$welcome" | "$PAGER"
      scroll_up
    fi

    die '
  INFO: Aborting install until the user thinks this is fine. To skip this notice:

  export THIS_IS_FINE=Y
'
    fi

  # detailed install dependency checks
  for dep in bash env curl git chmod mkdir grep ln cat readlink aria2c; do
    if ! is_executable "$dep"; then
      die "Dependency not found... command: '$dep'. Aborting."
    fi
  done

  # set a default if EDITOR is not set
  if [ -z "$EDITOR" ]; then
    if detect_editor; then
      EDITOR=$ed
    else
      die 'An EDITOR could not be detected. Please install one. Aborting.'
    fi
    unset ed
  fi

  scroll_up

  cat <<EOM

  Please wait while $install_target_name and its dependencies
  are fetched and installed.
  
  This will take a few seconds, depending on internet connection speed.
  
  ...

EOM

######################################################################
# nvm install logic

  load_nvm

  if ! is_available nvm; then

    # 1. Install `nvm`  (Node Version Manager[ \[link\]](https://github.com/nvm-sh/nvm/tree/v0.39.7)) v0.39.7 is the latest as of commit time  
    # 🔐 I suggest to review `install.sh` first to see its SAFE/SANE
    # For example:
    # curl -sSL 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh' | $EDITOR -
   
    # get latest nvm release
    installer_nvm_latest_version=$(curl --connect-timeout "$curl_connection_timeout" -sSL https://api.github.com/repos/nvm-sh/nvm/releases/latest|grep '"tag_name":'|grep -Eo 'v[0-9\.]+')

    # TODO consider adding a tty in-progrss animation
    if ! nvm_install_output=$(curl --connect-timeout "$curl_connection_timeout" -sSL 'https://raw.githubusercontent.com/nvm-sh/nvm/'"${installer_nvm_latest_version}"'/install.sh' | bash 1> /dev/null 2>&1); then
      die "
  Something went wrong trying to install nvm. Aborting.
  
  nvm output:

$nvm_install_output

"
    fi

    load_nvm

    is_available nvm || die 'Something went wrong, nvm not available. Aborting.'

    # Install nodejs - this will be a local user install
    nvm install node 1>/dev/null 2>&1 || die 'Something went wrong using nvm to install nodejs. Aborting.'

    # `node` and `npm` should now be available

    # Update `npm`
    nvm install-latest-npm 1>/dev/null 2>&1 || die 'Something went wrong using nvm to install the latest npm version. Aborting.'

    cat <<EOM
  ---------------------------
  
  FYI nvm, npm and node have been intalled for the $(whoami) user.
  
  This has updated your shell's rc file.

EOM
  else

    cat <<EOM
  ---------------------------
  
  FYI nvm is already installed. 

EOM
  fi

######################################################################
# Install recursive-downloader

  # set INSTALL_PATH if not set
  : "${INSTALL_PATH:=${HOME}/.local/${install_target_name}}"
  config_path=${HOME}/.config/$install_target_name

  # TODO use latest stable release via github API (see nvm install logic)
  # FIXME replace tar with github release download logic
  mkdir -p "$INSTALL_PATH"; tar -C "$INSTALL_PATH" -xf "${INSTALL_VERSION}.tar" || die 'Something went wrong extracting tar archive. Aborting.'
  # chmod for good measure
  chmod u+x "$INSTALL_PATH/${install_target_name}.sh" || die "Something went wrong trying to chmod $INSTALL_PATH/${install_target_name}.sh. Aborting."

  # install dependencies
  cd "$INSTALL_PATH" || die "Could not change dir to $INSTALL_PATH. Aborting."

  # shellcheck disable=SC2016
  npm install --save 1>/dev/null 2>&1 || die 'Something went wrong with `npm install --save`. Aborting.'

  mkdir -p "$config_path"
  #  TODO add a "$config_path/.nvm-was-installed" state file to document if the
  #+ installer installed nvm/npm etc. Can be used to make --uninstall decisions.
  
  # Conditionally copy `config-example.yaml` to `${config_path}/config.yaml`
  if [ ! -s "${config_path}/config.yaml" ]; then 
    cp config/config-example.yaml "${config_path}/config.yaml" || die 'Something went wrong trying to copy config-example.yaml'
  fi

######################################################################
# Updates to user profile to setup $bin_path

  # Make `recursive-downloader` available on `PATH`
  # shellcheck disable=SC2016
  bin_path_literal='$HOME/.local/bin'
  bin_path=; eval bin_path="$bin_path_literal"

  profile_path="$HOME/.profile"
  # if the profile does not contain '$bin_path' logic
  if ! grep -q "$bin_path_literal" "$profile_path" ; then
    cat <<SCRIPT >> "$profile_path"

# <added-by-${install_target_name}>
# set PATH to include the user's $bin_path if it exists
if [ -d "$bin_path_literal" ] ; then
  PATH="$bin_path_literal:\$PATH"
fi
# </added-by-${install_target_name}>
SCRIPT

    sleep 3
    # need to prompt user to refresh their env/profile
    cat <<EOM
  ---------------------------
  
  Your profile has been updated to support $bin_path:

  profile: $profile_path

EOM
  fi #endif profile does not contain '$bin_path'

######################################################################
# Setup of the local bin

  mkdir -p "$bin_path"

  if ! [ -e "$bin_path/$install_target_name" ]; then
    ln -s "$INSTALL_PATH/${install_target_name}.sh" "$bin_path/$install_target_name"
  fi

  if ! [ -e "$bin_path/spider.js" ]; then
    ln -s "$INSTALL_PATH/bin/spider.js" "$bin_path/spider.js"
    chmod +x "$bin_path/spider.js"
  fi

  #  CasperJS bin/casper.js depends on the nodejs command which is a legacy
  #+ executable name. If the nodejs command is missing, we create a 1-line shell
  #+ script to make the nodejs command available in the users $bin_path
  if ! is_available nodejs && ! [ -e "${bin_path}/nodejs" ]; then
    cat <<'FILE' > "${bin_path}/nodejs"
#!/usr/bin/env sh

exec node "$@"

FILE

    chmod +x "${bin_path}/nodejs"

    sleep 3
    cat <<EOM
  ---------------------------
  
  The command nodejs has been created: $bin_path/nodejs
  
  This is a workaround for CasperJS, which depends on the nodejs command, which is
  a legacy executable name. Modern node installs only provide the node command.
  
  This 1-line nodejs shell script executes the current shells node command.
  This approach is immune to nvm/node version issues or hardcoding problems.
  
  Note:
  An alias is unsuitable because aliases are not evaluated by the env command.
  e.g. #!/usr/bin/env nodejs
  A symlink should not be used, as this will cause version mismatches when nvm
  switches or installs a different version.

EOM
  fi # endif nodejs is not available

######################################################################
# output info for the user

  sleep 3
  cat <<EOM
  ---------------------------
    
   ██████  ██████  ███    ███ ██████  ██      ███████ ████████ ███████ 
  ██      ██    ██ ████  ████ ██   ██ ██      ██         ██    ██      
  ██      ██    ██ ██ ████ ██ ██████  ██      █████      ██    █████   
  ██      ██    ██ ██  ██  ██ ██      ██      ██         ██    ██      
   ██████  ██████  ██      ██ ██      ███████ ███████    ██    ███████ 
  
  $install_target_name has been installed.
  
  Version: $INSTALL_VERSION
  
  Relevant paths:
  
  install path: $INSTALL_PATH
  
  comamnd path: $bin_path/$install_target_name

  config path: $config_path
  
  ---------------------------
  
  !!! IMPORTANT !!!
  
  You must reload your shell to apply any changes to your shell's runtime
  configuration. This ensures the relevant commands are available on your \$PATH
  
  Your detected shell is: $SHELL

  You can try the following methods:
  
  1a. Soft reload your shell, my personal favourite. This method will soft
  reload your shell, env WILL be inherited and parent process association
  remains intact:
  
  \$ exec $SHELL -l

  -- OR --

  1b. Hard reload your shell, env will NOT be inherited. One side-effect of this
  method is that the your shell process will be disassociated from any parent
  process:

  \$ exec sudo --login --user $username
  
  alt: $ exec sudo su - $username
  alt: $ exec su - $username # sans sudo - will prompt for password

  Note: If you detect any issues with method 1b please report it. For example if
  you detect any issues using a terminal multiplexer like tmux or screen.
  
  -- OR --
  
  2. Source your profile and shell rc file, for example:
  
  \$ . ~/.profile ; . ~/.bashrc
  
  -- OR --
  
  3. Manually close relevant shell sessions and start new ones.
  
  ---------------------------
  
  To run the $install_target_name utility:
  
  1. Reload your shell to apply the new runtime configuration (see above)
  
  2. Edit the config file, for example:
  
  \$ $EDITOR $config_path/config.yaml
  
  2. Run the utility to start the interactive download process:

  \$ $install_target_name
  
  TIP: You can scroll up to read any info you might of missed.
 
EOM

}

install

} # this ensures the entire script is downloaded #
