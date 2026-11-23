export const permissions = [
  "organization.manage",
  "production.read",
  "production.create",
  "production.edit.own",
  "production.edit.any",
  "production.backdate",
  "stops.read",
  "stops.create",
  "stops.edit.own",
  "stops.edit.any",
  "targets.manage",
  "plans.read",
  "plans.manage",
  "audit.read",
  "reports.export",
  "reports.email",
] as const;
export type Permission = (typeof permissions)[number];
export const locales = ["pt-BR", "en-US", "es-ES"] as const;
export type Locale = (typeof locales)[number];
export interface Principal {
  issuer: string;
  subject: string;
  name: string;
  roles: string[];
  groups: string[];
  scopes: string[];
  permissions: Permission[];
  global: boolean;
}
export interface ErrorBody {
  code: string;
  details?: unknown;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: 10 | 30 | 50 | 100;
}
export interface TargetMetrics {
  enabled: boolean;
  capacity: number | null;
  efficiencyPercent: number | null;
  quantityTarget: number | null;
  effectiveFrom: string | null;
  revision: number;
  versionId: string | null;
}
export interface ResourceTree {
  id: string;
  code: string;
  name: string;
  [key: string]: unknown;
}
export const actionKinds = [
  "OVERTIME",
  "CAPACITY",
  "MATERIAL",
  "PEOPLE",
  "MAINTENANCE",
  "OTHER",
] as const;
export const actionStatuses = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export const calendars = ["ALL", "WEEKDAYS", "SATURDAY"] as const;
export interface CostInput {
  hourly: number;
  premium: number;
  charges: number;
  dsm: number;
  hours: number;
  food: number;
  people: number;
  volume: number;
  dailyExtra: number;
}
export interface PlanDayInput {
  date: string;
  demand: number | null;
  forecast: number | null;
  actualOverride: number | null;
  actualReason: string;
  adjustment: number;
  adjustmentReason: string;
  note: string;
  closed: boolean;
  recoveryOnly: boolean;
}
export interface ActionInput {
  included: boolean;
  id?: string;
  lineId?: string | null;
  title: string;
  kind: (typeof actionKinds)[number];
  status: (typeof actionStatuses)[number];
  calendar: (typeof calendars)[number];
  startDate: string;
  endDate: string;
  responsible: string;
  extraUnits: number;
  costPerDay: number;
  note: string;
}
export interface PlanInput {
  name: string;
  stageId: string;
  lineId?: string | null;
  startDate: string;
  initialBacklog: number;
  quantityMode: "TOTAL" | "GOOD";
  archived: boolean;
  note: string;
  days: PlanDayInput[];
  actions: ActionInput[];
  costs: CostInput;
  expectedRevision: number;
}
