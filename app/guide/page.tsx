import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { publicSite } from "../../lib/site";
import { BrandMark, Mascot } from "../../components/Brand";
import GuideDocument from "../../components/GuideDocument";
import "../../components/guide.css";
export const metadata: Metadata = {
  title: "사용 가이드 · Omni AI Canvas",
  description: "제작 형식 선택, 캔버스 작업, 이미지·영상 연출과 음향, 타임라인까지 기능별 사용 방법을 확인합니다.",
};
export default function GuidePage() {
  return (
    <div className="guide-page">
      <a className="guide-skip" href="#guide-main">본문 바로가기</a>
      <header className="guide-bar">
        <Link className="guide-bar-brand" href="/"><BrandMark className="guide-bar-mark" size={28} /> Omni AI Canvas</Link>
        <nav aria-label="제작실과 소개">
          <Link className="studio-action" data-tone="quiet" href="/">서비스 소개</Link>
          {!publicSite && <Link className="studio-action" data-tone="primary" href="/studio" prefetch={false}>제작실 열기 <ArrowRight size={16} aria-hidden="true" /></Link>}
        </nav>
      </header>
      <main id="guide-main" tabIndex={-1}>
        <div className="guide-hero">
          <div>
            <h1>사용 가이드</h1>
            <p>예제를 여는 것부터 완성 영상을 꺼내는 것까지, 하고 싶은 일로 찾아보세요.</p>
            <Link className="studio-action" href="/#intro"><Play size={16} aria-hidden="true" /> 5분 소개 영상</Link>
          </div>
          <Mascot pose="guide" size={128} />
        </div>
        <GuideDocument />
      </main>
    </div>
  );
}
