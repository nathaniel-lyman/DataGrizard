import type { GridDataType, GridFilterType } from "../../types/grid";

// Maps a column's value semantics (dataType) to the control that fits it best.
// This is the type-awareness the filter layer previously lacked (it defaulted
// every column to "select"). Pure + dependency-free so it is shared by the grid
// (DataGrid.tsx) and the demo server simulation (fakeServer.ts).
export const defaultFilterTypeForDataType = (dataType: GridDataType): GridFilterType => {
  switch (dataType) {
    case "number":
    case "currency":
    case "percent":
      return "range";
    case "date":
      return "date";
    case "status":
      return "multiSelect";
    case "boolean":
      return "boolean";
    case "text":
    default:
      return "text";
  }
};
