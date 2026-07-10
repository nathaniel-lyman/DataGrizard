import { DropdownSelect } from "./DropdownSelect";

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
  const willOverwrite = savedViews.includes(activeViewName.trim());

  return (
    <div className="dg-saved-views">
      <label className="dg-field dg-saved-view-name">
        View name
        <input
          value={activeViewName}
          onChange={(event) => onActiveViewNameChange(event.target.value)}
          placeholder={viewNamePlaceholder}
          className="dg-input"
        />
      </label>
      <button
        type="button"
        onClick={onSaveView}
        className="dg-btn dg-btn--primary dg-saved-view-save"
      >
        {willOverwrite ? "Update view" : "Save view"}
      </button>
      <DropdownSelect
        value=""
        onChange={(value) => {
          onApplyView(value);
        }}
        options={savedViews.map((view) => ({ value: view, label: view }))}
        placeholder="Saved views"
        className="dg-saved-view-select"
        ariaLabel="Apply saved view"
      />
      <button
        type="button"
        onClick={() => onDeleteView(activeViewName)}
        className="dg-btn dg-btn--secondary dg-saved-view-delete"
      >
        Delete
      </button>
    </div>
  );
}
