type ToolbarSavedViewsProps = {
  savedViews: string[];
  activeViewName: string;
  viewNamePlaceholder: string;
  onSaveView: () => void;
  onApplyView: (name: string) => void;
  onDeleteView: (name: string) => void;
  onActiveViewNameChange: (name: string) => void;
};

export function ToolbarSavedViews({
  savedViews,
  activeViewName,
  viewNamePlaceholder,
  onSaveView,
  onApplyView,
  onDeleteView,
  onActiveViewNameChange,
}: ToolbarSavedViewsProps) {
  return (
    <div className="flex min-w-[360px] flex-wrap items-end gap-2">
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        View name
        <input
          value={activeViewName}
          onChange={(event) => onActiveViewNameChange(event.target.value)}
          placeholder={viewNamePlaceholder}
          className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium normal-case tracking-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
      </label>
      <button
        type="button"
        onClick={onSaveView}
        className="h-8 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        Save view
      </button>
      <select
        value=""
        onChange={(event) => {
          if (event.target.value) {
            onApplyView(event.target.value);
          }
        }}
        className="h-8 min-w-36 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        aria-label="Apply saved view"
      >
        <option value="">Saved views</option>
        {savedViews.map((view) => (
          <option key={view} value={view}>
            {view}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onDeleteView(activeViewName)}
        className="h-8 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        Delete
      </button>
    </div>
  );
}
