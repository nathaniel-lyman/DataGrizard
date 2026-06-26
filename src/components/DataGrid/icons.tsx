import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Funnel,
  GripVertical,
  Minus,
  Plus,
  Search,
  X,
  type LucideProps,
} from "lucide-react";

type IconProps = LucideProps;

const decorativeProps = (props: IconProps): IconProps => ({
  size: "1em",
  strokeWidth: 1.8,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

export const ChevronDownIcon = (props: IconProps) => <ChevronDown {...decorativeProps(props)} />;

export const ChevronUpIcon = (props: IconProps) => <ChevronUp {...decorativeProps(props)} />;

export const ChevronRightIcon = (props: IconProps) => <ChevronRight {...decorativeProps(props)} />;

export const CloseIcon = (props: IconProps) => <X {...decorativeProps(props)} />;

export const PlusIcon = (props: IconProps) => <Plus {...decorativeProps(props)} />;

export const MinusIcon = (props: IconProps) => <Minus {...decorativeProps(props)} />;

export const SearchIcon = (props: IconProps) => <Search {...decorativeProps(props)} />;

export const FilterIcon = (props: IconProps) => <Funnel {...decorativeProps(props)} />;

export const GripIcon = (props: IconProps) => <GripVertical {...decorativeProps(props)} />;

export const SortIcon = ({ state }: { state: false | "asc" | "desc" }) => {
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Icon
      size="1em"
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      className="ml-auto h-3 w-3 shrink-0 text-slate-400"
    />
  );
};
