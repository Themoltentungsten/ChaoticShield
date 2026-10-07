import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import './StickerPeel.css';

interface StickerPeelProps {
  /** Image shown on the sticker. A transparent PNG gives a die-cut look. */
  imageSrc: string;
  /** Rendered sticker width in px (height scales automatically). */
  width?: number;
  /** Tilt applied to the artwork inside the sticker, in degrees. */
  rotate?: number;
  /** Transparent margin around the artwork, in px — gives the peel room. */
  padding?: number;
  /** How far the sticker peels back on hover, as a % of its height. */
  peelBackHoverPct?: number;
  /** How far it peels while pressed/active, as a % of its height. */
  peelBackActivePct?: number;
  /** Direction the sticker peels. 0 = curl upward, 180 = curl downward. */
  peelDirection?: number;
  /** Drop-shadow strength, 0–1. */
  shadowIntensity?: number;
  /** Cursor-tracked specular highlight strength. */
  lightingIntensity?: number;
  className?: string;
  alt?: string;
}

/**
 * StickerPeel — a peel-on-hover sticker effect, adapted from React Bits
 * (https://reactbits.dev/animations/sticker-peel) into a static, click-through
 * variant. Unlike the original it is not draggable, so it can sit inside a link
 * or button; the peel is pure CSS and only the moving highlight uses JS.
 */
const StickerPeel = ({
  imageSrc,
  width = 200,
  rotate = 0,
  padding = 10,
  peelBackHoverPct = 30,
  peelBackActivePct = 40,
  peelDirection = 0,
  shadowIntensity = 0.6,
  lightingIntensity = 0.1,
  className = '',
  alt = ''
}: StickerPeelProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointLightRef = useRef<SVGFEPointLightElement>(null);
  const pointLightFlippedRef = useRef<SVGFEPointLightElement>(null);

  // Move the SVG point light to follow the cursor across the sticker.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLight = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      pointLightRef.current?.setAttribute('x', String(x));
      pointLightRef.current?.setAttribute('y', String(y));

      const normalizedAngle = Math.abs(peelDirection % 360);
      if (normalizedAngle !== 180) {
        pointLightFlippedRef.current?.setAttribute('x', String(x));
        pointLightFlippedRef.current?.setAttribute('y', String(rect.height - y));
      } else {
        pointLightFlippedRef.current?.setAttribute('x', '-1000');
        pointLightFlippedRef.current?.setAttribute('y', '-1000');
      }
    };

    container.addEventListener('mousemove', updateLight);
    return () => container.removeEventListener('mousemove', updateLight);
  }, [peelDirection]);

  // Touch devices can't hover, so peel on tap by toggling a class.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const add = () => root.classList.add('touch-active');
    const remove = () => root.classList.remove('touch-active');

    root.addEventListener('touchstart', add, { passive: true });
    root.addEventListener('touchend', remove);
    root.addEventListener('touchcancel', remove);

    return () => {
      root.removeEventListener('touchstart', add);
      root.removeEventListener('touchend', remove);
      root.removeEventListener('touchcancel', remove);
    };
  }, []);

  const cssVars = useMemo(
    () =>
      ({
        '--sticker-width': `${width}px`,
        '--sticker-rotate': `${rotate}deg`,
        '--sticker-p': `${padding}px`,
        '--sticker-peelback-hover': `${peelBackHoverPct}%`,
        '--sticker-peelback-active': `${peelBackActivePct}%`,
        '--sticker-shadow-opacity': shadowIntensity,
        '--sticker-lighting-constant': lightingIntensity,
        '--peel-direction': `${peelDirection}deg`
      }) as CSSProperties,
    [width, rotate, padding, peelBackHoverPct, peelBackActivePct, shadowIntensity, lightingIntensity, peelDirection]
  );

  return (
    <div className={`sticker-peel ${className}`.trim()} ref={rootRef} style={cssVars}>
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <filter id="sp-pointLight">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feSpecularLighting
              result="spec"
              in="blur"
              specularExponent="100"
              specularConstant={lightingIntensity}
              lightingColor="white"
            >
              <fePointLight ref={pointLightRef} x="100" y="100" z="300" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceGraphic" result="lit" />
            <feComposite in="lit" in2="SourceAlpha" operator="in" />
          </filter>

          <filter id="sp-pointLightFlipped">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feSpecularLighting
              result="spec"
              in="blur"
              specularExponent="100"
              specularConstant={lightingIntensity * 7}
              lightingColor="white"
            >
              <fePointLight ref={pointLightFlippedRef} x="100" y="100" z="300" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceGraphic" result="lit" />
            <feComposite in="lit" in2="SourceAlpha" operator="in" />
          </filter>

          <filter id="sp-dropShadow">
            <feDropShadow
              dx="2"
              dy="4"
              stdDeviation={3 * shadowIntensity}
              floodColor="black"
              floodOpacity={shadowIntensity}
            />
          </filter>

          <filter id="sp-expandAndFill">
            <feOffset dx="0" dy="0" in="SourceAlpha" result="shape" />
            <feFlood floodColor="rgb(179,179,179)" result="flood" />
            <feComposite operator="in" in="flood" in2="shape" />
          </filter>
        </defs>
      </svg>

      <div className="sticker-container" ref={containerRef}>
        <div className="sticker-main">
          <div className="sticker-lighting">
            <img
              src={imageSrc}
              alt={alt}
              className="sticker-image"
              draggable={false}
              onContextMenu={e => e.preventDefault()}
            />
          </div>
        </div>

        <div className="flap">
          <div className="flap-lighting">
            <img src={imageSrc} alt="" className="flap-image" draggable={false} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StickerPeel;
