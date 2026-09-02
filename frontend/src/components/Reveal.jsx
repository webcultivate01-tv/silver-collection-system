import { useEffect, useRef, useState } from "react";

// Fades and lifts a block into place the first time it scrolls into view -
// used to animate every section of the landing page. One observer per
// instance is fine at this page's scale (hero, about, a handful of cards,
// contact, footer); it disconnects itself once triggered, so it never fires
// twice.
//
// `as` picks the rendered tag, so this can wrap a <form> (the enquiry form
// needs to stay a real form, not a div around one) as easily as a <div>.
//
// `direction` picks which way the block travels in from: "up" (default) for
// most content, "right" for the hero rate card, which reads better sliding
// in from the side it sits on than rising with everything else.
const HIDDEN_TRANSFORM = {
  up: "translate-y-8",
  right: "translate-x-12",
  left: "-translate-x-12",
};

export default function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  direction = "up",
  className = "",
  ...rest
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        visible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${HIDDEN_TRANSFORM[direction]}`
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
