# Tabby Tab Activity Plus - Bash Shell Integration
# Sends OSC 133 sequences to report command start/end

# Guard against double-sourcing
if [[ -n "$__TABBY_ACTIVITY_PLUS_LOADED" ]]; then
  return
fi
__TABBY_ACTIVITY_PLUS_LOADED=1

__tabby_activity_last_cmd=""

__tabby_activity_preexec() {
  # Bash DEBUG trap fires for every command including PROMPT_COMMAND
  # Only emit OSC 133;C for actual user commands
  local cmd="$BASH_COMMAND"
  if [[ "$cmd" == "__tabby_activity_precmd" ]] || [[ "$cmd" == "$PROMPT_COMMAND" ]]; then
    return
  fi
  if [[ "$cmd" != "$__tabby_activity_last_cmd" ]]; then
    __tabby_activity_last_cmd="$cmd"
    printf '\e]133;C\a'
  fi
}

__tabby_activity_precmd() {
  local exit_code=$?
  printf '\e]133;D;%s\a' "$exit_code"
  __tabby_activity_last_cmd=""
}

trap '__tabby_activity_preexec' DEBUG
if [[ -n "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__tabby_activity_precmd;${PROMPT_COMMAND}"
else
  PROMPT_COMMAND="__tabby_activity_precmd"
fi
