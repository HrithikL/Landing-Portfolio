#!/usr/bin/env bash
# usage: run_agent.sh <agent-id> <model> <prompt-file> [budget-usd] [max-turns]
set -u
ID="$1"; MODEL="$2"; PROMPT_FILE="$3"; BUDGET="${4:-2}"; TURNS="${5:-60}"
ROOT="D:/Claude/Landing Portfolio"
LEDGER="$ROOT/.orchestration/ledger"
mkdir -p "$LEDGER"

START=$(date +%s)
claude -p "$(cat "$PROMPT_FILE")" \
  --model "$MODEL" \
  --output-format json \
  --max-turns "$TURNS" \
  --max-budget-usd "$BUDGET" \
  --dangerously-skip-permissions \
  > "$LEDGER/$ID.json" 2> "$LEDGER/$ID.err"
RC=$?
END=$(date +%s)
echo "{\"agent\":\"$ID\",\"model\":\"$MODEL\",\"exit\":$RC,\"wall_s\":$((END-START)),\"budget\":$BUDGET}" > "$LEDGER/$ID.meta.json"
exit $RC
