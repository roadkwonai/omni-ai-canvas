"use client";

import { useRef, useState } from "react";
import { BookOpen, ExternalLink, MousePointer2, X } from "lucide-react";
import GuideDocument from "./GuideDocument";
import "./guide.css";

export default function UserGuide({ onInspect }: { onInspect: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="guide-open"
        aria-label="사용 가이드"
        title="작품 제작 순서, 모델 선택과 서비스 구조를 확인합니다."
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <BookOpen size={17} />
        <span>사용 가이드</span>
      </button>
      <dialog
        ref={dialog}
        className="guide-dialog"
        aria-labelledby="guide-title"
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="guide-shell">
          <header className="guide-header">
            <div>
              <h2 id="guide-title">Omni AI Canvas 사용 가이드</h2>
              <p>아이디어에서 첫 장면을 만드는 방법</p>
            </div>
            <button
              type="button"
              className="guide-close"
              aria-label="가이드 닫기"
              title="가이드를 닫고 작업실로 돌아갑니다."
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </button>
          </header>
          <div className="guide-scroll">{open && <GuideDocument />}</div>
          <footer className="guide-footer">
            <button
              type="button"
              title="화면의 기능을 눌러 사용법을 확인하는 모드입니다."
              onClick={() => {
                dialog.current?.close();
                onInspect();
              }}
            >
              <MousePointer2 size={15} /> 화면에서 기능 설명 보기
            </button>
            <a
              href="/guide"
              target="_blank"
              rel="noreferrer"
              title="전체 가이드 문서를 새 창에 엽니다."
            >
              문서로 열기 <ExternalLink size={14} />
            </a>
          </footer>
        </div>
      </dialog>
    </>
  );
}
