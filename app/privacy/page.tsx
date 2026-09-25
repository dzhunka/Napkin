import Link from "next/link";
import type { Metadata } from "next";

import "../styles.css";

export const metadata: Metadata = {
  title: "Privacy Policy · Napkin",
  description: "What Napkin receives, what it stores, and for how long.",
};

export default function Privacy() {
  return (
    <main className="legal">
      <section>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated 25 September 2026</p>

        <p>
          Napkin is a free, noncommercial plugin published by dzhunka. It has
          no accounts, no sign-in, no cookies, and no analytics. This policy
          describes the only data that reaches it.
        </p>

        <h2>What it receives</h2>
        <p>
          Napkin exposes one tool, <code>open_napkin</code>. When your agent
          calls it, the plugin receives at most one argument: a short brief the
          agent may write on the napkin as a reminder, such as &ldquo;rough logo
          direction&rdquo;. The plugin has no access to the rest of the
          conversation, to your files, or to anything else your agent holds.
        </p>

        <h2>Your sketch</h2>
        <p>
          Your drawing never reaches Napkin. The napkin runs inside a sandboxed
          frame supplied by your agent host, and when you press Send it hands
          the image directly to that host, which adds it to your conversation
          the same way it would a file you attached. From there it is handled
          under your agent host&apos;s own terms, exactly like any other image
          you share with your agent. Nothing is sent until you press Send.
        </p>
        <p>
          The napkin on this website works the same way, except that the page
          itself plays the host: a sketch you send there stays in your
          browser&apos;s memory and is gone when you leave the page.
        </p>

        <h2>What it stores</h2>
        <p>
          Nothing. The server opens the napkin and keeps no copy of the brief.
          There is no database, no file store, and no logging of tool payloads
          in production. Retention is therefore zero: there is nothing to
          delete, export, or request a copy of.
        </p>

        <h2>Hosting</h2>
        <p>
          The service runs on Vercel, which processes each request in order to
          serve it and records ordinary operational request metadata such as IP
          address, user agent, and timestamp under its own retention defaults.
          Napkin does not export, analyse, enrich, or retain that data.
        </p>

        <h2>Who else sees it</h2>
        <p>
          No one. Data is not sold, shared with advertisers, passed to
          analytics providers, or used to train any model. Vercel, as the
          hosting provider described above, is the only third party involved.
        </p>

        <h2>Your controls</h2>
        <p>
          Napkin acts only when your agent calls it, and it holds nothing
          afterwards. Closing a napkin without pressing Send discards the
          drawing. Uninstalling the plugin from your agent host stops every call
          and leaves no residue to erase.
        </p>

        <h2>Changes and contact</h2>
        <p>
          Material changes to this policy will be published on this page with a
          new date. Questions go to{" "}
          <a href="https://github.com/Enkind/napkin/issues">
            the public issue tracker
          </a>
          .
        </p>

        <p className="back">
          <Link href="/">Back to Napkin</Link>
        </p>
      </section>
    </main>
  );
}
