import {
  SiReact,
  SiTypescript,
  SiVite,
  SiNodedotjs,
  SiExpress,
  SiSqlite,
  SiTailwindcss,
  SiRadixui,
  SiFramer,
  SiThreedotjs,
  SiLucide,
} from "react-icons/si";
import type { LogoItem } from "./LogoLoop";

export const techLogos: LogoItem[] = [
  { node: <SiReact />, title: "React", ariaLabel: "React" },
  { node: <SiTypescript />, title: "TypeScript", ariaLabel: "TypeScript" },
  { node: <SiVite />, title: "Vite", ariaLabel: "Vite" },
  { node: <SiNodedotjs />, title: "Node.js", ariaLabel: "Node.js" },
  { node: <SiExpress />, title: "Express", ariaLabel: "Express" },
  { node: <SiSqlite />, title: "SQLite", ariaLabel: "SQLite" },
  { node: <SiTailwindcss />, title: "Tailwind CSS", ariaLabel: "Tailwind CSS" },
  { node: <SiRadixui />, title: "Radix UI", ariaLabel: "Radix UI" },
  { node: <SiFramer />, title: "Motion", ariaLabel: "Motion" },
  { node: <SiThreedotjs />, title: "Three.js", ariaLabel: "Three.js" },
  { node: <SiLucide />, title: "Lucide", ariaLabel: "Lucide" },
];
