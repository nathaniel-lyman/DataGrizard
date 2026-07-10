import { CloseIcon, SearchIcon } from "./icons";

type ToolbarSearchProps = {
  search: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
};

export function ToolbarSearch({ search, searchPlaceholder, onSearchChange }: ToolbarSearchProps) {
  return (
    <label className="dg-field dg-search-field">
      Search
      <div className="dg-search-wrap">
        <span
          aria-hidden="true"
          className="dg-search-icon"
        >
          <SearchIcon className="dg-icon--sm" />
        </span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="dg-input dg-search-input"
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="dg-search-clear"
          >
            <CloseIcon className="dg-icon--xs" />
          </button>
        ) : null}
      </div>
    </label>
  );
}
