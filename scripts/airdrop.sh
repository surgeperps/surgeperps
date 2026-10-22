#!/usr/bin/env bash
# Why: deploying the programs and running the keeper on devnet costs SOL; devnet SOL is free.
# How: asks the devnet faucet for SOL for the given keypair (default: your Solana CLI keypair),
#      then prints the new balance. Usage: ./airdrop.sh [amount] [keypair-path]
set -euo pipefail

AMOUNT="${1:-2}"
KEYPAIR="${2:-${KEYPAIR_PATH:-$HOME/.config/solana/id.json}}"

solana airdrop "$AMOUNT" --keypair "$KEYPAIR" --url devnet
solana balance --keypair "$KEYPAIR" --url devnet
