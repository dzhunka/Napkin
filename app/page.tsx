import Link from "next/link";
import { ChatWindow } from "./chat-window";
import { CopyButton } from "./copy-button";
import { Mark } from "./mark";
import "./styles.css";

const INSTALL_PROMPT =
  "Install the Napkin plugin from https://github.com/enkind/napkin";

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <div className="inner">
          <Link className="wordmark" href="/">
            <Mark />
            Napkin
          </Link>
          <span className="pill">Early preview</span>
          <span className="spacer" />
          <a href="https://github.com/enkind/napkin">GitHub</a>
          <a className="action" href="#install">
            Add to your agent
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="inner">
          <h1>
            Some ideas are quicker to{" "}
            <span className="drawn">
              draw
              <svg
                viewBox="120 136 396 140"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  pathLength={1}
                  vectorEffect="non-scaling-stroke"
                  d="M132 244C160 254 192 254 220 244C200 228 196 204 207 182C220 156 252 145 277 155C302 165 310 190 298 213C285 237 257 247 220 244C248 268 307 268 336 244C318 228 318 205 331 187C346 165 376 161 396 176C417 192 413 217 395 233C379 247 358 248 336 244C360 264 399 258 430 238C463 216 486 184 505 146"
                />
              </svg>
            </span>{" "}
            than to describe.
          </h1>
          <p className="lede">
            Napkin is a free plugin for the agent you already use. When words
            are doing badly, your agent hands you a napkin in the conversation.
            Sketch it rough, press Send, and your agent reads the drawing.
          </p>

          <div className="actions">
            <a className="action" href="#install">
              Add to your agent
            </a>
          </div>

          <ChatWindow />

          <p className="caption">
            The window is a mock of the client you already use. The napkin
            inside it is not — it is the same one your agent opens. Draw on it.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="inner">
          <h2>Three steps, and you never leave the chat.</h2>

          <ol className="steps">
            <li>
              <div className="chat tile" aria-hidden="true">
                <div className="menu">
                  <span className="on">
                    <Mark className="solid" />
                    Napkin
                    <span className="state">Connected</span>
                  </span>
                  <span>
                    <svg viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="7" />
                      <path d="M3 10h14M10 3c2 2.2 2.8 4.6 2.8 7s-.8 4.8-2.8 7c-2-2.2-2.8-4.6-2.8-7S8 5.2 10 3z" />
                    </svg>
                    Web search
                  </span>
                </div>
                <div className="composer">
                  <span className="round">
                    <svg viewBox="0 0 20 20">
                      <path d="M10 4.5v11M4.5 10h11" />
                    </svg>
                  </span>
                  <span className="ask">Ask anything</span>
                </div>
              </div>
              <h3>Add it to your agent</h3>
              <p>
                Point your agent at one address. There is no account and no key,
                and it sits beside the tools your agent already has.
              </p>
            </li>

            <li>
              <div className="chat tile" aria-hidden="true">
                <span className="prior">
                  It should feel like a mountain, but rounder? I can’t describe it.
                </span>
                <div className="menu">
                  <span className="on">
                    <Mark className="solid" />
                    <span className="skill">
                      <span className="state">Napkin:</span> Sketch
                    </span>
                  </span>
                </div>
                <div className="composer">
                  <span className="round">
                    <svg viewBox="0 0 20 20">
                      <path d="M10 4.5v11M4.5 10h11" />
                    </svg>
                  </span>
                  <span className="ask typed">/sketch</span>
                  <span className="round send">
                    <svg viewBox="0 0 20 20">
                      <path d="M10 15.5V5M5.5 9.5L10 5l4.5 4.5" />
                    </svg>
                  </span>
                </div>
              </div>
              <h3>Ask for a napkin</h3>
              <p>
                Say it would be easier to draw, or type{" "}
                <code className="mono">/sketch</code>. Your agent opens a blank
                napkin in the thread and waits.
              </p>
            </li>

            <li>
              <div className="chat tile" aria-hidden="true">
                <div className="sketch">
                  <svg viewBox="0 0 300 150" className="paper">
                    <path d="M36 116C76 116 86 42 126 42s50 74 90 74c20 0 32-26 52-26" />
                    <path d="M196 40a14 14 0 1 0 0.1 0" />
                  </svg>
                </div>
                <span className="said">Here is my napkin sketch for: rough logo direction</span>
              </div>
              <h3>Sketch and send</h3>
              <p>
                Draw it rough and press Send. The sketch lands in your next
                message, the way an attached photo would.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="band" id="install">
        <div className="inner">
          <h2>Add it to your agent.</h2>
          <p className="lede">No account and no key.</p>

          <div className="ways">
            <article>
              <div className="head">
                <h3>Ask your agent to install it</h3>
                <span className="pill">
                  <span className="dot" />
                  Available now
                </span>
              </div>
              <p>
                Paste this into Codex, Cursor, or Claude Code, then start a new
                chat.
              </p>
              <p className="address">
                <code className="mono">{INSTALL_PROMPT}</code>
                <CopyButton value={INSTALL_PROMPT} label="Copy" />
              </p>
            </article>

            <article>
              <div className="head">
                <h3>From your agent’s marketplace</h3>
                <span className="pill">Coming soon</span>
              </div>
              <p>
                Install it in one click from the plugin marketplace inside your
                agent.
              </p>
            </article>
          </div>
        </div>
      </section>

      <footer>
        <div className="inner">
          <p className="site-links">
            <a href="https://github.com/enkind/napkin">GitHub</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/support">Support</Link>
          </p>
          <p className="colophon">
            Free and noncommercial. MIT licensed. Made by dzhunka.
          </p>
          <p className="mission">Tools for agents. Software for humans.</p>
        </div>
      </footer>
    </main>
  );
}
