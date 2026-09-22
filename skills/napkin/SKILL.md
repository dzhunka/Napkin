---
name: napkin
description: Greets a person and opens an interactive greeting widget in the host UI. Use when the user asks to greet someone by name, or asks to change the tone of a greeting. Replace this skill with guidance for your own MCP App's tools.
license: MIT
---

# MCP App boilerplate

This skill tells the agent when to reach for the tools exposed by the
`napkin` MCP server, and how to talk about the widget the host
renders.

## Tools

- `greet({ name })` — returns a greeting and opens the widget. This is the
  entry point; call it whenever the user wants to greet someone.
- `set_tone({ name, tone })` — not available to you. It is registered with
  `visibility: ["app"]` so only the widget itself can call it, when the user
  clicks a tone button.

## How to use

1. Call `greet` with the person's name. The tool returns the greeting as text
   and the host renders the widget next to it.
2. Describe the greeting in your reply, but do not re-render it as a table or
   restate the widget's contents at length — the user can see the widget.
3. If the user asks for a different tone, call `greet` again rather than
   `set_tone`, and mention that they can also switch tone in the widget.

## When the host has no UI

Hosts that do not support the MCP Apps extension still receive the text
content from `greet`, so the tool remains useful without the widget. Do not
tell the user a widget appeared unless you know the host renders one.

## Adapting this skill

When you replace the boilerplate's `greet`/`set_tone` tools with your own:

- Rename this directory and the `name` field to match your plugin.
- Rewrite `description` so it names the concrete triggers that should activate
  the skill — that text is the only thing the agent sees before loading this
  file.
- Keep the distinction between model-visible tools and `visibility: ["app"]`
  tools explicit, since agents otherwise try to call widget-only tools.
