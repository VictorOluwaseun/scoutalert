import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  Eye,
  Globe2,
  Laptop,
  Mail,
  MapPin,
  Pencil,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  type LucideProps,
} from "lucide-react";

const icons = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  bell: Bell,
  bookmark: Bookmark,
  briefcase: BriefcaseBusiness,
  check: Check,
  chevronDown: ChevronDown,
  help: CircleHelp,
  clock: Clock3,
  compass: Compass,
  eye: Eye,
  globe: Globe2,
  laptop: Laptop,
  mail: Mail,
  map: MapPin,
  pencil: Pencil,
  search: Search,
  shield: ShieldCheck,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  close: X,
};

export type IconName = keyof typeof icons;

/** Renders a deliberately limited, consistent icon set; adjoining text supplies accessible names. */
export function Icon({
  name,
  size = 18,
  ...props
}: LucideProps & { name: IconName }) {
  const Component = icons[name];
  return (
    <Component size={size} strokeWidth={1.7} aria-hidden="true" {...props} />
  );
}
