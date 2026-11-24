import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, Play } from "lucide-react";
import { asset, publicSite, siteOrigin } from "@/lib/site";
import { productionProfiles } from "@/lib/style-preset-core";
import emotion from "../public/landing/canvas-emotion.webp";
import timeline from "../public/landing/canvas-timeline.webp";
import frame from "../public/sample/frame.webp";
import portrait from "../public/sample/portrait.webp";
import { BrandMark, Mascot } from "@/components/Brand";
import { directorShowcase, directorTechniqueCount, ownMoves } from "@/lib/director-showcase";
import DirectorShowcase from "./director-showcase";
import IntroVideo from "./intro-video";
import LandingMenu from "./landing-menu";
import LandingStory from "./landing-story";
import LoopVideo from "./loop-video";
import Tagline from "./tagline";
import styles from "./landing.module.css";

const tagline = "대본부터 완성 영상까지 여러 AI 모델을 한 보드에서 쓰는 제작실";
const title = `Omni AI Canvas | ${tagline}`;
const description = "공모전 기획, 레퍼런스 분석, 대본, 이미지 연출, 영상과 음악, 타임라인 편집을 한 보드에서 하는 AI 영상 제작실.";
const formats = productionProfiles.length;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin ?? `http://127.0.0.1:${process.env.PORT || 5050}`),
  title,
  description,
  robots: { index: publicSite, follow: publicSite },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ko_KR",
    images: [{ url: asset("/brand/og.png"), width: 1200, height: 630, alt: "Omni AI Canvas 로고와 노드 카드를 잇는 문어 감독 오미" }],
  },
  twitter: { card: "summary_large_image", title, description, images: [asset("/brand/og.png")] },
};

const navigation = [
  { href: "#intro", label: "소개 영상" },
  { href: "#workflow", label: "제작 과정" },
  { href: "#direction", label: "연출" },
  { href: "#formats", label: "제작 형식" },
  { href: "#features", label: "도구" },
  { href: "#cost", label: "비용과 보관" },
  { href: asset("/guide"), label: "사용 가이드" },
];

const facts = [
  { href: "#formats", title: `제작 형식 ${formats}가지`, detail: "형식에 맞는 노드가 미리 놓여 있어요" },
  { href: "#cost", title: "API 키 없이도 시작 가능", detail: "구독 계정이나 내 컴퓨터로 여섯 작업을 해요" },
  { href: "#cost", title: "미디어와 인증 정보는 내 컴퓨터에 보관", detail: "보드와 작업 기록은 내 Neon DB에 저장돼요" },
];

const problems = [
  { title: "이 컷을 어느 대본으로 만들었는지 모르겠어요", answer: "연결선을 따라가면 대본과 인물이 나와요." },
  { title: "모델을 바꿀 때마다 파일을 다시 올려요", answer: "참조를 한 번 연결해 두면 모델만 바꾸면 돼요." },
  { title: "골라 둔 컷이 채팅에 묻혔어요", answer: "후보와 고른 결과가 노드에 남아요." },
];

const tools = [
  { title: "이미지 연출", detail: "감정과 조명, 촬영 각도를 바꿔 보고 원본과 나란히 비교하세요.", guide: "guide-motion-portrait", image: emotion, alt: "원본 키프레임과 기준 표정, 5×5 감정판" },
  { title: "타임라인과 자막", detail: "컷과 음향, 단어 자막을 다듬은 뒤 MP4와 SRT로 내보내세요.", guide: "guide-timeline", image: timeline, alt: "두 컷의 길이와 전환을 정하는 타임라인" },
  { title: "공모전 기획", detail: "요강에서 일정과 심사 기준을 뽑고 아이디어 후보를 비교하세요.", guide: "guide-contest" },
  { title: "레퍼런스 컷 분석", detail: "공개 YouTube 영상이나 파일에서 훅과 리듬을 찾아 내 프리셋으로 저장하세요.", guide: "guide-presets" },
  { title: "Blender·Tripo 3D", detail: "리깅된 GLB에 포즈와 카메라, 조명을 잡고 프리비즈를 렌더하세요.", guide: "guide-blender" },
];

const costs = [
  { title: "편집만 할 때는 생성하지 않아요", detail: "보드를 열어 보거나 고치기만 할 때는 모델에 생성을 요청하지 않아요." },
  { title: "요청하기 전에 계정과 모델을 보여 줘요", detail: "서비스에서 알려 주는 경우에는 예상 사용량도 조회할 수 있어요." },
  { title: "유료 이미지 API는 직접 켠 것만 써요", detail: "구독으로 쓰는 모델과 따로 결제하는 API를 작업실 설정에서 구분해요." },
  { title: "원본 파일은 내 컴퓨터에 있어요", detail: "미디어와 인증 파일은 제작실을 실행하는 컴퓨터에, 보드와 작업 기록은 직접 연결한 Neon DB에 저장돼요. 프로젝트 구조는 JSON으로 내보낼 수 있어요." },
];

const questions = [
  { question: "어떤 자료가 있어야 시작할 수 있나요?", answer: "아이디어 한 줄, 써 둔 대본, 공모전 요강, 레퍼런스 영상 중 하나만 있으면 돼요. 새 프로젝트를 만들 때 제작 형식이나 빈 캔버스를 고르세요." },
  { question: "갖고 있는 이미지나 영상도 쓸 수 있나요?", answer: "네. 직접 만든 파일이나 다른 도구에서 내려받은 파일을 노드에 첨부하면 돼요. 다음 작업의 참조로 쓰거나 타임라인에 넣으세요." },
  { question: "음악이나 3D 작업에는 무엇이 필요한가요?", answer: "내 컴퓨터에서 음악과 효과음을 만들려면 Road Music과 사용할 엔진이, 3D 장면을 렌더하려면 Blender가 필요해요. 갖고 있는 음원이나 GLB를 보드로 가져와도 돼요." },
  { question: "모바일에서도 쓸 수 있나요?", answer: "작은 화면에서 터치로 프로젝트와 노드를 편집할 수 있어요. 다만 접속은 제작실을 실행하는 컴퓨터의 로컬 환경을 기준으로 해요." },
];

function StudioLink({ compact = false }: { compact?: boolean }) {
  const size = compact ? ` ${styles.ctaCompact}` : "";
  return (
    <Link className={`studio-action ${styles.cta}${size}`} data-tone="primary" href={publicSite ? "/guide" : "/studio"} prefetch={false}>
      {publicSite ? "사용 가이드 보기" : "캔버스 열기"} <ArrowRight aria-hidden="true" size={compact ? 16 : 20} />
    </Link>
  );
}

export default function Page() {
  return (
    <div className={styles.landing} data-theme="landing" id="top">
      <a className={styles.skip} href="#main">본문 바로가기</a>
      <header className={`${styles.shell} ${styles.header}`}>
        <Link aria-current="page" className={styles.brand} href="/">
          <BrandMark className={styles.brandMark} />
          Omni AI Canvas
        </Link>
        <nav className={styles.nav} aria-label="페이지 안내">
          {navigation.map(({ href, label }) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <StudioLink compact />
        <LandingMenu links={navigation} />
      </header>

      <main id="main" tabIndex={-1}>
        <section className={`${styles.shell} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heading1} id="hero-title">대본 한 줄이<br />영상 한 편이 돼요</h1>
              <p className={styles.heroTagline}>{tagline.replace("여러 AI 모델을", "여러\u00a0AI\u00a0모델을")}</p>
              <p>숏폼, 드라마, 광고를 직접 만들 때 쓰세요. 내 컴퓨터에서 실행돼요.</p>
              <div className={styles.heroActions}>
                <StudioLink />
                <a href="#intro"><Play aria-hidden="true" size={17} /> 5분 소개 영상</a>
              </div>
            </div>
            <figure className={styles.heroVisual}>
              <LoopVideo src={asset("/sample/preview.mp4")} poster={asset("/sample/frame.webp")} label="마지막 상영 5초 무음 예제 영상" width={1280} height={720} />
              <ol className={styles.chain} aria-label="이 컷을 만드는 데 쓴 자료">
                <li><a href="#scene-board"><strong>대본</strong><span>01. 영사실의 밤</span><q>정우가 낡은 필름을 건다.</q></a></li>
                <li><a href="#scene-board"><strong>인물</strong><span>영사기사 한정우</span><Image src={portrait} alt="" unoptimized /></a></li>
                <li><a href="#scene-direction"><strong>키프레임</strong><span>영사창 너머</span><Image src={frame} alt="" unoptimized /></a></li>
                <li><a href="#scene-timeline" data-chosen><strong>고른 컷</strong><span>마지막 불빛 · 5초</span><em>타임라인에서 보기 <ArrowRight aria-hidden="true" size={15} /></em></a></li>
              </ol>
              <figcaption>〈마지막 상영〉 예제. 키프레임을 확대해 만든 5초 무음 영상</figcaption>
            </figure>
          </div>
          <div className={styles.heroIndex}>
            {facts.map(({ href, title: fact, detail }) => <a key={fact} href={href}><strong>{fact}</strong><span>{detail}</span></a>)}
          </div>
        </section>

        <section className={`${styles.section} ${styles.dark} ${styles.introSection}`} id="intro" aria-labelledby="intro-title">
          <div className={styles.content}>
            <div className={styles.sectionLead}>
              <h2 className={styles.heading2} id="intro-title">5분 만에<br />전체를 훑어보세요</h2>
              <p>〈마지막 상영〉의 한 장면을 따라 기획부터 편집까지 실제 화면으로 보여 줘요.</p>
            </div>
            <IntroVideo />
          </div>
        </section>

        <section className={`${styles.section} ${styles.light}`} id="why" aria-labelledby="why-title">
          <div className={styles.content}>
            <div className={styles.sectionLead}>
              <h2 className={styles.heading2} id="why-title">컷 하나 고칠 때<br />앱을 몇 개나 여세요?</h2>
              <p>어떤 모델을 써도 자료와 고른 결과가 한 보드에 남아요.</p>
            </div>
            <ul className={styles.problems}>
              {problems.map(({ title: problem, answer }) => <li key={problem}><h3>{problem}</h3><p>{answer}</p></li>)}
            </ul>
            <Image className={styles.boardMap} src={asset("/guide/omni-board.svg")} width={1280} height={712} unoptimized
              alt="글과 기획, 이미지, 영상, 대사 음성, 음악과 효과음, 3D 장면에 쓰는 도구가 보드 하나에 모이고 그 자료로 완성 영상과 다음 작품을 만드는 구조" />
          </div>
        </section>

        <section className={`${styles.section} ${styles.dark}`} id="workflow" aria-labelledby="workflow-title">
          <div className={styles.content}>
            <div className={styles.sectionLead}>
              <h2 className={styles.heading2} id="workflow-title">한 장면을 이렇게 만들어요</h2>
              <p>〈마지막 상영〉 보드에서 자료를 연결하고 연출을 바꿔 본 다음, 고른 영상을 타임라인에 올려요.</p>
            </div>
            <LandingStory />
          </div>
        </section>

        <section className={`${styles.section} ${styles.light}`} id="direction" aria-labelledby="direction-title">
          <div className={styles.content}>
            <div className={styles.sectionLead}>
              <h2 className={styles.heading2} id="direction-title">어떻게 찍을지<br />예제를 보고 고르세요</h2>
              <p>디렉터 스튜디오에서 촬영 지시 {directorTechniqueCount}가지 중에 골라요. 고른 지시는 이미지와 영상을 요청할 때 함께 보내요.</p>
            </div>
            <DirectorShowcase groups={directorShowcase} ownMoves={ownMoves} />
          </div>
        </section>

        <Tagline />

        <section className={`${styles.section} ${styles.light}`} id="formats" aria-labelledby="formats-title">
          <div className={styles.content}>
            <div className={styles.sectionLead}>
              <h2 className={styles.heading2} id="formats-title">만들 작품을 고르면<br />보드가 알맞게 준비돼요</h2>
              <p>제작 형식마다 기본 노드와 추천 도구가 달라요. 씬 수는 직접 정하거나 자동으로 맡기고, 형식은 도중에도 바꿀 수 있어요.</p>
            </div>
            <ul className={styles.formats}>
              {productionProfiles.map(({ id, label, description: detail }) => (
                <li key={id}><h3>{label}</h3><p>{detail}</p></li>
              ))}
            </ul>
            <div className={styles.formatOptions}>
              <p><strong>무형식</strong> 빈 캔버스에 필요한 노드를 하나씩 올려요.</p>
              <p><strong>보드 프리셋</strong> 전에 쓰던 노드와 연결 구조를 불러와 시작해요.</p>
              <Link href="/guide#guide-formats">형식 설정 방법 <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.toolsSection}`} id="features" aria-labelledby="features-title">
          <div className={styles.content}>
            <div className={styles.sectionLead}>
              <h2 className={styles.heading2} id="features-title">작업하다 막히면<br />이 도구를 써 보세요</h2>
              <p>요강 읽기부터 편집본 내보내기까지, 먼저 볼 만한 도구 다섯 가지예요.</p>
            </div>
            <ul className={styles.tools}>
              {tools.map(({ title: tool, detail, guide, image, alt }) => (
                <li key={tool}>
                  {image && <Image src={image} alt={alt} unoptimized />}
                  <h3><Link href={`/guide#${guide}`}>{tool} <ArrowRight size={16} aria-hidden="true" /></Link></h3>
                  <p>{detail}</p>
                </li>
              ))}
            </ul>
            <p className={styles.moreTools}>감독 에이전트와 쓰는 대본, 참조를 넣어 만드는 AI 영상, 여러 화자의 대사 음성, 모션그래픽, 음악과 효과음도 같은 보드에서 만들어요. 보드와 자산을 다시 쓰거나 외부 에이전트를 연결할 수도 있어요.</p>
            <Link className={styles.guideLink} href="/guide"><BookOpen size={18} aria-hidden="true" /> 전체 사용 가이드 <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className={`${styles.section} ${styles.light}`} id="cost" aria-labelledby="cost-title">
          <div className={`${styles.content} ${styles.cost}`}>
            <picture>
              <source media="(max-width: 480px)" srcSet={asset("/guide/paths-by-task-narrow.svg")} width={320} height={546} />
              <Image src={asset("/guide/paths-by-task.svg")} width={680} height={506} unoptimized
                alt="작업별로 고를 수 있는 서비스와 도구 수. API 키 없이 쓰는 것은 이미지 4개, 글·기획 3개, 영상 3개, 대사 음성과 음악, 3D가 1개씩이고 API 키가 필요한 것은 대사 음성 4개, 이미지 3개, 3D 1개예요." />
            </picture>
            <div>
              <h2 className={styles.heading2} id="cost-title">비용이 언제 드는지<br />먼저 확인하세요</h2>
              <dl>{costs.map(({ title: cost, detail }) => <div key={cost}><dt>{cost}</dt><dd>{detail}</dd></div>)}</dl>
              <p className={styles.costNote}>API 키를 쓰지 않으려면 구독 계정을 연결하거나 도구를 설치해야 해요. <Link href="/guide#guide-models">모델과 요금 안내 <ArrowRight size={15} aria-hidden="true" /></Link></p>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.light} ${styles.faqSection}`} id="faq" aria-labelledby="faq-title">
          <div className={`${styles.content} ${styles.faq}`}>
            <h2 className={styles.heading2} id="faq-title">시작하기 전에</h2>
            <div className={styles.questions}>
              {questions.map(({ question, answer }) => (
                <details name="landing-faq" key={question}>
                  <summary>{question}<ChevronDown aria-hidden="true" size={20} /></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.closingBand} aria-labelledby="closing-title">
          <div className={`${styles.content} ${styles.closing}`}>
            <Mascot className={styles.closingMascot} pose="wave" size={160} />
            <div><h2 className={styles.heading2} id="closing-title">다음 작품의 첫 노드를 올려 보세요</h2><p>갖고 있는 대본이나 이미지로 시작하면 돼요.</p></div>
            <StudioLink />
          </div>
        </section>
      </main>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <a className={styles.brand} href="#top"><BrandMark className={styles.brandMark} />Omni AI Canvas</a>
        <Link href="/guide">사용 가이드 <ArrowRight aria-hidden="true" size={16} /></Link>
      </footer>
    </div>
  );
}
