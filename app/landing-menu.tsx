"use client";

import { useRef } from "react";
import { Menu, X } from "lucide-react";
import styles from "./landing.module.css";

export default function LandingMenu({ links }: { links: readonly { href: string; label: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className={styles.menu}>
      <button type="button" className={styles.menuButton} aria-haspopup="dialog" aria-label="메뉴 열기"
        onClick={() => dialog.current?.showModal()}>
        <Menu size={20} aria-hidden="true" />
      </button>
      <dialog ref={dialog} className={styles.menuPanel} aria-label="페이지 안내"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <button type="button" className={styles.menuButton} aria-label="메뉴 닫기" onClick={() => dialog.current?.close()}>
          <X size={20} aria-hidden="true" />
        </button>
        <nav>
          {links.map(({ href, label }) => <a key={href} href={href} onClick={() => dialog.current?.close()}>{label}</a>)}
        </nav>
      </dialog>
    </div>
  );
}
