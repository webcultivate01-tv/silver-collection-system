// The public site's navbar. Nothing here is behind a session - it renders the
// same for a first-time visitor as for someone already signed in somewhere.
//
// The three links are in-page anchors rather than routes: the landing page is
// one scrolling page, so Home/About/Contact move down it instead of loading
// anything. "Login" opens LoginChoiceModal.
//
// The bar is fixed for the whole scroll, never sliding away and never
// changing height - the page passes underneath it, frosted by the blur. The
// only thing scrolling changes is the shadow, which appears once there is
// something above to cast it. The link matching the section currently on
// screen is highlighted.

import { useEffect, useState } from "react";
import { BRAND_NAME } from "../utils/brand.js";
import BrandLogo from "./BrandLogo.jsx";
import { IconClose, IconMenu } from "./Icons.jsx";

const LINKS = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#contact", label: "Contact" },
];

export default function LandingNavbar({ onLoginClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(LINKS[0].href);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Whichever section is crossing the middle of the viewport owns the
  // highlight. The margins shrink the observed band to that middle strip so
  // only one section can win at a time.
  useEffect(() => {
    const sections = LINKS.map(({ href }) => document.querySelector(href)).filter(Boolean);
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(`#${entry.target.id}`);
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b bg-white/80 backdrop-blur-xl transition-shadow duration-300 ${
        scrolled ? "border-silver-200 shadow-card" : "border-silver-200/60"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* The wordmark stands alone - it already carries the name in
            Devanagari, so nothing is set beside it and no box goes around it. */}
        <a
          href="#home"
          className="group flex items-center"
          onClick={() => setMenuOpen(false)}
          aria-label={`${BRAND_NAME} - back to top`}
        >
          <BrandLogo
            alt=""
            className="h-9 transition-transform duration-300 group-hover:-translate-y-0.5"
          />
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              aria-current={active === href ? "true" : undefined}
              className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active === href ? "text-brand-700" : "text-silver-600 hover:text-silver-900"
              }`}
            >
              {active === href && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-brand-50 ring-1 ring-inset ring-brand-100"
                />
              )}
              <span className="relative">{label}</span>
            </a>
          ))}

          <button type="button" onClick={onLoginClick} className="btn-glow ml-3 px-5">
            Login
          </button>
        </div>

        <button
          type="button"
          className="rounded-xl p-2 text-silver-600 ring-1 ring-inset ring-silver-200 transition-colors hover:bg-silver-100 hover:text-silver-900 md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <IconClose /> : <IconMenu />}
        </button>
      </nav>

      {menuOpen && (
        <div className="animate-fade-in border-t border-silver-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active === href
                    ? "bg-brand-50 text-brand-700"
                    : "text-silver-700 hover:bg-silver-100"
                }`}
              >
                {label}
              </a>
            ))}

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onLoginClick();
              }}
              className="btn-glow mt-2 w-full"
            >
              Login
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
