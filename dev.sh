#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────
# Startup script with Socket Firewall (sfw) bypass.
#
# In this environment, `npm` is wrapped by a zsh function into `sfw npm ...`
# (Socket Firewall = a network filter for package managers).
# sfw blocks communication to anything other than package registries
# (= the Glean tenant glean.com), so the backend's Agent Card fetching, MCP,
# LLM Gateway, and OAuth all end up as "fetch failed".
#
# Use `SFW_BYPASS=1` to disable sfw at startup (only when running the app; at
# install time it is safer to keep sfw's protection). In environments without
# sfw, SFW_BYPASS is simply ignored.
#   Usage:  ./dev.sh
# ─────────────────────────────────────────────────────────────────────────
exec env SFW_BYPASS=1 npm run dev
