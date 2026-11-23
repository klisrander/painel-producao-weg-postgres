export interface Named {
  id: string;
  code: string;
  name: string;
}
export interface Translated extends Named {
  areaId?: string;
  translations: { locale: string; label: string }[];
}
export interface Line extends Named {
  areaId: string;
  stages: { id: string; stageId: string; lineId: string }[];
  equipment: (Named & {
    lineId: string;
    workCenter?: string;
    assetCode?: string;
  })[];
}
export interface Area extends Named {
  factoryId: string;
  stages: Translated[];
  lines: Line[];
}
export interface Factory extends Named {
  unitId: string;
  areas: Area[];
}
export interface Unit extends Named {
  organizationId: string;
  accessKey: string;
  timeZone: string;
  shifts: (Named & {
    startMinute: number;
    endMinute: number;
    calendarRules: unknown[];
  })[];
  reasons: Translated[];
  factories: Factory[];
}
export interface Organization extends Named {
  units: Unit[];
}
export interface Target {
  id: string;
  lineStageId: string;
  shiftId: string;
  revision: number;
  versions: {
    id: string;
    effectiveFrom: string;
    enabled: boolean;
    capacity: number | null;
    efficiencyPercent: string | null;
    quantityTarget: number | null;
  }[];
}
export interface RecordRow {
  id: string;
  operationDate: string;
  shiftId: string;
  shift: Named;
  lineStageId?: string;
  lineStage?: { line: Named; stage: Named };
  equipmentId?: string;
  equipment?: Named & { line: Named };
  reasonId?: string;
  reason?: Named;
  quantity?: number;
  defects?: number;
  recovery?: boolean;
  durationMinutes?: number;
  comment?: string;
  startedAt?: string;
  endedAt?: string;
  version: number;
  actor: { displayName: string };
  metrics?: { ppm: number; efficiency: number | null; target: number | null };
}
export interface SummaryRow {
  date: string;
  lineStageId: string;
  line: string;
  stage: string;
  shift: string;
  shiftId: string;
  quantity: number;
  defects: number;
  capacity: number | null;
  rate: number | null;
  mixedTargets: boolean;
  metrics: {
    ppm: number;
    efficiency: number | null;
    target: number | null;
    achieved: boolean | null;
  };
}
export interface Summary {
  quantity: number;
  defects: number;
  count: number;
  rows: SummaryRow[];
}
