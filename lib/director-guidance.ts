import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// 설치한 버전의 촬영 예시 세 줄만 프롬프트에 포함한다.
function officialExamples(): string {
  try {
    const source = readFileSync(
      path.join(
        process.cwd(),
        ".agents/skills/higgsfield-generate/references/prompt-engineering.md",
      ),
      "utf8",
    );
    if (
      createHash("sha256").update(source).digest("hex") !==
      "26e4d828d985ae21a450c5eb5f824ec2db70a2a2aa4feef8fc135f784cc41c44"
    )
      return "";
    return source
      .split("\n")
      .filter((line) =>
        /^- \*\*(Camera|Lighting|Style\/medium)\*\*:/.test(line),
      )
      .join("\n");
  } catch {
    return "";
  }
}

const examples = officialExamples();
/** 명시적으로 선택한 연출 지침과 별개인 입력 해석 계약이다. */
export function productionInputContract(): string {
  return "모델이 실제로 지원하는 화면비와 참조 입력만 사용한다. 생성 입력과 제작 확인용 자료를 구분하고 제공되지 않은 사실과 비용을 단정하지 않는다.";
}
/** 고정된 제작 지침만 제공하며 사용자 입력이나 외부 파일을 실행 지침으로 읽지 않는다. */
export function higgsfieldDirectingGuide(): string {
  return `Higgsfield 공식 생성 스킬의 프롬프트 작성 지침 (고정 버전 0.14.0):
${examples}
- 피사체, 장소와 시각 스타일을 구체적으로 쓰고 필요한 카메라 각도·움직임과 조명을 명시한다. 불필요한 장문은 줄인다.
- 이미지 편집은 참조 이미지를 다시 묘사하기보다 바꿀 부분을 설명한다.
- 시작 프레임이 있는 영상은 정지 화면을 반복해 묘사하기보다 피사체와 카메라의 움직임을 설명한다.
- 부정 프롬프트를 지원하는지 알 수 없으면 원하는 상태를 긍정적으로 표현한다. 화면비와 참조 입력은 선택한 모델의 실제 지원 범위를 따른다.

Omni AI Canvas의 드라마 연출 지침 (Zephyr와 Hell Grind 사례를 바탕으로 한 프로젝트 기준):
- 샷마다 인물·장소·소품의 참조 역할과 상태, 시선·위치·카메라 축, 시작·핵심 행동·종료를 구체화한다.
- 생성에 전달할 참조와 공간 계획에만 쓰는 가이드를 구분하고, 필요한 상태의 참조만 선택한다. 참조 번호와 역할이 어긋나지 않게 확인한다.
- 이전 샷과 이어질 때 동작·방향·소품 상태를 맞추고, 필요하면 동작 앵커와 테이크별 차이를 기록한다. 제공자의 모델·입력 지원을 확인하지 않은 기능은 확정하지 않는다.`;
}
