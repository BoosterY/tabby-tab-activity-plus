# Tabby Tab Activity Plus - Zsh Shell Integration
# Sends OSC 133 sequences to report command start/end

# Guard against double-sourcing
if [[ -n "$__TABBY_ACTIVITY_PLUS_LOADED" ]]; then
  return
fi
__TABBY_ACTIVITY_PLUS_LOADED=1

__tabby_activity_preexec() {
  printf '\e]133;C\a'
}

__tabby_activity_precmd() {
  printf '\e]133;D;%s\a' "$?"
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __tabby_activity_preexec
add-zsh-hook precmd __tabby_activity_precmd
