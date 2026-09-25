import Link from "next/link";
import type { Metadata } from "next";

import "../styles.css";

export const metadata: Metadata = {
  title: "Support · Napkin",
  description: "How to report a problem with Napkin or ask a question.",
};

export default function Support() {
  return (
    <main className="legal">
      <section>
        <h1>Support</h1>
        <p className="updated">Last updated 25 September 2026</p>

        <p>
          Problems, questions, and suggestions all go to the public issue
          tracker:
        </p>
        <p>
          <a href="https://github.com/Enkind/napkin/issues">
            github.com/Enkind/napkin/issues
          </a>
        </p>
        <p>
          Napkin is a free, noncommercial project maintained by one person, so
          support is best-effort rather than a guaranteed response time. Issues
          are handled in the open so other people can find the answer.
        </p>

        <h2>Reporting a problem</h2>
        <p>
          The most useful report says which agent host you were using, what you
          asked for, and what happened instead: whether the napkin appeared,
          whether it fit its card, and whether the sketch arrived after you
          pressed Send. A screenshot of the napkin in the conversation usually
          settles it faster than a description.
        </p>

        <h2>Privacy when reporting</h2>
        <p>
          An issue you open is public. Redact anything from your conversation or
          your sketch that you would not want published before pasting it in.
        </p>

        <p className="back">
          <Link href="/">Back to Napkin</Link>
        </p>
      </section>
    </main>
  );
}
