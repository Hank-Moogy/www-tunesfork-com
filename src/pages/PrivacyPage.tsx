import LegalPage from "@/components/LegalPage";

const UPDATED = "17 September 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <section>
        <p>
          This explains what Tunesfork collects, why, and what you can do about it. We have tried
          to describe what the product actually does rather than what sounds reassuring.
        </p>
      </section>

      <section>
        <h2>1. What we collect</h2>
        <ul>
          <li><strong>Account details</strong> — your email address, display name, and avatar if you set one.</li>
          <li><strong>Your projects</strong> — the Ableton project files, audio, and samples you
              upload, together with metadata we read from them: tempo, track names, plugin names,
              Ableton version, and file sizes.</li>
          <li><strong>Collaboration</strong> — who you invite, who accepts, comments, and version history.</li>
          <li><strong>Payment</strong> — plan, subscription status, and billing history. Card
              details go directly to Stripe; we never see or store them.</li>
          <li><strong>Desktop app</strong> — which folders you have chosen to watch, and a local
              activity log. The log stays on your computer unless you send it to us.</li>
          <li><strong>Usage analytics</strong> — described in full below, because it is more
              extensive than most products of this kind.</li>
        </ul>
      </section>

      <section>
        <h2>2. Analytics, in plain terms</h2>
        <p>
          We use Amplitude, and during this early stage we have it configured broadly so we can
          find and fix problems quickly. Specifically:
        </p>
        <ul>
          <li><strong>Session replay is recorded for every session</strong>, not a sample. A replay
              reconstructs what the page looked like and what you did on it — clicks, scrolling,
              navigation, and typing into form fields.</li>
          <li>Password fields, payment fields, and invitation links are masked and are not recorded.
              Other on-screen text, including project and track names, may be.</li>
          <li>We record page views, clicks, downloads, form interactions, performance data, and
              signals such as rage clicks or dead clicks.</li>
          <li>We record the URLs, methods, and status codes of network requests the app makes.
              Request and response bodies and headers are not recorded.</li>
          <li>Your IP address, language, and platform are collected.</li>
        </ul>
        <p>
          We do this to understand where the product fails people, not to build a profile of you,
          and we intend to narrow it as Tunesfork matures.
        </p>
      </section>

      <section>
        <h2>3. Why we are allowed to process it</h2>
        <ul>
          <li><strong>To provide the service</strong> — performing our contract with you. This
              covers your account, your projects, sharing, and billing.</li>
          <li><strong>Our legitimate interests</strong> — keeping the service secure, preventing
              abuse, and improving it. The analytics above rest on this basis.</li>
          <li><strong>Legal obligations</strong> — tax and accounting records.</li>
        </ul>
        <p>
          If you would rather we did not process your usage data for analytics, write to us and we
          will act on it.
        </p>
      </section>

      <section>
        <h2>4. Who we share it with</h2>
        <p>We do not sell your data. We use these providers to run Tunesfork:</p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication, file storage.</li>
          <li><strong>Vercel</strong> — hosting for the website.</li>
          <li><strong>Stripe</strong> — payments and billing.</li>
          <li><strong>Amplitude</strong> — product analytics and session replay.</li>
          <li><strong>Resend</strong> — transactional email such as invitations and review notices.</li>
        </ul>
        <p>
          Some of these process data outside the European Economic Area. Where they do, transfers
          rely on the safeguards those providers put in place, such as standard contractual clauses.
        </p>
      </section>

      <section>
        <h2>5. Collaborators can see what you share with them</h2>
        <p>
          When you invite someone to a project, they can see its contents, its version history, the
          comments on it, and your display name. Sharing is the point of the product, but it is
          worth stating plainly.
        </p>
      </section>

      <section>
        <h2>6. How long we keep it</h2>
        <ul>
          <li>Account and project data: while your account is open.</li>
          <li>Deleted projects and versions: removed from the live service immediately, and from
              backups within a short period afterwards.</li>
          <li>Analytics and session replays: retained according to our Amplitude configuration,
              and not longer than we need them.</li>
          <li>Billing records: as long as tax law requires.</li>
        </ul>
      </section>

      <section>
        <h2>7. Your rights</h2>
        <p>
          If you are in the EEA or the UK you have the right to access your data, to correct it,
          to have it deleted, to restrict or object to processing, to portability, and to complain
          to your data protection authority. You can exercise any of these by writing to us, and
          you can delete your account at any time.
        </p>
      </section>

      <section>
        <h2>8. Children</h2>
        <p>Tunesfork is not intended for children under 16.</p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>
          Privacy questions and requests: <a href="mailto:privacy@tunesfork.com">privacy@tunesfork.com</a>.
        </p>
      </section>

      <section>
        <p className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-xs">
          <strong>Draft.</strong> Written to describe accurately what the product does today. It
          has not been reviewed by a lawyer, and it does not yet name a data controller, an
          establishment, or a representative. Session replay at full coverage is the part most
          likely to need a considered legal position before launch.
        </p>
      </section>
    </LegalPage>
  );
}
