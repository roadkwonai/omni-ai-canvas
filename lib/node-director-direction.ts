import { directorPresets, type DirectorPreset } from "./node-director-presets";

export type NodeDirection = {
  camera: string;
  lens: string;
  focal: string;
  aperture: string;
  framing: string;
  angle: string;
  composition: string;
  gaze: string;
  viewpoint: string;
  movement: string;
  tempo: string;
  palette: string;
  light: string;
  art: string;
  performance: string;
  narrative: string;
  genre: string;
  rhythm: string;
};

export const directorFields: { key: keyof NodeDirection; label: string }[] = [
  { key: "camera", label: "카메라" },
  { key: "lens", label: "렌즈" },
  { key: "focal", label: "초점 거리" },
  { key: "aperture", label: "조리개" },
  { key: "framing", label: "구도" },
  { key: "angle", label: "카메라 앵글" },
  { key: "composition", label: "화면 배치" },
  { key: "gaze", label: "시선" },
  { key: "viewpoint", label: "창의 시점" },
  { key: "movement", label: "카메라 이동" },
  { key: "tempo", label: "시간 표현" },
  { key: "palette", label: "색감" },
  { key: "light", label: "조명" },
  { key: "art", label: "스타일링과 미술" },
  { key: "performance", label: "행동과 감정" },
  { key: "narrative", label: "장면 전개" },
  { key: "genre", label: "장르" },
  { key: "rhythm", label: "편집 리듬" },
];

const heading = "촬영 및 시각 연출";
export const directorMotionKeys: readonly (keyof NodeDirection)[] = ["movement", "tempo", "rhythm"];

export const emptyNodeDirection: NodeDirection = {
  camera: "", lens: "", focal: "", aperture: "", framing: "", angle: "",
  composition: "", gaze: "", viewpoint: "", movement: "", tempo: "", palette: "", light: "", art: "", performance: "", narrative: "", genre: "", rhythm: "",
};

export function readNodeDirection(value: string): NodeDirection {
  const direction = { ...emptyNodeDirection };
  const lines = value.split("\n");
  if (lines[0] !== heading) return direction;
  for (const { key, label } of directorFields) {
    const line = lines.find((item) => item.startsWith(`${label}: `));
    if (line) direction[key] = line.slice(label.length + 2);
  }
  return direction;
}

export function nodeDirectionText(direction: NodeDirection) {
  const lines = directorFields.flatMap(({ key, label }) => {
    const value = direction[key].replace(/\s+/g, " ").trim();
    return value ? [`${label}: ${value}`] : [];
  });
  return lines.length ? [heading, ...lines].join("\n") : "";
}

export const directorFocalRange = { min: 18, max: 135, preview: 35 };

// 예제를 확대하는 세로 기준점과, 해당 화각의 자리에 겹쳐 세부를 보여 주는 이미지다.
export const directorFocalOriginY = 0.44;
export const directorFocalLayers = [
  { mm: 48, file: "/director/focal-48.webp" },
  { mm: 115, file: "/director/focal-115.webp" },
];

export function readDirectorFocalLength(value: string) {
  const match = /^(\d{1,3})\s*mm$/i.exec(value.trim());
  if (!match) return null;
  const length = Number(match[1]);
  return length >= directorFocalRange.min && length <= directorFocalRange.max ? length : null;
}

export function directorFocalView(length: number) {
  return {
    cropRatio: directorFocalRange.min / length,
    horizontalAngle: Math.round(2 * Math.atan(36 / (2 * length)) * 180 / Math.PI),
  };
}

// 저장값은 이름으로 두고 요청을 만들 때 구체적인 지시로 펼친다. 정지 이미지에는 움직임과 시간 지시를 보내지 않는다.
export function directorRequestText(note: string, operation: "image" | "video") {
  const lines = note.split("\n");
  if (lines[0] !== heading) return note;
  const expanded = lines.slice(1).flatMap((line) => {
    const field = directorFields.find(({ label }) => line.startsWith(`${label}: `));
    if (!field) return [line];
    if (operation === "image" && directorMotionKeys.includes(field.key)) return [];
    const presets: readonly DirectorPreset[] = field.key in directorPresets
      ? directorPresets[field.key as keyof typeof directorPresets] : [];
    const preset = presets.find(({ name }) => name === line.slice(field.label.length + 2));
    return [preset?.spec ? `${line} (${preset.en}) · ${preset.spec}` : line];
  });
  return expanded.length ? [heading, ...expanded].join("\n") : "";
}

export function directionWarnings({ viewpoint, movement, angle, focal, rhythm, camera, lens, aperture }: NodeDirection) {
  const warnings: string[] = [];
  if (viewpoint && ((movement && movement !== "고정") || angle))
    warnings.push(`창의 시점 "${viewpoint}"에는 카메라 위치가 정해져 있습니다. 카메라 앵글과 이동을 비우거나 고정으로 두세요.`);
  if (focal && (movement === "줌" || movement === "돌리 줌"))
    warnings.push(`${movement}은 초점 거리가 바뀌는 이동입니다. 초점 거리 ${focal}를 자동으로 두세요.`);
  if ((movement === "POV 워크" || movement === "셀피") && angle && angle !== (movement === "POV 워크" ? "시점(POV)" : "정면"))
    warnings.push(`${movement}에서는 인물이 카메라 위치를 정합니다. 카메라 앵글(${angle})을 비우세요.`);
  if (movement === "휩 팬" && rhythm === "느리고 안정적인")
    warnings.push("휩 팬은 매우 빠른 움직임입니다. 느리고 안정적인 편집 리듬과 함께 쓰면 지시가 엇갈립니다.");
  const length = readDirectorFocalLength(focal);
  if (length && ((lens === "망원 줌 렌즈" && length < 50) || (lens === "초광각·어안 렌즈" && length > 24)))
    warnings.push(`${lens}와 초점 거리 ${focal}의 화각이 서로 다릅니다. 초점 거리를 자동으로 두세요.`);
  if (camera === "어깨 장착 다큐멘터리" && movement && !["핸드헬드", "트래킹", "POV 워크"].includes(movement))
    warnings.push(`어깨 장착 다큐멘터리는 사람이 메고 따라가는 움직임이 특징입니다. ${movement} 대신 트래킹이나 핸드헬드가 어울립니다.`);
  if (camera === "CCTV" && movement && movement !== "고정")
    warnings.push(`CCTV는 고정된 시점입니다. 카메라 이동(${movement})을 비우거나 고정으로 두세요.`);
  if (aperture && ((camera === "대형 센서 시네마" && ["f/8", "f/11"].includes(aperture)) ||
    (["스마트폰", "CCTV"].includes(camera) && ["f/1.4", "f/2", "f/2.8"].includes(aperture))))
    warnings.push(`${camera}의 심도와 조리개 ${aperture}의 심도가 서로 다릅니다. 하나를 비우세요.`);
  return warnings;
}
