import type { Metadata } from "next";
import "./globals.css";
import "./studio-actions.css";

export const metadata: Metadata = {
  title: "Omni AI Canvas",
  description: "대본부터 완성 영상까지 여러 AI 모델을 한 보드에서 쓰는 제작실",
};

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
