import type { ImageEditSettings } from "./image-edit";

type Emotion = Extract<ImageEditSettings, { kind: "emotion" }>;
type Pose = {
  label: string;
  smile?: number;
  frown?: number;
  surprise?: number;
  sadness?: number;
  cheekRaise?: number;
  mouth?: number;
  brow?: number;
  eyelid?: number;
};

const poses: readonly (readonly Pose[])[] = [
  [
    { label: "기쁜 즐거움", smile: 1, cheekRaise: 0.65, eyelid: -0.25 },
    { label: "갑작스러운 당황", surprise: 0.38, mouth: 0.8, brow: 0.7, sadness: 0.45, eyelid: 0.8 },
    { label: "놀란 가슴", frown: 0.48, mouth: 0.5, brow: 0.25, sadness: 0.93, eyelid: 0.5 },
    { label: "심장이 멎는 듯", surprise: 0.85, mouth: 1, brow: 1, sadness: 0.36, eyelid: 1 },
    { label: "격렬한 분노", frown: 0.92, brow: -1, eyelid: -0.64 },
  ],
  [
    { label: "옅은 미소", smile: 0.62, cheekRaise: 0.3, brow: 0.13, eyelid: -0.1 },
    { label: "믿기 어려움", surprise: 0.24, mouth: 0.65, brow: 0.42, sadness: 0.7, eyelid: 0.52 },
    { label: "놀라 물러섬", surprise: 0.6, frown: 0.34, mouth: 0.87, brow: 0.57, sadness: 0.64, eyelid: 0.73 },
    { label: "슬픔을 참음", frown: 0.68, sadness: 0.83, eyelid: -0.3 },
    { label: "억누른 노여움", frown: 0.72, brow: -0.76, eyelid: -0.43 },
  ],
  [
    { label: "애정 어린 응시", smile: 0.47, cheekRaise: 0.38, eyelid: -0.26 },
    { label: "말을 삼킴", frown: 0.27, mouth: 0.31, sadness: 0.58, eyelid: 0.21 },
    { label: "담담한 태연" },
    { label: "경계하는 응시", frown: 0.34, brow: -0.33, sadness: 0.27, eyelid: 0.19 },
    { label: "서릿발 같은 표정", frown: 0.5, brow: -0.88, eyelid: -0.18 },
  ],
  [
    { label: "가득한 애정", smile: 0.82, cheekRaise: 0.51, eyelid: -0.41 },
    { label: "어쩔 수 없음", smile: 0.36, cheekRaise: 0.18, sadness: 0.22, eyelid: -0.34 },
    { label: "정경에 젖은 슬픔", frown: 0.77, sadness: 0.88, eyelid: -0.51 },
    { label: "속으로 삭이는 아픔", frown: 0.59, brow: -0.21, sadness: 0.77, eyelid: -0.47 },
    { label: "차가운 무심", frown: 0.28, brow: -0.17, eyelid: -0.69 },
  ],
  [
    { label: "쌓인 답답함", frown: 0.61, brow: -0.62, sadness: 0.3, eyelid: -0.27 },
    { label: "말없이 흐르는 눈물", frown: 0.88, sadness: 1, eyelid: -0.54 },
    { label: "지쳐 넋을 잃음", frown: 0.26, sadness: 0.37, eyelid: -0.93, mouth: 0.12 },
    { label: "애도의 억눌림", frown: 0.71, brow: -0.18, sadness: 0.95, eyelid: -0.43 },
    { label: "거리감 있는 냉담", frown: 0.33, brow: -0.26, eyelid: -0.45 },
  ],
];

export const directionEmotionNames = poses.flatMap((row) => row.map((pose) => pose.label));

function gridPosition(axis: number) {
  return (1 - axis) * 2;
}

export function directionEmotionIndex(warmth: number, arousal: number) {
  return Math.round(gridPosition(arousal)) * 5 + Math.round(gridPosition(warmth));
}

export function directionFaceWeights({ warmth, arousal, intensity, channels }: Emotion) {
  const x = gridPosition(warmth);
  const y = gridPosition(arousal);
  const col = Math.min(3, Math.floor(x));
  const row = Math.min(3, Math.floor(y));
  function value(key: Exclude<keyof Pose, "label">) {
    const mix = (first: number, second: number, fraction: number) => first + (second - first) * fraction;
    const upper = mix(poses[row][col][key] ?? 0, poses[row][col + 1][key] ?? 0, x - col);
    const lower = mix(poses[row + 1][col][key] ?? 0, poses[row + 1][col + 1][key] ?? 0, x - col);
    return mix(upper, lower, y - row);
  }
  const weight = (amount: number) => Math.max(0, Math.min(1, amount)) * intensity;
  const leftBrow = value("brow") + (channels?.browLeft ?? 0);
  const rightBrow = value("brow") + (channels?.browRight ?? 0);
  const leftLid = value("eyelid") + (channels?.eyelidLeft ?? 0);
  const rightLid = value("eyelid") + (channels?.eyelidRight ?? 0);
  return {
    smile: weight(value("smile")),
    frown: weight(value("frown")),
    sadness: weight(value("sadness")),
    surprise: weight(value("surprise")),
    cheekRaise: weight(value("cheekRaise")),
    mouth: weight(value("mouth") + (channels?.mouth ?? 0)),
    browLeft: weight(leftBrow),
    browRight: weight(rightBrow),
    browLowerLeft: weight(-leftBrow),
    browLowerRight: weight(-rightBrow),
    eyelidLeft: weight(-leftLid),
    eyelidRight: weight(-rightLid),
    eyelidOpenLeft: weight(leftLid),
    eyelidOpenRight: weight(rightLid),
  };
}
