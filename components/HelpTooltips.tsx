"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tip = {
  text: string;
  x: number;
  y: number;
  below: boolean;
  host: HTMLElement;
};
const targetSelector =
  "[data-help], [title]:not(svg):not(path), button[aria-label], a[aria-label], [role=tab][aria-label]";
const tooltipId = "scene-room-control-help";

export default function HelpTooltips({
  inspect,
  inspectScope,
  onExit,
}: {
  inspect: boolean;
  inspectScope: string | null;
  onExit: () => void;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const exit = useRef(onExit);
  useEffect(() => {
    exit.current = onExit;
  }, [onExit]);
  useEffect(() => {
    let active: HTMLElement | null = null;
    let nativeTitle: string | null = null;
    function reset() {
      if (active) {
        const ids = (active.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .filter((id) => id && id !== tooltipId);
        if (ids.length) active.setAttribute("aria-describedby", ids.join(" "));
        else active.removeAttribute("aria-describedby");
        if (nativeTitle && !active.hasAttribute("title"))
          active.setAttribute("title", nativeTitle);
      }
      active = null;
      nativeTitle = null;
      setTip(null);
    }
    function find(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>(
        targetSelector + `,[aria-describedby~="${tooltipId}"]`,
      );
    }
    function show(el: HTMLElement | null) {
      if (!el || el.closest(".help-inspector, .help-inspector-inline, .control-tooltip")) {
        reset();
        return;
      }
      if (el === active) return;
      reset();
      const text =
        el.dataset.help ||
        el.getAttribute("title") ||
        el.getAttribute("aria-label");
      if (!text) return;
      active = el;
      nativeTitle = el.getAttribute("title");
      if (nativeTitle) el.removeAttribute("title");
      const ids = [el.getAttribute("aria-describedby"), tooltipId].filter(
        Boolean,
      );
      el.setAttribute("aria-describedby", ids.join(" "));
      const r = el.getBoundingClientRect(),
        width = Math.min(window.innerWidth - 24, 290);
      const x = Math.min(
        Math.max(12, r.left + (r.width - width) / 2),
        window.innerWidth - width - 12,
      );
      const below = r.top < 90;
      setTip({
        text,
        x,
        y: below ? r.bottom + 6 : r.top - 6,
        below,
        host: el.closest("dialog[open]") || document.body,
      });
    }
    function over(e: PointerEvent) {
      if (e.pointerType !== "touch") show(find(e.target));
    }
    function out(e: PointerEvent | FocusEvent) {
      if (
        active &&
        (!(e.relatedTarget instanceof Node) ||
          !active.contains(e.relatedTarget))
      )
        reset();
    }
    function focus(e: FocusEvent) {
      show(find(e.target));
    }
    function explain(e: MouseEvent | PointerEvent) {
      if (
        !inspect ||
        !(e.target instanceof Element) ||
        e.target.closest(".help-inspector, .help-inspector-inline") ||
        (inspectScope && !e.target.closest(inspectScope))
      )
        return;
      const el = find(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      show(el);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        reset();
        if (inspect) {
          e.preventDefault();
          exit.current();
        }
      }
    }
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", out);
    document.addEventListener("pointerdown", explain, true);
    document.addEventListener("click", explain, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", reset);
    document.addEventListener("scroll", reset, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", out);
      document.removeEventListener("pointerdown", explain, true);
      document.removeEventListener("click", explain, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", reset);
      document.removeEventListener("scroll", reset, true);
      reset();
    };
  }, [inspect, inspectScope]);
  if (!tip && !inspect) return null;
  return createPortal(
    <>
      {tip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="control-tooltip"
          style={{
            left: tip.x,
            top: tip.y,
            transform: tip.below ? undefined : "translateY(-100%)",
          }}
        >
          {tip.text}
        </div>
      )}
      {inspect && !inspectScope && (
        <div className="help-inspector">
          <span>기능을 눌러 설명을 확인하세요.</span>
          <button onClick={onExit}>설명 모드 종료</button>
        </div>
      )}
    </>,
    tip?.host ?? document.body,
  );
}
