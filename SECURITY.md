# Security and Privacy

## Prompt handling

SteelGate receives the submitted prompt through Claude Code or Codex hooks only to calculate its character count. The prompt text is not written to disk or sent over the network.

## Local communication

The hook sends a sanitized event to `127.0.0.1:24319`. The desktop process validates and recalculates all event values before storing them.

## Stored data

SteelGate stores local statistics under `~/.steelgate/`, including character counts, layers, HP, source tool, timestamps, and daily history.

## Reporting a vulnerability

Please open a GitHub issue without including private prompt content, credentials, or other sensitive data.
