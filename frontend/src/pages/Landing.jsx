// The public front door at "/". Anyone can open it - no session, no token.
//
// One scrolling page: hero (with today's published silver rate), about,
// contact, enquiry form, footer. The navbar's Login button opens a popup
// offering the customer and employee doors; the admin door is not advertised
// here and is still reached by typing /admin.
//
// The page is held to three colours, and nothing here should add a fourth:
//
//   ink     silver-900      headings, the footer, anything that reads first
//   silver  silver-50..500  every surface, border, divider and body line
//   accent  brand-500/600   one thing at a time - the action, or the figure
//                           the eye is meant to land on
//
// Rate movement is shown by the arrow and the sign rather than by red and
// green, so the accent stays the only colour on the page.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchTodayRate } from "../store/silverRateSlice.js";
import { formatDate, formatRupees } from "../utils/format.js";
import { BRAND_NAME, BRAND_TAGLINE, CONTACT, HERO_BG_URL, PHONE_HREF } from "../utils/brand.js";
import BrandLogo from "../components/BrandLogo.jsx";
import LandingNavbar from "../components/LandingNavbar.jsx";
import LoginChoiceModal from "../components/LoginChoiceModal.jsx";
import EnquiryForm from "../components/EnquiryForm.jsx";
import Reveal from "../components/Reveal.jsx";
import {
  IconArrowRight,
  IconCalendar,
  IconCash,
  IconClock,
  IconMail,
  IconPhone,
  IconPin,
  IconReport,
  IconShield,
  IconSilver,
  IconTrendDown,
  IconTrendUp,
  IconUsers,
} from "../components/Icons.jsx";

// One side of the rate card: the figure, and how far it moved since the
// previously published day. A rise is drawn in the accent and a fall in plain
// silver - the arrow and the sign already carry the direction, so no third
// colour is needed to say it twice.
function RateFigure({ label, value, change, tone }) {
  const moved = Number(change);
  const hasMoved = Number.isFinite(moved) && moved !== 0;
  const up = moved > 0;

  return (
    <div className="flex-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
        {label}
      </div>

      <div className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>₹{formatRupees(value)}</div>

      <div className="mt-1 h-5 text-xs font-medium">
        {hasMoved ? (
          <span
            className={`inline-flex items-center gap-1 ${up ? "text-brand-600" : "text-silver-500"}`}
          >
            {up ? (
              <IconTrendUp className="h-3.5 w-3.5" />
            ) : (
              <IconTrendDown className="h-3.5 w-3.5" />
            )}
            {up ? "+" : "-"}₹{formatRupees(Math.abs(moved))}
          </span>
        ) : (
          <span className="text-silver-400">No change</span>
        )}
      </div>
    </div>
  );
}

// Today's published rate, the centrepiece of the hero. Three states: still
// loading, nothing published yet, and a rate to show.
function TodayRateCard() {
  const dispatch = useDispatch();
  const { rate, change, isToday, loading } = useSelector((state) => state.silverRate);

  useEffect(() => {
    dispatch(fetchTodayRate());
  }, [dispatch]);

  return (
    <div className="relative w-full max-w-md">
      {/* A soft halo so the card reads as the lit object in the hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-5 rounded-[2.25rem] bg-gradient-to-br from-brand-200/40 via-silver-200/30 to-silver-300/40 blur-2xl"
      />

      <div className="relative overflow-hidden rounded-2xl border border-silver-200 bg-white/95 p-6 shadow-lift backdrop-blur-xl sm:p-7">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/70 to-transparent"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
              <IconSilver className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-silver-900">Silver Rate</div>
              <div className="text-[11px] uppercase tracking-wider text-silver-400">per gram</div>
            </div>
          </div>

          {rate && (
            <span
              className={
                isToday
                  ? "badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
                  : "badge-neutral"
              }
            >
              <IconCalendar className="h-3.5 w-3.5" />
              {isToday ? "Today" : formatDate(rate.rateDate)}
            </span>
          )}
        </div>

        <div className="mt-6">
          {loading && !rate ? (
            <div className="flex gap-6">
              <div className="h-16 flex-1 animate-pulse rounded-lg bg-silver-200" />
              <div className="h-16 flex-1 animate-pulse rounded-lg bg-silver-200" />
            </div>
          ) : rate ? (
            <>
              <div className="flex gap-6">
                <RateFigure
                  label="You buy at"
                  value={rate.buyRatePerGram}
                  change={change?.buy}
                  tone="text-silver-900"
                />
                <span className="w-px bg-gradient-to-b from-transparent via-silver-300 to-transparent" />
                <RateFigure
                  label="We buy back at"
                  value={rate.sellRatePerGram}
                  change={change?.sell}
                  tone="text-silver-700"
                />
              </div>

              <p className="mt-5 border-t border-silver-200 pt-4 text-xs leading-relaxed text-silver-500">
                {isToday
                  ? "Published by our team today. Rates are set once a day and apply to every branch."
                  : `The most recent published rate, from ${formatDate(rate.rateDate)}. Today's rate will appear here once it is set.`}
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-silver-300 px-4 py-8 text-center">
              <p className="text-sm font-medium text-silver-600">
                Today&apos;s rate has not been published yet
              </p>
              <p className="mt-1 text-xs text-silver-400">
                Please check back a little later, or call us on {CONTACT.phone}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const HIGHLIGHTS = [
  {
    Icon: IconCash,
    title: "Save by the rupee",
    body: "Save any amount you choose, every day or according to your saving plan. Your payment is recorded in your account and converted into silver based on the applicable daily rate.",
  },
  {
    Icon: IconSilver,
    title: "Get your silver every Monday",
    body: "Your weekly savings are converted into physical silver, and every Monday you receive your silver coin as part of your savings journey.",
  },
  {
    Icon: IconUsers,
    title: "Collected at your doorstep",
    body: "Our employees personally visit you to collect your savings, making it convenient to save regularly without having to visit the shop every day.",
  },
  {
    Icon: IconReport,
    title: "Every gram accounted for",
    body: "Every payment and silver transaction is recorded against your name. Track your savings, silver balance, and transaction history through your customer account at any time.",
  },
];

// What the hero's "How it works" button is pointing at: the same three things
// the About paragraphs say, pulled out so the shape of the scheme can be read
// in about ten seconds. The numbers are drawn by the list below, so the titles
// here are written without them.
const STEPS = [
  {
    title: "Open your account",
    body: "Visit us and open your Shiv Shakti Silver savings account. Our team will verify your details and create your account so your savings can be recorded in your name.",
  },
  {
    title: "Save every day",
    body: "Save any amount that suits you. Our employee collects your savings personally and records your payment in your account, keeping track of every contribution.",
  },
  {
    title: "Receive your silver every Monday",
    body: "Your accumulated savings are converted into silver according to the applicable rate, and every Monday you receive your silver coin. Your complete savings and silver records remain available in your account.",
  },
];

const TRUST = [
  { Icon: IconShield, label: "Verified accounts", detail: "Aadhaar and PAN on record" },
  { Icon: IconCalendar, label: "One rate a day", detail: "Published, not negotiated" },
  { Icon: IconClock, label: "Same-day entries", detail: "Recorded as they happen" },
];

// The eyebrow above every section heading below the hero.
function Eyebrow({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">
      <span aria-hidden="true" className="h-px w-6 bg-brand-300" />
      {children}
    </span>
  );
}

export default function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);

  // The dashboards leave the title alone; this is the public page, so it says
  // who the company is rather than which system this is.
  useEffect(() => {
    document.title = `${BRAND_NAME} - ${BRAND_TAGLINE}`;
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar onLoginClick={() => setLoginOpen(true)} />
      <LoginChoiceModal open={loginOpen} onClose={() => setLoginOpen(false)} />

      {/* ---------------------------------------------------------- Hero */}
      <section
        id="home"
        className="relative scroll-mt-20 overflow-hidden bg-white pb-16 pt-24 sm:pb-20 sm:pt-28"
      >
        {/* The backdrop is a photograph now, so the painted layers that used
            to stand in for one - a silver wash, a dot grid, two blurred blooms
            - are gone. Stacked over brushed metal they read as dirt on the
            lens rather than texture, and the plate already supplies both.

            What is left is the plate and the two scrims that make it safe to
            set type on. The plate is bright and near-white through the middle
            and left, which is where the copy sits; the bullion, the coins and
            the vault door are all in the right third, which is why the wash
            below thins out in that direction instead of being even. */}
        <img
          src={HERO_BG_URL}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[50%_62%]"
        />

        {/* Heaviest under the headline, thinnest over the artwork. Below lg
            the copy runs the full width of the section, so the right-hand end
            has to stay milky enough to read on; from lg the two-column grid
            keeps the text clear of the metal and the scrim can open up. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/55 lg:via-white/70 lg:to-white/10"
        />

        {/* The About section below is flat white with a hairline top border.
            Without this the photograph would stop dead against it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-white"
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <Reveal>
            {/* The tagline opens the page as a rule-and-caption rather than a
                pill - the headline underneath is what should carry the weight
                here, so nothing above it competes. */}
            <span className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-silver-500">
              <span aria-hidden="true" className="h-px w-6 bg-silver-300" />
              {BRAND_TAGLINE}
            </span>

            {/* "Silver" is the one word on the page set in the accent. The
                backdrop behind it is already brushed metal, so drawing the
                word as metal too only competed with the photograph; in the
                brand colour it is unmistakably the thing being promised, and
                it ties the headline to the button below it.

                The headline is two lines and only two: each is its own block,
                so the break cannot collapse, and every size below is picked so
                that the longer of them - "Get Silver Every Monday." - still
                fits on one line at that width. It steps DOWN at lg on purpose:
                that is where the two-column grid starts and the left column
                gets narrower than the full-width md one, so the type has to
                give some back until xl widens it again. */}
            <h1 className="mt-6 text-[clamp(1.4rem,6.2vw,2.35rem)] font-bold leading-[1.1] tracking-tight text-silver-900 sm:text-[2.5rem] lg:text-[2.25rem] xl:text-[2.7rem]">
              <span className="block">Save Daily.</span>
              <span className="block">
                Get <span className="text-brand-600">Silver</span> Every Monday.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-silver-600 sm:text-lg">
              Open your {BRAND_NAME} account and start saving a small amount every day. Our
              employee collects your savings personally, records every payment securely in your
              account, and every Monday, your savings are turned into real silver for you.
            </p>

            <div className="mt-9 flex flex-nowrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="btn-glow whitespace-nowrap px-4 py-2.5 text-sm sm:px-6 sm:py-3 sm:text-base"
              >
                Login to your account
                <IconArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <a
                href="#about"
                className="btn-glass whitespace-nowrap px-4 py-2.5 text-sm sm:px-6 sm:py-3 sm:text-base"
              >
                How it works
              </a>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-silver-200 bg-silver-200 shadow-card sm:grid-cols-3">
              {TRUST.map(({ Icon, label, detail }) => (
                <div key={label} className="flex items-center gap-3 bg-white px-4 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="leading-tight">
                    <div className="text-xs font-semibold text-silver-800">{label}</div>
                    <div className="mt-0.5 text-[11px] text-silver-500">{detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={150} direction="right" className="flex justify-center lg:justify-end">
            <TodayRateCard />
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------- About */}
      <section
        id="about"
        className="scroll-mt-20 border-t border-silver-200 bg-white py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* The heading and the prose are two columns rather than one stack,
              which is the whole point of the rearrangement: the heading is
              short and wants to be large, the prose is long and wants a
              narrow measure, and stacking them forced both into the same
              half-width column with the cards crowding in alongside. Split
              across the full width, each gets the shape it needs and the
              cards get a band of their own underneath. */}
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-16">
            <Reveal>
              <Eyebrow>About us</Eyebrow>
              <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-silver-900 sm:text-[2.6rem]">
                A simple way to save every day and turn your savings into silver.
              </h2>
            </Reveal>

            {/* The rule is the only thing marking this as the answer to the
                heading rather than a second column of equal weight; on one
                column it disappears, because stacked order already says it. */}
            <Reveal
              delay={150}
              className="space-y-4 border-silver-200 text-base leading-relaxed text-silver-600 lg:border-l lg:pl-16"
            >
              <p>
                {BRAND_NAME} makes silver savings simple and accessible for everyone. You open your
                account and choose an amount that you can comfortably save each day. Our employee
                collects your daily savings personally and records every payment in your account.
              </p>
              <p>
                Every contribution is carefully tracked, so you always know how much you have saved
                and how much silver you have accumulated. Every Monday, your savings are converted
                into silver and you receive your silver coin.
              </p>
              <p>
                We believe saving should be simple, transparent, and consistent. That&apos;s why we
                keep your records clear, your daily collections organized, and your silver savings
                easy to follow — helping you turn small daily savings into something real and
                valuable.
              </p>
            </Reveal>
          </div>

          {/* Four across on a full-width row instead of a 2x2 stuffed into
              half the page. At a quarter of the grid each card is close to
              square, so the icon, the title and three or four lines of body
              stack the way the card was drawn to be read. */}
          <div className="mt-14 grid gap-4 border-t border-silver-200 pt-14 sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map(({ Icon, title, body }, index) => (
              <Reveal
                key={title}
                delay={index * 100}
                className="group rounded-2xl border border-silver-200 bg-white p-5 shadow-card transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-silver-50 text-silver-600 ring-1 ring-inset ring-silver-200 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600 group-hover:ring-brand-100">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-silver-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-silver-600">{body}</p>
              </Reveal>
            ))}
          </div>

          {/* The scheme in three steps. Ink panel, so About has one dark
              block to break up an otherwise white section. */}
          <Reveal as="div" className="mt-16 overflow-hidden rounded-3xl bg-silver-900 shadow-lift">
            <div className="border-b border-white/10 px-6 py-7 sm:px-10">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand-300">
                <span aria-hidden="true" className="h-px w-6 bg-brand-400/60" />
                How it works
              </span>
              <h3 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
                Simple daily savings. Real silver every Monday.
              </h3>
            </div>

            <ol className="grid gap-px bg-white/10 sm:grid-cols-3">
              {STEPS.map(({ title, body }, index) => (
                <li key={title} className="bg-silver-900 px-6 py-7 sm:px-8">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold tabular-nums text-brand-300 ring-1 ring-inset ring-brand-400/30">
                    {index + 1}
                  </span>
                  <h4 className="mt-4 text-sm font-semibold text-white">{title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-silver-400">{body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* Contact. The branch details and the enquiry form are one section and
          live together in this component - see the note at the top of it. It
          owns both the #contact and #enquiry anchors. */}
      <EnquiryForm />

      {/* -------------------------------------------------------- Footer */}
      <footer className="bg-silver-900 pt-16 text-silver-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal as="div" className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_1.4fr]">
            <div className="max-w-sm">
              {/* The footer is the one dark surface on the page, so this is the
                  only place the mark is used exactly as it was painted. It
                  stands alone here, with no name set beside it, so it is given
                  a little more height than the navbar's copy - at h-10 with
                  nothing to anchor it, it read as a stray graphic rather than
                  the head of the column. */}
              <BrandLogo tone="white" alt={`${BRAND_NAME} logo`} className="h-12" />
              {/* The promise first, in white so it reads as the line the
                  column is headed by, then the explanation under it in the
                  same muted silver the other columns use. */}
              <p className="mt-5 text-sm font-semibold leading-relaxed text-white">
                Save a little every day. Get something real every Monday.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-silver-400">
                {BRAND_NAME} makes daily savings simple, transparent, and meaningful — with every
                payment recorded securely in your name.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-silver-400">
                Company
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a href="#home" className="transition-colors hover:text-white">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#about" className="transition-colors hover:text-white">
                    About
                  </a>
                </li>
                <li>
                  <a href="#contact" className="transition-colors hover:text-white">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#enquiry" className="transition-colors hover:text-white">
                    Send an enquiry
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-silver-400">
                Sign in
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => setLoginOpen(true)}
                    className="transition-colors hover:text-white"
                  >
                    Customer portal
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setLoginOpen(true)}
                    className="transition-colors hover:text-white"
                  >
                    Employee portal
                  </button>
                </li>
              </ul>
            </div>

            {/* The branch details spelled out again. The contact section is
                halfway up the page; the footer is where people go looking. */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-silver-400">
                Get in touch
              </h3>
              <ul className="mt-4 space-y-4 text-sm">
                <li className="flex gap-3">
                  <IconPhone className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  <a href={PHONE_HREF} className="transition-colors hover:text-white">
                    {CONTACT.phone}
                  </a>
                </li>
                <li className="flex gap-3">
                  <IconMail className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  <a
                    href={`mailto:${CONTACT.email}`}
                    className="break-all transition-colors hover:text-white"
                  >
                    {CONTACT.email}
                  </a>
                </li>
                <li className="flex gap-3">
                  <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  <address className="not-italic leading-relaxed">
                    {CONTACT.address.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </address>
                </li>
                <li className="flex gap-3">
                  <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  <span className="leading-relaxed">{CONTACT.hours}</span>
                </li>
              </ul>
            </div>
          </Reveal>

          <div className="mt-12 border-t border-white/10 py-6 text-center text-xs text-silver-500">
            <span>
              © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
