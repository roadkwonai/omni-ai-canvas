"use client";

import type { AttachmentRecord } from "../lib/attachments-types";
import type { MediaProfile, MediaSelection as SharedMediaSelection, MediaValue } from "../lib/media-model-types";
import type { RunInput } from "../lib/types";
import { isFrameOrMotion } from "../lib/media-request";
import "./media-model-options.css";

export type MediaSelection = SharedMediaSelection & {
  assignments: Record<string, string>;
};

type Props = {
  profiles: MediaProfile[];
  selection: MediaSelection;
  onChange: (selection: MediaSelection) => void;
  attachments: AttachmentRecord[];
  references: RunInput["references"];
  preferredAspect?: "16:9" | "9:16" | "1:1";
  video?: boolean;
};

export default function MediaModelOptions({
  profiles,
  selection,
  onChange,
  attachments,
  references,
  preferredAspect,
  video = false,
}: Props) {
  const profile = profiles.find((item) => item.mode === selection.mode);
  const sources = [
    ...references.flatMap((item) =>
      item.nodeId && (item.asset || video && isFrameOrMotion(item.role))
        ? [{
            id: `node:${item.nodeId}`,
            label: item.title || item.asset?.name || "연결된 노드",
            type: item.asset?.type,
            graph: true,
          }]
        : [],
    ),
    ...attachments.flatMap((item) =>
      item.asset && (item.kind === "image" || item.kind === "video")
        ? [{
            id: `attachment:${item.id}`,
            label: item.name,
            type: item.kind,
            graph: false,
          }]
        : [],
    ),
  ].filter((item, index, list) =>
    list.findIndex((source) => source.id === item.id) === index,
  );

  function updateOption(id: string, value: MediaValue | undefined) {
    const options = { ...selection.options };
    if (value === undefined) delete options[id];
    else options[id] = value;
    onChange({ ...selection, options });
  }

  function updateAssignment(id: string, slot: string) {
    const assignments = { ...selection.assignments };
    if (slot) assignments[id] = slot;
    else delete assignments[id];
    onChange({ ...selection, assignments });
  }

  return (
    <div className="request-preview media-model-options">
      <label className="field-label" htmlFor="media-mode">작업 방식</label>
      <select
        id="media-mode"
        title="선택한 모델에서 지원하는 작업 방식을 고릅니다."
        value={selection.mode}
        onChange={(event) => {
          const mode = event.target.value;
          const option = profiles.find((item) => item.mode === mode)?.options.find((item) =>
            /^(aspect(?:_?ratio)?|ratio)$/i.test(item.id) && preferredAspect && item.values?.includes(preferredAspect));
          onChange({ mode, options: option && preferredAspect ? { [option.id]: preferredAspect } : {}, assignments: {} });
        }}
      >
        <option value="">작업 방식을 선택해 주세요</option>
        {profiles.map((item) => (
          <option key={item.mode} value={item.mode}>{item.label}</option>
        ))}
      </select>
      {profile && (
        <>
          <div className="media-parameters">
          {profile.options.map((option) => {
            const value = selection.options[option.id];
            const id = `media-option-${option.id}`;
            return (
              <div key={option.id}>
                <label className="field-label" htmlFor={id}>
                  {option.label}{option.required ? " · 필수" : ""}
                </label>
                {option.values?.length ? (
                  <select
                    id={id}
                    title={`${option.label}을 선택합니다.`}
                    value={value === undefined ? "" : String(value)}
                    onChange={(event) => {
                      const selected = option.values?.find(
                        (item) => String(item) === event.target.value,
                      );
                      updateOption(option.id, selected);
                    }}
                  >
                    <option value="">
                      {option.default !== undefined
                        ? `기본값 · ${String(option.default)}`
                        : "기본값"}
                    </option>
                    {option.values.map((item) => (
                      <option key={String(item)} value={String(item)}>
                        {String(item)}
                      </option>
                    ))}
                  </select>
                ) : option.type === "boolean" ? (
                  <select
                    id={id}
                    title={`${option.label} 사용 여부를 선택합니다.`}
                    value={value === undefined ? "" : String(value)}
                    onChange={(event) =>
                      updateOption(option.id, event.target.value === ""
                        ? undefined
                        : event.target.value === "true")
                    }
                  >
                    <option value="">
                      {option.default !== undefined
                        ? `기본값 · ${option.default ? "사용" : "사용 안 함"}`
                        : "기본값"}
                    </option>
                    <option value="true">사용</option>
                    <option value="false">사용 안 함</option>
                  </select>
                ) : (
                  <input
                    id={id}
                    title={`${option.label}을 입력합니다.`}
                    type={option.type === "string" ? "text" : "number"}
                    min={option.min}
                    max={option.max}
                    step={option.type === "integer" ? 1 : option.type === "number" ? "any" : undefined}
                    placeholder={option.default === undefined ? "기본값" : String(option.default)}
                    value={value === undefined ? "" : String(value)}
                    onChange={(event) =>
                      updateOption(option.id, event.target.value === ""
                        ? undefined
                        : option.type === "string"
                          ? event.target.value
                          : Number(event.target.value))
                    }
                  />
                )}
              </div>
            );
          })}
          </div>
          {(profile.slots.length > 0 || sources.length > 0) && (
            <details className="media-reference-options">
              <summary>참조 입력 역할</summary>
              <p>
                {profile.slots.length
                  ? "연결한 노드와 첨부 파일은 역할에 맞춰 쓰입니다. 자료마다 입력 위치를 직접 정할 수도 있습니다."
                  : video ? "연결된 노드의 본문을 사용합니다. 이미지나 영상을 쓰려면 참조를 받는 작업 방식을 선택하세요."
                    : "이 작업 방식에는 이미지·영상 참조를 쓸 수 없습니다. 노드는 본문만 전달하니 첨부 파일은 빼 주세요."}
              </p>
              {profile.slots.length > 0 && (
                <ul>
                  {profile.slots.map((slot) => (
                    <li key={slot.id}>
                      {slot.label} · {slot.type === "image" ? "이미지" : slot.type === "audio" ? "음향" : "영상"}{" "}
                      {slot.min ? `최소 ${slot.min}개 · ` : ""}최대 {slot.max}개
                    </li>
                  ))}
                </ul>
              )}
              {sources.length === 0 && (
                <p>이미지 또는 영상을 연결하거나 아래에서 첨부해 주세요.</p>
              )}
              {sources.filter((source) => !video || profile.slots.length || !source.graph).map((source) => {
                const available = profile.slots.filter((slot) => slot.type === source.type);
                return (
                  <div key={source.id}>
                    <label className="field-label" htmlFor={`media-source-${source.id}`}>
                      {source.label}{!source.type ? " · 파일 없음" : ""}
                    </label>
                    <select
                      id={`media-source-${source.id}`}
                      title={`${source.label}의 역할을 선택합니다.`}
                      value={selection.assignments[source.id] || ""}
                      onChange={(event) => updateAssignment(source.id, event.target.value)}
                    >
                      <option value="">자동으로 배정</option>
                      {available.map((slot) => (
                        <option key={slot.id} value={slot.id}>{slot.label}</option>
                      ))}
                      {source.graph && <option value="$text">본문만 전달</option>}
                    </select>
                    {available.length === 0 && !source.graph && (
                      <p role="status">이 작업 방식에는 이 형식의 파일을 첨부할 수 없습니다.</p>
                    )}
                  </div>
                );
              })}
            </details>
          )}
        </>
      )}
    </div>
  );
}
