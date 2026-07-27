import Link from 'next/link'

const sectionClass = 'mt-10'
const headingClass = 'text-2xl font-bold text-white'
const bodyClass = 'mt-3 text-[#B7B7B7] leading-relaxed'
const listClass = 'mt-3 grid gap-2 text-[#B7B7B7] leading-relaxed list-disc pl-6'

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black p-6 text-white sm:p-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-base font-semibold text-[#B11218] hover:text-[#D11A22]">
          ← Home
        </Link>

        <div className="mt-6 rounded-2xl border border-[#2A0E10] bg-[#0B0B0B] p-6 shadow-2xl sm:p-10">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-[#B11218]">
            Encuerado Community Hub
          </p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-wide text-white sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-[#8F8F8F]">
            Last updated: July 23rd, 2026.
          </p>

          <div className={bodyClass}>
            This Privacy Policy explains what information Encuerado Weekend (&quot;we,&quot;
            &quot;us&quot;) collects through this website (the &quot;Site&quot;),
            why we collect it, and the choices you have. It covers volunteer
            signups, raffle entries, and event-related email — it does not cover
            ticket purchases made directly through TicketSpice, which has its own
            privacy policy for payment information.
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Information We Collect</h2>
            <div className={bodyClass}>
              Depending on which form you fill out, we may collect:
            </div>
            <ul className={listClass}>
              <li>Name, email address, and phone number</li>
              <li>City, state, and mailing address, if provided</li>
              <li>
                For volunteers: preferred roles, availability, prior experience,
                t-shirt size, and an emergency contact&apos;s name and phone number
              </li>
              <li>
                For raffle entries: which specific raffle/event you entered at
              </li>
              <li>
                Whether you&apos;ve agreed to receive promotional emails from us,
                and your unsubscribe status
              </li>
              <li>
                Basic technical information any website receives automatically
                (like IP address), used only for security purposes such as
                rate-limiting abusive form submissions — we do not use analytics
                or advertising trackers, and this Site does not use tracking
                cookies
              </li>
            </ul>
            <div className={bodyClass}>
              If you provide someone else&apos;s emergency contact information,
              please make sure they&apos;re okay with that before you submit it.
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>How We Use It</h2>
            <ul className={listClass}>
              <li>To register you for volunteer shifts and coordinate event staffing</li>
              <li>To run raffle drawings and contact the winner</li>
              <li>To send event announcements and community updates, if you opted in</li>
              <li>To contact you about something you signed up for (e.g. a shift change)</li>
              <li>To keep basic attendance/participation history for our community records</li>
              <li>To detect and prevent spam or abuse of our public forms</li>
            </ul>
            <div className={bodyClass}>
              We do not sell your information. We do not use it for advertising
              targeting, and we do not share it with anyone outside the list
              below except as required by law.
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Who We Share It With</h2>
            <div className={bodyClass}>
              We use a small number of service providers to operate this Site.
              They only receive what they need to do their job, and are not
              permitted to use your information for their own purposes:
            </div>
            <ul className={listClass}>
              <li>
                <strong className="text-white">Resend</strong> — delivers the
                emails we send you (confirmations, updates, promotional emails
                you opted into)
              </li>
              <li>
                <strong className="text-white">TicketSpice</strong> — processes
                ticket and sponsorship purchases directly; we receive your order
                details from them but never see or store your payment card
                information
              </li>
              <li>
                <strong className="text-white">Vercel / Neon</strong> — our
                website hosting and database providers, who store data on our
                behalf under their own security and confidentiality obligations
              </li>
            </ul>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>How Long We Keep It</h2>
            <div className={bodyClass}>
              We keep community participation records (who attended or
              volunteered, and in which years) to maintain our community history
              and coordinate future events. You can ask us to delete your
              information at any time — see &quot;Your Choices&quot; below.
              Raffle entries are kept only as long as needed to run the drawing
              and contact winners, plus a reasonable period for recordkeeping.
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Your Choices</h2>
            <ul className={listClass}>
              <li>
                <strong className="text-white">Unsubscribe:</strong> every
                promotional email includes an unsubscribe link. You can also
                opt out of promotional email at any time without affecting
                event-related communications you&apos;re otherwise entitled to.
              </li>
              <li>
                <strong className="text-white">Access, correction, or deletion:</strong>{' '}
                contact us at volunteers@encuerado.com and we&apos;ll update or
                remove your information, except where we&apos;re required to
                keep it (e.g. financial records related to a sponsorship
                payment).
              </li>
              <li>
                <strong className="text-white">Raffle entries:</strong> one
                entry per person per raffle is enforced using your email/phone
                so drawings stay fair. Submitting the same information twice
                for the same raffle will be recognized as a duplicate.
              </li>
            </ul>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Children&apos;s Privacy</h2>
            <div className={bodyClass}>
              This Site is not directed to children, and we do not knowingly
              collect information from anyone under 21. If you believe a
              minor has provided us information, contact us at volunteers@encuerado.com and we&apos;ll remove it.
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Security</h2>
            <div className={bodyClass}>
              We take reasonable technical and administrative measures to
              protect your information (access controls, encrypted connections,
              and restricted staff access). No method of storage or
              transmission is 100% secure, and we can&apos;t guarantee absolute
              security.
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Changes to This Policy</h2>
            <div className={bodyClass}>
              We may update this policy from time to time. We&apos;ll update the
              &quot;Last updated&quot; date above when we do. Continued use of
              the Site after changes means you accept the updated policy.
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className={headingClass}>Contact Us</h2>
            <div className={bodyClass}>
              Questions about this policy or your information? Contact us at
              volunteers@encuerado.com. This policy is governed by the laws of California.
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
