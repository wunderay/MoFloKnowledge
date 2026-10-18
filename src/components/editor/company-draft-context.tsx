"use client";
import { createContext, useContext, useMemo, useReducer } from "react";
import type { BusinessEntry, EntryKind, EntryProvenance } from "@/contracts";

interface EditorState {
  category: EntryKind;
  values: Record<string, BusinessEntry>;
  provenance: Record<string, EntryProvenance>;
  dirty: string[];
}
type Action =
  | { type: "category"; category: EntryKind }
  | { type: "edit"; id: string; content: BusinessEntry }
  | { type: "provenance"; id: string; provenance: EntryProvenance }
  | { type: "saved"; id: string };
function reducer(state: EditorState, action: Action): EditorState {
  if (action.type === "category") {
    return { ...state, category: action.category };
  }
  if (action.type === "saved") {
    const values = { ...state.values };
    const provenance = { ...state.provenance };
    delete values[action.id];
    delete provenance[action.id];
    return {
      ...state,
      values,
      provenance,
      dirty: state.dirty.filter((id) => id !== action.id),
    };
  }
  if (action.type === "edit") {
    return {
      ...state,
      values: { ...state.values, [action.id]: action.content },
      dirty: [...new Set([...state.dirty, action.id])],
    };
  }
  return {
    ...state,
    provenance: { ...state.provenance, [action.id]: action.provenance },
    dirty: [...new Set([...state.dirty, action.id])],
  };
}
const CompanyDraftContext = createContext<{
  companyId: string;
  state: EditorState;
  dispatch: React.Dispatch<Action>;
} | null>(null);
export function CompanyDraftProvider({
  companyId,
  children,
}: {
  companyId: string;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    category: "company_foundation",
    values: {},
    provenance: {},
    dirty: [],
  });
  const value = useMemo(
    () => ({ companyId, state, dispatch }),
    [companyId, state],
  );
  return (
    <CompanyDraftContext.Provider value={value}>
      {children}
    </CompanyDraftContext.Provider>
  );
}
export function useCompanyDraft() {
  const value = useContext(CompanyDraftContext);
  if (!value) {
    throw new Error("Company draft controls require a company scope.");
  }
  return value;
}
