/** Captured observations and source-backed candidates used by deterministic extraction. */
export type TechnicalObservation = {
  id: string;
  selector: string | null;
  property: string | null;
  value: string | null;
  asset_url: string | null;
};
export type FieldCandidate = {
  field: string;
  entity_key: string | null;
  value: unknown;
  origin: "source_backed";
  segment_ids: string[];
  observation_ids: string[];
  supporting_fields: string[];
  note: string | null;
};
