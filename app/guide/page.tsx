import type { Metadata } from "next";
import Link from "next/link";
import { publicSite } from "../../lib/site";
import { Mascot } from "../../components/Brand";
import GuideDocument from "../../components/GuideDocument";
import "../../components/guide.css";
export const metadata: Metadata = {
  title: "사용 가이드 · Omni AI Canvas",
  description: "제작 형식 선택, 캔버스 작업, 이미지·영상 연출과 음향, 타임라인까지 기능별 사용 방법을 확인합니다.",
};
export default function GuidePage() {
  return (
    <main className="guide-page">
      <header>
        <nav className="guide-page-nav" aria-label="제작실과 소개">
          <Link href="/">서비스 소개</Link>
          {!publicSite && <Link href="/studio">제작실로 돌아가기</Link>}
        </nav>
        <div className="guide-page-title">
          <div><h1>Omni AI Canvas 사용 가이드</h1><p>대본부터 완성 영상까지 여러 AI 모델을 한 보드에서 쓰는 제작실</p></div>
          <Mascot pose="guide" size={112} />
        </div>
      </header>
      <GuideDocument />
    </main>
  );
}
