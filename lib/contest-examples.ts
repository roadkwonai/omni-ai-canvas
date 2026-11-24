/** 공식 페이지에서 확인한 날짜가 있는 참고 요약. 최신 규정 확인에 실패한 경우 사용한다. */
export const contestExamples: Record<
  string,
  {
    kind: "page" | "directory";
    title: string;
    theme: string;
    specs: string;
    deadline: string;
    judging: string;
    deliverables: string;
    eligibility: string;
    verifiedOn: string;
    links: { url: string; title: string }[];
  }
> = {
  "https://adigong.soldaeng-guri.chatgpt.site/": {
    kind: "directory",
    title: "에디공 · AI 디자인 공모전 모음",
    theme:
      "AI 디자인·이미지·영상·음악 공모전 탐색. 개별 주최 공고를 선택해야 한다.",
    specs:
      "모음 사이트에 공통 출품 규격은 없다. AI 영화 후보인 SVAIFF KOREA 2026 공식 요강은 서사 영화 20분 이내, MP4 H.264 최대 10GB, 화면 또는 이야기 핵심 요소의 AI 활용 50% 이상을 명시한다.",
    deadline:
      "모음의 마감은 공고마다 다르다. SVAIFF KOREA 2026 접수는 2026-11-25 23:59:59 KST까지다. 2026-11-22 조회 당시 접수 기간이다.",
    judging:
      "SVAIFF KOREA는 완성작 75점과 창작 과정 25점으로 심사한다. 다른 공모전에는 각자의 기준이 적용된다.",
    deliverables:
      "SVAIFF KOREA는 영상과 포스터, 국·영문 제목·시놉시스·크레딧, 창작 설명과 타임코드가 있는 근거 장면 3개를 요구한다.",
    eligibility:
      "SVAIFF KOREA는 개인·팀 모두 가능하며 19세 미만은 보호자 동의가 필요하다. 사용 권리와 AI 사용 표시, 수상 시 결선 조건을 공식 요강에서 확인한다.",
    verifiedOn: "2026-11-22",
    links: [
      {
        title: "에디공 공고 탐색",
        url: "https://adigong.soldaeng-guri.chatgpt.site/",
      },
      {
        title: "SVAIFF KOREA 공식 출품요강",
        url: "https://korea.svaiff.com/guide",
      },
    ],
  },
  "https://vigloostudio.com/ko/contests/2026-short-drama-festival-2": {
    kind: "page",
    title: "2026 비글루 숏드라마 페스티벌 2",
    theme:
      "후속 시리즈로 발전할 수 있는 세로형 숏드라마 에피소드와 1~5화 이야기.",
    specs:
      "비글루 스튜디오 사용 필수, 화면 요소는 모두 AI 생성. 완성 영상 2분 30초~3분, 정확히 9:16, 짧은 변 480~1080px, 300MB 이하 MP4/MOV H.264, 24·30·60fps.",
    deadline: "2026-12-07 15:00 KST 접수 마감. 2026-11-22 조회 당시 접수 중.",
    judging:
      "내부 심사에서 발상·이야기 30, 초반 흡인력 20, 감정적 여운 15, 연출 완성도 15, 시리즈성 20점. 본선 최종 순위는 심사 60%, 시청자 투표 20%, 시청 시간 20%다.",
    deliverables:
      "영상 1편, 출품자 계정의 인물 1개 이상과 생성 영상 1개 이상이 포함된 비글루 프로젝트, 1~5화 영문 시놉시스 PDF 20MB 이하, 영문 제목 포스터 10MB 이하, 영문 SRT 1MB 이하, 지정 해시태그와 계정 태그가 있는 공개 SNS 게시물 URL.",
    eligibility:
      "비글루 계정이 있는 성인 개인 또는 팀 대표. 제재 대상 지역 등 제외 규정이 있으며 유료 구독은 필수 아님. 모든 소재의 권리와 필요한 동의가 필요하고 실제 아동 및 유명인·공인 등의 묘사 제한이 있다. 제출작은 통상 수정·철회할 수 없다.",
    verifiedOn: "2026-11-22",
    links: [
      {
        title: "비글루 공모전",
        url: "https://vigloostudio.com/ko/contests/2026-short-drama-festival-2",
      },
      {
        title: "비글루 공식 참가 규칙",
        url: "https://vigloostudio.com/ko/contests/2026-short-drama-festival-2/rules",
      },
    ],
  },
  "https://higgsfield.ai/ko/contests/talent-contest": {
    kind: "page",
    title: "Higgsfield Talent Contest",
    theme: "자유 주제와 장르의 독립 AI 단편 영화.",
    specs:
      "작품 본편 3~7분, MP4/MOV 최대 4K, 화면비 자유, 영어 자막 또는 영어 음성. 전용 공모전 프로젝트에서 AI 이미지·영상을 만들고 자동 워터마크와 팩샷을 보존한다. 음악·음성·대사·립싱크는 AI 생성이어야 한다.",
    deadline:
      "2026-11-26 19:00 UTC, 한국시간 2026-11-27 04:00 마감. 2026-11-22 조회 당시 제작·접수 기간이다.",
    judging:
      "규정 적합성 심사 후 공개 프로젝트의 플랫폼 참여도 상위 최대 25편과 제작팀 선정작을 숏리스트로 구성한다. 심사위원 상과 별도 관객 투표상이 있다. 심사위원은 연출·이야기, 영상 품질, 미술, 사운드, 편집, 독창성을 같은 비중으로 평가한다. YouTube 조회 수는 심사 점수가 아니다.",
    deliverables:
      "공모전 프로젝트의 최종 영화와 워터마크·팩샷이 유지된 공개 YouTube 영상 링크. 팀은 명단과 구성원 동의가 필요하다. 제출 프로젝트와 프롬프트·생성 이력·소스는 마감 시 공개된다.",
    eligibility:
      "Higgsfield 정상 계정의 18세 이상이면서 거주지 법정 성년인 개인 또는 최대 4인 팀. 무료·유료 계정 모두 가능하며 제재·법적 제한이 있다. 외부 생성 영상·이미지는 프로젝트에 업로드해 규정상 생성형 편집을 거친 결과만 사용하고 출처와 권리를 보존한다. 제출물의 홍보에는 영구적·철회 불가·비독점 이용 허락이 적용되며 제작 기록은 마감 후 24개월 보관한다.",
    verifiedOn: "2026-11-22",
    links: [
      {
        title: "Higgsfield Talent Contest",
        url: "https://higgsfield.ai/ko/contests/talent-contest",
      },
      {
        title: "Higgsfield 공식 규정",
        url: "https://higgsfield.ai/contests/talent-contest?tab=rules",
      },
    ],
  },
};
