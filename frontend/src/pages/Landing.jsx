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
import { BRAND_NAME, BRAND_TAGLINE, CONTACT } from "../utils/brand.js";
import BrandLogo from "../components/BrandLogo.jsx";
import LandingNavbar from "../components/LandingNavbar.jsx";
import LoginChoiceModal from "../components/LoginChoiceModal.jsx";
import EnquiryForm from "../components/EnquiryForm.jsx";
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

// The phone number as typed is easy to read but not dialable; tel: wants it
// without the spaces.
const PHONE_HREF = `tel:${CONTACT.phone.replace(/\s/g, "")}`;

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
    Icon: IconSilver,
    title: "Buy silver by the rupee",
    body: "Pay any amount you like. It converts to grams at that day's published rate and is added to your holding straight away.",
  },
  {
    Icon: IconCash,
    title: "Sell back whenever you want",
    body: "Your silver can be sold back to us at the day's buy-back rate. No lock-in period and no paperwork to chase.",
  },
  {
    Icon: IconUsers,
    title: "Collected at your doorstep",
    body: "Our field employees visit you on a schedule that suits you, so a daily or monthly saving never needs a trip to the shop.",
  },
  {
    Icon: IconReport,
    title: "Every gram accounted for",
    body: "Each purchase, sale and payment is recorded against your name and is yours to read in the customer portal at any time.",
  },
];

// What the hero's "How it works" button is pointing at: the same three things
// the About paragraphs say, pulled out so the shape of the scheme can be read
// in about ten seconds.
const STEPS = [
  {
    title: "Open your account in person",
    body: "We verify your Aadhaar and PAN once, either at the branch or at your door. After that they are never asked for again.",
  },
  {
    title: "Save whatever suits you",
    body: "Hand over any amount, daily, weekly or monthly. It becomes grams at that morning's published rate and reaches your holding the same day.",
  },
  {
    title: "Sell back on any day",
    body: "Ask, and we buy the silver back at that day's buy-back rate. No notice period, no minimum holding, nothing to negotiate.",
  },
];

const TRUST = [
  { Icon: IconShield, label: "Verified accounts", detail: "Aadhaar and PAN on record" },
  { Icon: IconCalendar, label: "One rate a day", detail: "Published, not negotiated" },
  { Icon: IconClock, label: "Same-day entries", detail: "Recorded as they happen" },
];

// The four ways to reach the branch. The first two can be acted on, so they
// render as links and carry the accent; the last two are information and stay
// in plain silver.
const CONTACT_CARDS = [
  { Icon: IconPhone, label: "Phone", href: PHONE_HREF, lines: [CONTACT.phone] },
  { Icon: IconMail, label: "Email", href: `mailto:${CONTACT.email}`, lines: [CONTACT.email] },
  { Icon: IconPin, label: "Branch", href: null, lines: CONTACT.address },
  { Icon: IconClock, label: "Open", href: null, lines: [CONTACT.hours] },
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
        className="relative scroll-mt-20 overflow-hidden bg-white pb-24 pt-32 sm:pb-32 sm:pt-40"
      >
        {/* Layered backdrop, decorative only: a silver wash, a dot grid that
            fades out before it reaches the copy, and two soft blooms. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-silver-100 via-silver-50 to-white"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.4) 1px, transparent 0)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 75% 55% at 50% 0%, #000 35%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 55% at 50% 0%, #000 35%, transparent 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-24 h-[30rem] w-[30rem] rounded-full bg-brand-200/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-32 h-[30rem] w-[30rem] rounded-full bg-silver-300/40 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            {/* The mark opens the page. It is the one piece of the brand that
                is genuinely ours - hand-drawn, and the only ornament anywhere
                on a deliberately plain page - so it is given the top of the
                hero at a size the navbar cannot. The tagline sits under it as
                a rule-and-caption rather than a second pill: the mark is
                already the ornament, and a badge around it would be a frame
                around a frame. */}
            <BrandLogo alt={`${BRAND_NAME} logo`} className="h-14 sm:h-16" />

            <span className="mt-4 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-silver-500">
              <span aria-hidden="true" className="h-px w-6 bg-silver-300" />
              {BRAND_TAGLINE}
            </span>

            {/* "silver" is drawn as brushed metal - light, dark, light - the
                one place on the page where a gradient earns its keep. */}
            <h1 className="mt-6 text-[2.6rem] font-bold leading-[1.05] tracking-tight text-silver-900 sm:text-6xl">
              Save in{" "}
              <span className="bg-gradient-to-br from-silver-400 via-silver-800 to-silver-500 bg-clip-text text-transparent">
                silver
              </span>
              ,
              <br />
              not in small change.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-silver-600 sm:text-lg">
              {BRAND_NAME} turns whatever you can set aside - daily, weekly or monthly - into
              real silver at the day&apos;s published rate. Our team collects from you, records every
              gram against your name, and buys it back whenever you ask.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="btn-glow px-6 py-3 text-base"
              >
                Login to your account
                <IconArrowRight className="h-4 w-4" />
              </button>
              <a href="#about" className="btn-glass px-6 py-3 text-base">
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
          </div>

          <div className="flex justify-center lg:justify-end">
            <TodayRateCard />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- About */}
      <section
        id="about"
        className="scroll-mt-20 border-t border-silver-200 bg-white py-20 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>About us</Eyebrow>
              <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-silver-900 sm:text-[2.6rem]">
                A silver savings scheme run the way a neighbourhood shop should run it.
              </h2>

              <div className="mt-6 space-y-4 text-base leading-relaxed text-silver-600">
                <p>
                  Buying silver has always meant saving up a lump sum first, then walking into a
                  shop and hoping the day&apos;s rate is kind. {BRAND_NAME} was built to remove both
                  problems. You save what you can, when you can, and it becomes silver at the rate
                  published that morning - the same rate for every customer, at every branch.
                </p>
                <p>
                  Our employees handle the collection in person and enter it the same day. Behind
                  them, every purchase, buy-back and cash settlement is written into one ledger, so
                  the grams on your account and the cash in our books always agree.
                </p>
                <p>
                  When you want your money back, we buy the silver back at that day&apos;s buy-back
                  rate. There is no notice period, no minimum holding, and nothing to negotiate.
                </p>
              </div>

              {/* The mark is three times as wide as it is tall, so it sits
                  above the sentence rather than beside it - alongside, it would
                  either be squashed or leave the text no room. */}
              <div className="mt-8 rounded-2xl border border-silver-200 bg-silver-50 p-5">
                <BrandLogo alt={`${BRAND_NAME} logo`} className="h-12" />
                <p className="mt-4 text-sm leading-relaxed text-silver-600">
                  <span className="font-semibold text-silver-900">{BRAND_NAME}</span> -{" "}
                  {BRAND_TAGLINE}. Serving savers and their families with a plain, written record
                  of every gram.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:content-start">
              {HIGHLIGHTS.map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="group rounded-2xl border border-silver-200 bg-white p-5 shadow-card transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-silver-50 text-silver-600 ring-1 ring-inset ring-silver-200 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600 group-hover:ring-brand-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-silver-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-silver-600">{body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* The scheme in three steps. Ink panel, so About has one dark
              block to break up an otherwise white section. */}
          <div className="mt-16 overflow-hidden rounded-3xl bg-silver-900 shadow-lift">
            <div className="border-b border-white/10 px-6 py-7 sm:px-10">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand-300">
                <span aria-hidden="true" className="h-px w-6 bg-brand-400/60" />
                How it works
              </span>
              <h3 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
                Three steps, and none of them is a form you have to chase.
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
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Contact */}
      <section
        id="contact"
        className="scroll-mt-20 border-t border-silver-200 bg-silver-50 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <Eyebrow>Contact</Eyebrow>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-silver-900 sm:text-[2.6rem]">
              Talk to us before you start.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-silver-600">
              Opening an account is done in person, so that your identity documents are verified
              once and never asked for again. Call or write, and we will arrange for an employee to
              visit you.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTACT_CARDS.map(({ Icon, label, href, lines }) => {
              const inner = (
                <>
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ${
                      href
                        ? "bg-brand-50 text-brand-600 ring-brand-100"
                        : "bg-silver-50 text-silver-500 ring-silver-200"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-silver-500">
                    {label}
                  </h3>
                  <address className="mt-1 space-y-0.5 break-words text-sm font-medium not-italic leading-relaxed text-silver-900">
                    {lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </address>
                </>
              );

              const shell = "rounded-2xl border border-silver-200 bg-white p-5 shadow-card";

              return href ? (
                <a
                  key={label}
                  href={href}
                  className={`${shell} transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift`}
                >
                  {inner}
                </a>
              ) : (
                <div key={label} className={shell}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Enquiry */}
      <EnquiryForm />

      {/* -------------------------------------------------------- Footer */}
      <footer className="bg-silver-900 pt-16 text-silver-300">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_1.4fr]">
            <div className="max-w-sm">
              {/* The footer is the one dark surface on the page, so this is the
                  only place the mark is used exactly as it was painted. */}
              <div className="flex items-center gap-3">
                <BrandLogo tone="white" alt="" className="h-10" />
                <span aria-hidden="true" className="h-7 w-px bg-white/15" />
                <span className="text-base font-bold text-white">{BRAND_NAME}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-silver-400">
                {BRAND_TAGLINE}. Every gram bought, sold and settled is written down and stays
                readable to the person it belongs to.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-silver-500">
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-silver-500">
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-silver-500">
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
          </div>

          <div className="mt-12 flex flex-col gap-2 border-t border-white/10 py-6 text-xs text-silver-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
            </span>
            <a href={PHONE_HREF} className="transition-colors hover:text-silver-300">
              {CONTACT.phone} · {CONTACT.email}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
