export type ClassificationKind = "category" | "tag";
export type ProjectClassification = {
  id: string;
  kind: ClassificationKind;
  name: string;
  projectCount: number;
};

export type ClassificationSelection = {
  categoryId: string | null;
  tagIds: (string | null)[];
};

export function validClassificationName(kind: ClassificationKind, value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.trim().length <= (kind === "category" ? 60 : 40) &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
