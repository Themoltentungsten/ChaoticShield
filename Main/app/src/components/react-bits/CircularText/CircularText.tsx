import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useMotionValue, useAnimationFrame } from 'motion/react';
import './CircularText.css';

interface CircularTextProps {
  text: string; // token repeated around the ring, e.g. "CHAOTIC SHIELD *"
  distance?: number; // radius of the text ring in px
  spinDuration?: number; // seconds for one full rotation at rest
  spinDurationHover?: number; // seconds per rotation while hovered
  reverse?: boolean;
  className?: string;
  textClassName?: string;
  separator?: string;
  children?: ReactNode;
}

export default function CircularText({
  text = 'React Bits',
  distance = 72,
  spinDuration = 40,
  spinDurationHover = 16,
  reverse = false,
  className = '',
  textClassName = '',
  separator = ' • ',
  children = null
}: CircularTextProps) {
  const letters = useMemo(() => {
    const token = `${text.trim()}${separator}`;
    const target = Math.max(24, Math.round(distance / 2.1));
    const repeats = Math.max(2, Math.ceil(target / token.length));
    return token.repeat(repeats).split('');
  }, [text, separator, distance]);

  const angleStep = 360 / letters.length;
  const size = distance * 2 + 32;

  const [hovered, setHovered] = useState(false);
  const rotate = useMotionValue(0);
  const speedRef = useRef((360 / spinDuration) * (reverse ? -1 : 1));

  useAnimationFrame((_t, delta) => {
    const targetSpeed = (360 / (hovered ? spinDurationHover : spinDuration)) * (reverse ? -1 : 1);
    const ease = Math.min(1, delta / 420);
    speedRef.current += (targetSpeed - speedRef.current) * ease;
    rotate.set(rotate.get() + (speedRef.current * delta) / 1000);
  });

  return (
    <div
      className={`circular-text-container ${className}`.trim()}
      style={{ width: size, height: size } as CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div className="circular-text" style={{ rotate }}>
        {letters.map((letter, i) => (
          <span
            key={i}
            className={`circular-letter ${textClassName}`.trim()}
            style={{
              transform: `translate(-50%, -50%) rotate(${i * angleStep}deg) translateY(${-distance}px)`,
            }}
          >
            {letter}
          </span>
        ))}
      </motion.div>
      {children != null && <div className="circular-text-center">{children}</div>}
    </div>
  );
}
