import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Mascot } from "@/components/Brand";
import styles from "./landing.module.css";

export default function NotFound() {
  return (
    <main className={styles.landing} data-theme="landing">
      <div className={`${styles.content} ${styles.notFound}`}>
        <Mascot pose="lost" size={200} />
        <h1 className={styles.heading2}>페이지를 찾을 수 없어요</h1>
        <p>주소를 확인하거나 Omni AI Canvas 첫 화면으로 돌아가세요.</p>
        <Link className={`studio-action ${styles.cta}`} href="/" data-tone="primary">첫 화면으로 <ArrowRight aria-hidden="true" size={20} /></Link>
      </div>
    </main>
  );
}
