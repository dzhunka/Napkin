---
name: sketch
description: Opens a blank napkin the user can sketch on, and their drawing comes back as an image. Always use when the user selects this skill or invokes /sketch. Also use when the user is describing something visual and struggling to put it into words — a logo direction, a layout, a shape, how pieces are arranged on screen — or when they offer to draw it, say it would be easier to show you, or mention sketching, drawing, or a diagram.
license: MIT
---

# Napkin

`napkin` hands the user a blank napkin and a pen. They sketch, press Send, and the
drawing arrives as an image attached to their next message.

It exists for directions too rough or too spatial to write down. A sketch of a
logo takes five seconds and says more than a paragraph of adjectives.

## The one tool

`open_napkin({ brief? })` opens the napkin. `brief` is a short reminder shown on
it — "rough logo direction", "where the panels go" — so pass it when the napkin
is for something specific.

There is no tool for reading the sketch. The drawing does not come back through
the server; the widget hands it to the host, and it reaches you the same way any
image the user attaches does.

## How to use it

1. Call `open_napkin`, with a `brief` when you know what the sketch is for.
2. **Stop.** Say something short, like that the napkin is open. Then wait.
3. The sketch arrives as an image in the user's next message. Read it and carry
   on with the work it was for.

Step 2 is the part worth getting right. Nothing useful exists yet at that point,
so do not describe a drawing you have not seen, guess at what they will draw, or
start the task the sketch is supposed to inform. Do not call `open_napkin` again
while a napkin is already open and unsent.

## When to offer it

When the user invokes `/sketch`, they have already decided to draw. Open the
napkin right away, taking the `brief` from the conversation, rather than asking
what they want to sketch.

Otherwise, reach for it when words are doing badly:

- The user is circling a visual idea — "something like a mountain but rounder".
- The answer is spatial: a layout, an arrangement, a flow between boxes.
- They say it would be easier to show you, or ask whether they can draw it.

It is not a diagramming tool. The napkin has a pen and nothing else — no eraser,
no undo, no colours, no shapes. It is for the rough version. If the user wants
something precise or wants to revise a detail, a real tool is a better answer,
and if they want to change their sketch, open a fresh napkin.

## Reading what arrives

Treat the sketch as direction, not specification. Lines are approximate and
proportions are accidental. Take the intent — the shape, the arrangement, the
gesture — and ask about anything load-bearing you cannot make out, rather than
inventing a detail or reading precision into a wobbly line.

## When the host has no UI

The napkin needs a host that renders MCP Apps and accepts images from them.
Where that is missing, the widget says so and Send stays disabled, so the sketch
will never arrive. Do not tell the user a napkin opened unless you know the host
renders one — ask them to describe or attach the image instead.
