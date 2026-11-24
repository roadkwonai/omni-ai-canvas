import { record } from "./graph";
import { soulVideoReferenceError } from "./character-identity";
import {
  mediaKey,
  mediaOptionValid,
  type MediaProfile,
  type MediaSelection,
  type MediaSlot,
  type MediaValue,
  type ResolvedMedia,
} from "./media-model-types";
import type { RunInput } from "./types";

export class MediaInputError extends Error {}

export function parseMediaSelection(value: unknown): MediaSelection {
  if (
    !record(value) ||
    typeof value.mode !== "string" ||
    !mediaKey.test(value.mode) ||
    !record(value.options) ||
    Object.keys(value.options).length > 40 ||
    Object.keys(value).some((key) => !["mode", "options", "assignments"].includes(key))
  ) {
    throw new MediaInputError("모델의 작업 방식과 옵션을 확인해 주세요.");
  }
  const options: [string, MediaValue][] = [];
  for (const [key, setting] of Object.entries(value.options)) {
    if (
      !mediaKey.test(key) ||
      (typeof setting !== "boolean" &&
        !(typeof setting === "number" && Number.isFinite(setting)) &&
        !(typeof setting === "string" && setting.length <= 2000 && !setting.includes("\0")))
    ) {
      throw new MediaInputError("모델 설정 값의 형식을 확인해 주세요.");
    }
    options.push([key, setting]);
  }
  const assignments: [string, string][] = [];
  if (value.assignments !== undefined) {
    if (!record(value.assignments) || Object.keys(value.assignments).length > 20)
      throw new MediaInputError("미디어 참조 할당을 확인해 주세요.");
    for (const [source, slot] of Object.entries(value.assignments)) {
      if (
        !/^(?:attachment|node):[a-zA-Z0-9_-]{1,80}$/.test(source) ||
        typeof slot !== "string" ||
        (!mediaKey.test(slot) && !(slot === "$text" && source.startsWith("node:")))
      ) {
        throw new MediaInputError("미디어 참조와 입력 슬롯을 확인해 주세요.");
      }
      assignments.push([source, slot]);
    }
  }
  return {
    mode: value.mode,
    options: Object.fromEntries(options),
    ...(assignments.length ? { assignments: Object.fromEntries(assignments) } : {}),
  };
}

export function isFrameOrMotion(role: RunInput["references"][number]["role"]) {
  return role === "start" || role === "end" || role === "motion";
}

export function resolveMedia(profile: MediaProfile, input: Pick<RunInput, "model" | "operation" | "media" | "references">): ResolvedMedia {
  if (input.model !== profile.model || input.operation !== profile.operation || input.media?.mode !== profile.mode)
    throw new MediaInputError("사용 가능한 모델과 작업 방식을 다시 선택해 주세요.");
  const { options: selected, assignments = {} } = input.media;
  const optionIds = new Set(profile.options.map((option) => option.id));
  if (Object.keys(selected).some((key) => !optionIds.has(key)))
    throw new MediaInputError("선택한 모델이 지원하는 옵션만 설정해 주세요.");
  const options: [string, MediaValue][] = [];
  for (const option of profile.options) {
    const value = Object.hasOwn(selected, option.id)
      ? selected[option.id]
      : option.required
        ? option.default
        : undefined;
    if (value === undefined && !option.required) continue;
    if (value === undefined || !mediaOptionValid(option, value))
      throw new MediaInputError(`‘${option.label}’ 옵션의 값을 확인해 주세요.`);
    options.push([option.id, value]);
  }

  const media: ResolvedMedia["media"] = Object.fromEntries(
    profile.slots.map((slot) => [slot.id, []]),
  );
  const confirmed = new Set<string>();
  const automatic: typeof input.references = [];
  const add = (slot: MediaSlot | undefined, reference: (typeof input.references)[number]) => {
    if (!slot || !reference.asset || reference.asset.type !== slot.type)
      throw new MediaInputError(`‘${reference.title}’에 맞는 입력 슬롯을 선택해 주세요.`);
    const assets = media[slot.id];
    if (assets.some((item) => item.url === reference.asset?.url)) return;
    if (assets.length >= slot.max)
      throw new MediaInputError(`‘${slot.label}’에는 최대 ${slot.max}개까지 넣을 수 있습니다.`);
    assets.push(reference.asset);
  };
  for (const reference of input.references) {
    const source = reference.attachmentId
      ? `attachment:${reference.attachmentId}`
      : reference.nodeId && `node:${reference.nodeId}`;
    const assigned = source && assignments[source];
    if (assigned === "$text" && (reference.asset || isFrameOrMotion(reference.role))) {
      confirmed.add(source!);
      continue;
    }
    if (!reference.asset) {
      if (isFrameOrMotion(reference.role))
        throw new MediaInputError(`‘${reference.title}’에 연결할 미디어를 먼저 적용해 주세요.`);
      continue;
    }
    if (assigned) {
      confirmed.add(source!);
      add(profile.slots.find((slot) => slot.id === assigned), reference);
      continue;
    }
    const role = reference.role;
    const exact = role && profile.slots.find(
      (slot) =>
        slot.type === reference.asset?.type && slot.roles?.includes(role) &&
        (role === "start" || role === "end" || media[slot.id].length < slot.max ||
          media[slot.id].some((asset) => asset.url === reference.asset?.url)),
    );
    if ((role === "start" || role === "end") || (exact && role !== "context"))
      add(exact || undefined, reference);
    else automatic.push(reference);
  }
  if (Object.keys(assignments).some((key) => !confirmed.has(key)))
    throw new MediaInputError("참조 목록이 변경됐습니다. 입력 슬롯을 다시 확인해 주세요.");
  for (const reference of automatic) {
    const candidates = profile.slots.filter(
      (slot) =>
        slot.type === reference.asset?.type &&
        !slot.roles?.includes("end") &&
        (media[slot.id].length < slot.max ||
          media[slot.id].some((asset) => asset.url === reference.asset?.url)),
    );
    const slot =
      candidates.find((slot) => media[slot.id].some((asset) => asset.url === reference.asset?.url)) ??
      candidates.find((slot) => media[slot.id].length < (slot.min ?? 0)) ??
      candidates.find((slot) => !slot.roles?.length || slot.roles.includes("context")) ??
      candidates[0];
    add(slot, reference);
  }
  for (const slot of profile.slots) {
    if (media[slot.id].length < (slot.min ?? 0))
      throw new MediaInputError(`‘${slot.label}’에 필요한 참조를 첨부해 주세요.`);
  }
  if (profile.requiresMedia && !Object.values(media).some((assets) => assets.length))
    throw new MediaInputError("이 작업에는 미디어 참조가 필요합니다.");
  if (profile.operation === "video") {
    const hasStart = profile.slots.some((slot) => slot.roles?.includes("start") && media[slot.id].length > 0);
    const error = soulVideoReferenceError(input.references, Object.values(media).flat(), hasStart);
    if (error) throw new MediaInputError(error);
  }
  return { options: Object.fromEntries(options), media };
}
