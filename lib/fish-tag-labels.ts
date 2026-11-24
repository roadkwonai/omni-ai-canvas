export const knownFishTags: Record<string, string> = {
  male: "남성", female: "여성", narration: "내레이션", storytelling: "이야기",
  "character-voice": "캐릭터 목소리", audiobook: "오디오북", energetic: "활기찬",
  calm: "차분한", soft: "부드러운", deep: "깊은 저음", warm: "따뜻한",
  friendly: "친근한", professional: "전문적인", dramatic: "극적인",
  conversational: "대화체", asmr: "ASMR", anime: "애니메이션",
  entertainment: "엔터테인먼트", advertisement: "광고", "social-media": "소셜미디어",
  "middle-aged": "중년", old: "노년", young: "젊은", low: "낮은 음역",
  medium: "중간 음역", high: "높은 음역",
  女性: "여성", 女友感: "여자친구 같은", 朗読: "낭독", 茉莉: "자스민",
  舒緩: "편안한", 深い音読: "깊은 낭독", 野獣先輩: "야수 선배", 御女: "성숙한 여성",
  child: "어린이", teenage: "청소년",
};

export function fishTagLabel(tag: string, labels: Record<string, string>): string {
  for (const [source, key] of [[labels, tag], [knownFishTags, tag], [knownFishTags, tag.toLowerCase()]] as const) {
    if (Object.hasOwn(source, key)) return source[key];
  }
  return tag;
}
