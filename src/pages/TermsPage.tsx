import LegalPage from "@/components/LegalPage";

const UPDATED = "17 September 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <section>
        <p>
          These terms cover your use of Tunesfork, a service for backing up, versioning and
          sharing Ableton Live projects. By creating an account or using the desktop app you
          agree to them. If you do not agree, please do not use the service.
        </p>
      </section>

      <section>
        <h2>1. The service, and its current stage</h2>
        <p>
          Tunesfork is in active development and is offered on an <strong>as-is</strong> basis.
          Features may change, be added, or be withdrawn. We do not promise any particular level
          of availability, performance, or continuity.
        </p>
        <p>
          <strong>Tunesfork is not a substitute for your own backups.</strong> We take real care
          with your work, but no service is infallible. Keep an independent copy of anything you
          cannot afford to lose.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>You must be old enough to form a binding contract where you live.</li>
          <li>You are responsible for activity under your account and for keeping your credentials secure.</li>
          <li>Tell us promptly if you believe your account has been accessed without your permission.</li>
        </ul>
      </section>

      <section>
        <h2>3. Your work stays yours</h2>
        <p>
          You keep all rights in the projects, audio, and other material you upload. Nothing here
          transfers ownership of your music to us.
        </p>
        <p>
          You grant us only the permission we need to run the service for you: to store, copy,
          transmit, and display your material so that you — and the collaborators you choose —
          can use it. That permission ends when you delete the material or close your account,
          except for copies held briefly in backups or as the law requires.
        </p>
        <p>
          You confirm you have the rights to the material you upload, including any samples,
          recordings, or third-party content it contains.
        </p>
      </section>

      <section>
        <h2>4. Collaboration</h2>
        <p>
          When you invite someone to a project, you are choosing to share that project's contents
          with them. Contributors may propose changes; you decide whether to accept them. Please
          only invite people you intend to give access to.
        </p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>Please do not use Tunesfork to:</p>
        <ul>
          <li>upload material you do not have the rights to;</li>
          <li>break the law, or infringe anyone's rights;</li>
          <li>attempt to gain access to accounts, data, or systems that are not yours;</li>
          <li>disrupt or overload the service, or work around its technical limits.</li>
        </ul>
      </section>

      <section>
        <h2>6. Plans, payment and cancellation</h2>
        <ul>
          <li>There is a free plan. Paid plans are billed in advance, monthly or yearly, in euros.</li>
          <li>Prices shown include applicable tax unless stated otherwise.</li>
          <li>Payments are handled by Stripe. We do not receive or store your card details.</li>
          <li>Subscriptions renew automatically until cancelled. You can cancel at any time and
              keep access until the end of the period you have paid for.</li>
          <li>Where consumer law gives you a right to cancel or a refund, that right applies and
              nothing here limits it.</li>
          <li>We may change prices; changes apply from your next renewal, and we will tell you
              beforehand.</li>
        </ul>
      </section>

      <section>
        <h2>7. Storage limits</h2>
        <p>
          Each plan includes an amount of cloud storage. If you reach your limit, new uploads
          will stop until you free space or move to a larger plan. Existing material is not
          deleted because you reached a limit.
        </p>
      </section>

      <section>
        <h2>8. Ending the arrangement</h2>
        <p>
          You may stop using Tunesfork and delete your account at any time. We may suspend or end
          an account that breaches these terms, or where we are required to. Where it is
          reasonable to do so, we will give you notice and a chance to put things right.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers and liability</h2>
        <p>
          To the extent the law allows, Tunesfork is provided without warranties of any kind, and
          we are not liable for indirect or consequential loss, or for lost profits, revenue, or
          data. Where we are liable, our total liability is limited to the amount you paid us in
          the twelve months before the claim.
        </p>
        <p>
          Nothing here excludes liability that cannot lawfully be excluded, including for death
          or personal injury caused by negligence, for fraud, or under consumer protection law.
        </p>
      </section>

      <section>
        <h2>10. Changes</h2>
        <p>
          We may update these terms as the service develops. If a change is significant we will
          tell you. Continuing to use Tunesfork after a change means you accept the updated terms.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          Questions about these terms: <a href="mailto:hello@tunesfork.com">hello@tunesfork.com</a>.
        </p>
      </section>

      <section>
        <p className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-xs">
          <strong>Draft.</strong> This is an early version written to be clear and conservative
          while Tunesfork is in alpha. It has not been reviewed by a lawyer, and it does not yet
          name a governing law or a contracting entity. Both need to be settled before Tunesfork
          takes payments at scale.
        </p>
      </section>
    </LegalPage>
  );
}
