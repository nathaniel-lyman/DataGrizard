import { CloseIcon, SearchIcon } from "./icons";

type ToolbarSearchProps = {
  search: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
};

export function ToolbarSearch({ search, searchPlaceholder, onSearchChange }: ToolbarSearchProps) {
  return (
    <label className="flex min-w-72 flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      Search
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        >
          <SearchIcon className="h-3.5 w-3.5" />
        </span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-8 text-xs font-medium normal-case tracking-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300"
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </label>
  );
}
