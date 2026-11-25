// Why: the SurgePerps pulse mark, matching the landing page.
// How: a single inline SVG polyline in the brand orange; `animated` makes
//      it beat like a pulse (CSS, off with reduced motion).
export function Logo({ size = 22, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={animated ? "logo-anim" : undefined}>
      <polyline points="2,13 7,13 9.5,5 13,19 15.5,10 17,13 22,13" fill="none" stroke="var(--orange)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
