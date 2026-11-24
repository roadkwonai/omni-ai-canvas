"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { FileQuestion, Film, ImageIcon, Minus, Music, Pause, Play, Plus, SkipBack, SquareDashed, TriangleAlert } from "lucide-react";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu";
import { Slider, SliderControl, SliderThumb, SliderTrack } from "@ui-sdk/react/slider";
import { audioGainAt, audioSource, clipRanges, clipSource, layersAt, moveAudio, moveClip, rulerSeconds, timecode, trimAudio, trimClip, type TimelineIssue } from "../lib/timeline-layout";
import { timelineKey } from "../lib/timeline-edit";
import { TIMELINE_MAX_AUDIO, TIMELINE_MAX_CLIPS, type TimelineAudio, type TimelineSpec } from "../lib/timeline-spec";
import type { CanvasNode } from "../lib/types";
import { thumbKey, type useTimelineMedia } from "./useTimelineMedia";

export type TimelinePanel = "clip" | "audio" | "words" | "lens";
type Drag = { kind: "clip-move" | "clip-trim" | "audio-move" | "audio-trim"; index: number; x: number; framesPerPixel: number; active: boolean };
type Grab = (kind: Drag["kind"], index: number) => (event: React.PointerEvent<HTMLElement>) => void;

const zooms = [1, 2, 4, 8];
const sourceNotes = { missing: "보드에 없는 노드입니다.", unusable: "화면으로 쓸 파일이 없습니다." };
const ratios = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };

function syncMedia(media: HTMLMediaElement | null, frame: number, volume: number, running: boolean) {
  if (!media) return;
  // 프레임의 시작 시각으로 찾으면 앞 프레임이 나올 수 있어 가운데로 찾는다.
  const seconds = (frame + 0.5) / 30;
  media.volume = Math.max(0, Math.min(1, volume));
  if (running) {
    if (Math.abs(media.currentTime - seconds) > 0.3) media.currentTime = seconds;
    if (media.paused) void media.play().catch(() => {});
  } else {
    media.pause();
    if (Math.abs(media.currentTime - seconds) > 0.015) media.currentTime = seconds;
  }
}

function ClipLayer({ node, source, sourceFrame, opacity, volume, running }: {
  node?: CanvasNode; source: ReturnType<typeof clipSource>; sourceFrame: number; opacity: number; volume: number; running: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { syncMedia(video.current, sourceFrame, volume, running && opacity > 0); });
  return <div className="timeline-layer" style={{ opacity }}>
    {source === "video" ? <video ref={video} src={node!.asset!.url} preload="auto" playsInline />
      : source === "image" ? <Image src={node!.asset!.url} alt="" fill unoptimized sizes="60vw" />
        : source === "slate" ? <div className="timeline-slate"><strong>{node?.title || "빈 프리비즈 카드"}</strong>{node?.body && <p>{node.body}</p>}</div>
          : <div className="timeline-slate"><strong>{node?.title ?? "보드에 없는 노드"}</strong><p>{sourceNotes[source]}</p></div>}
  </div>;
}

function AudioLayer({ url, track, frame, running }: { url: string; track: TimelineAudio; frame: number; running: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const gain = audioGainAt(track, frame);
  // shortcut: 브라우저 음량은 1까지다. 더 큰 배율을 들려줘야 하면 Web Audio의 GainNode로 바꾼다.
  useEffect(() => { syncMedia(audio.current, Math.max(0, track.inFrame + frame - track.startFrame), gain, running && gain > 0); });
  return <audio ref={audio} src={url} preload="auto" />;
}

export function TimelineAddMenu({ label, help, items, disabled, tone, onPick }: {
  label: string; help: string; items: readonly { id: string; title: string; note: string }[];
  disabled?: boolean; tone?: string; onPick: (id: string) => void;
}) {
  return <Menu>
    <MenuTrigger className="studio-action" data-tone={tone} disabled={disabled} title={help}><Plus size={16} aria-hidden="true" /> {label}</MenuTrigger>
    <MenuContent className="board-context-menu timeline-add-menu" side="top" align="start" aria-label={label}>
      {items.map(({ id, title, note }) => <MenuItem className="board-context-item" key={id} value={id || "empty"} onSelect={() => onPick(id)}>
        <span>{title}<small>{note}</small></span>
      </MenuItem>)}
    </MenuContent>
  </Menu>;
}

export default function TimelineMonitor({ nodes, draft: saved, media, issues, clipIndex, audioIndex, panel, disabled, stage, clipItems, soundItems, onSelect, onEdit, onAddClip, onAddAudio }: {
  nodes: ReadonlyMap<string, CanvasNode>; draft: TimelineSpec; media: ReturnType<typeof useTimelineMedia>; issues: readonly TimelineIssue[];
  clipIndex: number; audioIndex: number; panel: TimelinePanel; disabled: boolean; stage?: React.ReactNode;
  clipItems: React.ComponentProps<typeof TimelineAddMenu>["items"]; soundItems: React.ComponentProps<typeof TimelineAddMenu>["items"];
  onSelect: (panel: TimelinePanel, index?: number) => void; onEdit: (spec: TimelineSpec) => void;
  onAddClip: (nodeId: string | null) => void; onAddAudio: (nodeId: string, startFrame: number) => void;
}) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [shownClip, setShownClip] = useState(clipIndex);
  const [dragging, setDragging] = useState<{ scale: number; draft: TimelineSpec } | null>(null);
  const [drop, setDrop] = useState<{ from: number; to: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // 놓기 전까지 끄는 값은 시간축에만 보여 주고 편집에 넣지 않는다.
  const draft = dragging?.draft ?? saved;
  const ranges = useMemo(() => clipRanges(draft.clips), [draft.clips]);
  const frames = ranges.at(-1)?.end ?? 0;
  const scale = dragging?.scale ?? Math.max(1, frames, ...draft.audio.map((track) => track.startFrame + track.durationFrames));
  const at = Math.min(Math.floor(position), Math.max(0, frames - 1));
  const blocked = disabled || Boolean(stage) || panel === "lens" || !frames;
  const running = playing && !blocked;
  if (playing && blocked) setPlaying(false);
  if (shownClip !== clipIndex) {
    setShownClip(clipIndex);
    const range = ranges[clipIndex];
    if (range && (at < range.start || at >= range.end)) setPosition(range.start + draft.clips[clipIndex].transitionFrames);
  }

  const tick = useEffectEvent((elapsed: number) => {
    const next = position + elapsed * 30 / 1000;
    setPosition(Math.min(frames, next));
    if (next >= frames) setPlaying(false);
  });
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const run = (now: number) => {
      if (now - last >= 30) { tick(now - last); last = now; }
      request = requestAnimationFrame(run);
    };
    let request = requestAnimationFrame(run);
    return () => cancelAnimationFrame(request);
  }, [running]);
  const follow = useEffectEvent(() => {
    const box = scroller.current;
    const lane = content.current;
    if (!box || !lane || box.scrollWidth <= box.clientWidth) return;
    const left = lane.offsetLeft + at / scale * lane.clientWidth - box.scrollLeft;
    if (left > box.clientWidth - 40 || left < lane.offsetLeft) box.scrollLeft += left - lane.offsetLeft - 40;
  });
  useEffect(() => follow(), [at, zoom]);

  const layers = layersAt(draft.clips, at);
  const upcoming = (layers.at(-1)?.index ?? -1) + 1;
  const visible = draft.clips[upcoming]
    ? [...layers, { index: upcoming, sourceFrame: draft.clips[upcoming].inFrame, opacity: 0, volume: 0 }] : layers;
  const caption = draft.words?.find((word) => word.startFrame <= at && at < word.endFrame)?.text;

  const sourceSeconds = (nodeId: string | null) => media.seconds.get(nodes.get(nodeId ?? "")?.asset?.url ?? "");
  const grab: Grab = (kind, index) => (event) => {
    if (disabled || event.button !== 0 || !content.current) return;
    // 손가락으로 몸통을 밀 때는 시간축 스크롤이 먼저다.
    if (event.pointerType === "touch" && (kind === "clip-move" || kind === "audio-move")) return;
    event.stopPropagation();
    onSelect(kind.startsWith("clip") ? "clip" : "audio", index);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, index, x: event.clientX, framesPerPixel: scale / content.current.clientWidth, active: false };
  };
  function dropIndex({ index, framesPerPixel }: Drag, event: React.PointerEvent) {
    const pointer = (event.clientX - content.current!.getBoundingClientRect().left) * framesPerPixel;
    return clipRanges(saved.clips).filter(({ start, end }, i) => i !== index && (start + saved.clips[i].transitionFrames + end) / 2 < pointer).length;
  }
  function dragResult({ kind, index, x, framesPerPixel }: Drag, event: React.PointerEvent): TimelineSpec {
    const delta = Math.round((event.clientX - x) * framesPerPixel);
    if (kind === "clip-move") return saved;
    if (kind === "clip-trim") {
      const clip = saved.clips[index];
      return { ...saved, clips: trimClip(saved.clips, index, clip.durationFrames + delta, sourceSeconds(clip.nodeId)) };
    }
    const track = saved.audio[index];
    const next = kind === "audio-move" ? moveAudio(track, frames, track.startFrame + delta)
      : trimAudio(track, frames, track.durationFrames + delta, sourceSeconds(track.nodeId));
    return { ...saved, audio: saved.audio.map((item, i) => i === index ? next : item) };
  }
  function dragTo(event: React.PointerEvent) {
    const current = drag.current;
    if (!current || (!current.active && Math.abs(event.clientX - current.x) < 4)) return;
    current.active = true;
    setDragging({ scale, draft: dragResult(current, event) });
    if (current.kind === "clip-move") setDrop({ from: current.index, to: dropIndex(current, event) });
  }
  function endDrag(event?: React.PointerEvent) {
    const current = drag.current;
    drag.current = null;
    setDragging(null);
    setDrop(null);
    dragged.current = Boolean(current?.active);
    if (!current?.active || !event) return;
    const to = current.kind === "clip-move" ? dropIndex(current, event) : current.index;
    if (to !== current.index) {
      onEdit({ ...saved, clips: moveClip(saved.clips, current.index, to) });
      onSelect("clip", to);
    } else {
      const next = dragResult(current, event);
      if (timelineKey(next) !== timelineKey(saved)) onEdit(next);
    }
  }
  const percent = (value: number) => `${value / scale * 100}%`;
  const invalid = (kind: TimelineIssue["kind"], index: number) => issues.some((issue) => issue.kind === kind && issue.index === index) || undefined;
  const step = rulerSeconds(scale, 10 * zoom);
  const dropAt = drop && (() => {
    const rest = ranges.flatMap((range, index) => index === drop.from ? [] : [range.start + draft.clips[index].transitionFrames]);
    return rest[drop.to] ?? frames;
  })();

  const wordLane = useMemo(() => draft.words?.map((word, index) => <span key={index} className="timeline-word"
    style={{ left: `${word.startFrame / scale * 100}%`, width: `${Math.max(0, word.endFrame - word.startFrame) / scale * 100}%` }}>{word.text}</span>), [draft.words, scale]);

  return <>
    <section className="timeline-stage" aria-label="편집 화면" data-result={Boolean(stage) || undefined}>
      {stage ?? <div className="timeline-screen" style={{ "--ratio": ratios[draft.aspect] } as React.CSSProperties}>
        {visible.map((layer) => {
          const { nodeId } = draft.clips[layer.index];
          return <ClipLayer key={layer.index} {...layer} node={nodes.get(nodeId ?? "")} source={clipSource(nodeId, nodes)} running={running} />;
        })}
        {caption && <p className="timeline-caption">{caption}</p>}
      </div>}
      {!stage && draft.audio.map((track, index) => {
        const asset = nodes.get(track.nodeId)?.asset;
        return asset && audioSource(track.nodeId, nodes) === "audio" && at >= track.startFrame - 30 && at < track.startFrame + track.durationFrames
          ? <AudioLayer key={`${index}:${asset.url}`} url={asset.url} track={track} frame={at} running={running} /> : null;
      })}
    </section>
    <section className="timeline-tracks" aria-label="시간축"
      onPointerDownCapture={() => { dragged.current = false; }}
      // 끌기를 마친 뒤의 클릭이 옮기기 전 위치를 다시 고르지 않게 한다.
      onClickCapture={(event) => { if (dragged.current) { dragged.current = false; event.stopPropagation(); } }}
      onPointerMove={dragTo} onPointerUp={endDrag} onPointerCancel={() => endDrag()}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !drag.current) return;
        endDrag();
        event.preventDefault();
        event.stopPropagation();
      }}>
      <div className="timeline-toolbar">
        <div className="timeline-transport">
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="처음으로" title="재생 위치를 처음으로 옮깁니다."
            disabled={!frames || Boolean(stage)} onClick={() => setPosition(0)}><SkipBack size={18} aria-hidden="true" /></button>
          <button type="button" className="studio-action" data-size="icon" aria-label={running ? "일시정지" : "편집 순서대로 재생"}
            title="영상을 합성하지 않고 컷과 음향, 자막의 순서를 확인합니다." disabled={blocked}
            onClick={() => { if (!running && position >= frames - 1) setPosition(0); setPlaying(!running); }}>
            {running ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}</button>
          <p className="timeline-clock"><strong>{timecode(at)}</strong> / {timecode(frames)}</p>
        </div>
        <div className="timeline-adds">
          <TimelineAddMenu label="컷 추가" help="보드의 샷·이미지·영상이나 빈 카드를 타임라인 끝에 추가합니다." items={clipItems}
            disabled={disabled || draft.clips.length >= TIMELINE_MAX_CLIPS} onPick={(id) => onAddClip(id || null)} />
          <TimelineAddMenu label="음향 추가" help="음향 노드를 현재 재생 위치에 새 레이어로 추가합니다." items={soundItems}
            disabled={disabled || !frames || !soundItems.length || draft.audio.length >= TIMELINE_MAX_AUDIO} onPick={(id) => onAddAudio(id, at)} />
        </div>
        <div className="timeline-zoom" role="group" aria-label="시간축 확대">
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="시간축 축소" disabled={zoom === zooms[0]}
            onClick={() => setZoom(zooms[zooms.indexOf(zoom) - 1])}><Minus size={16} aria-hidden="true" /></button>
          <span aria-live="polite">{zoom === 1 ? "맞춤" : `${zoom}배`}</span>
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="시간축 확대" disabled={zoom === zooms.at(-1)}
            onClick={() => setZoom(zooms[zooms.indexOf(zoom) + 1])}><Plus size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="timeline-scroll" ref={scroller}>
        <div className="timeline-lanes" style={{ "--zoom": zoom, "--min-clips": draft.clips.length } as React.CSSProperties}>
          <div className="timeline-lane timeline-ruler">
            <span className="timeline-lane-label">시간</span>
            <div className="timeline-lane-content" ref={content}>
              {frames > 0 && Array.from({ length: Math.floor(scale * 0.96 / 30 / step) + 1 }, (_, index) => <span key={index} className="timeline-tick" style={{ left: percent(index * step * 30) }}>
                {step < 1 ? (index * step).toFixed(1) : timecode(index * step * 30).slice(0, -2)}</span>)}
              {frames > 0 && <Slider className="timeline-scrub" style={{ width: percent(frames) }} value={at} min={0} max={frames} step={1} largeStep={30}
                disabled={Boolean(stage)} onValueChange={(next) => setPosition(next)}>
                <SliderControl className="timeline-scrub-control"><SliderTrack className="timeline-scrub-track">
                  <SliderThumb className="timeline-scrub-thumb" aria-label="재생 위치" aria-valuetext={timecode(at)} />
                </SliderTrack></SliderControl>
              </Slider>}
            </div>
          </div>
          <div className="timeline-lane timeline-clip-lane">
            <span className="timeline-lane-label">컷</span>
            <div className="timeline-lane-content">
              {draft.clips.length > 0 && <Listbox aria-label="컷 순서" orientation="horizontal" disabled={disabled} value={String(clipIndex)}
                onValueChange={(value) => { if (value !== null) onSelect("clip", Number(value)); }}>
                {draft.clips.map((clip, index) => {
                  const node = nodes.get(clip.nodeId ?? "");
                  const source = clipSource(clip.nodeId, nodes);
                  const title = node?.title ?? (clip.nodeId ? "보드에 없는 노드" : "빈 프리비즈 카드");
                  const thumb = source === "image" || source === "video"
                    ? media.thumbs.get(thumbKey(node!.asset!.url, source === "video" ? clip.inFrame : 0)) : undefined;
                  const broken = invalid("clip", index);
                  const Icon = broken ? TriangleAlert : source === "video" ? Film : source === "image" ? ImageIcon : source === "slate" ? SquareDashed : FileQuestion;
                  const start = ranges[index].start + clip.transitionFrames;
                  return <ListboxItem key={index} value={String(index)} className="timeline-clip" data-slate={source !== "image" && source !== "video" || undefined}
                    data-invalid={broken} data-dragging={drop?.from === index || undefined}
                    style={{ left: percent(start), width: percent(ranges[index].end - start) }}
                    aria-label={`컷 ${index + 1} ${title}, ${timecode(clip.durationFrames)}${clip.transition === "dissolve" ? ", 디졸브로 시작" : ""}${source === "slate" ? ", 슬레이트" : ""}${broken ? ", 확인 필요" : ""}`}
                    onPointerDown={grab("clip-move", index)}>
                    {thumb && <span className="timeline-clip-thumb" style={{ backgroundImage: `url("${thumb}")` }} />}
                    <span className="timeline-clip-text"><b>{index + 1}</b><span><Icon size={12} aria-hidden="true" /> {title}</span><small>{timecode(clip.durationFrames)}</small></span>
                    <span className="timeline-handle" aria-hidden="true" onPointerDown={grab("clip-trim", index)} />
                  </ListboxItem>;
                })}
              </Listbox>}
              {draft.clips.map((clip, index) => clip.transitionFrames > 0 && <span key={index} className="timeline-dissolve" aria-hidden="true"
                style={{ left: percent(ranges[index].start), width: percent(clip.transitionFrames) }} />)}
              {!draft.clips.length && <p className="timeline-lane-hint">추가한 컷이 순서대로 놓입니다.</p>}
              {dropAt !== null && <span className="timeline-drop" style={{ left: percent(dropAt) }} />}
            </div>
          </div>
          {draft.audio.length > 0 && <Listbox className="timeline-audio-lanes" aria-label="음향 레이어" disabled={disabled} value={panel === "audio" ? String(audioIndex) : null}
            onValueChange={(value) => { if (value !== null) onSelect("audio", Number(value)); }}>
            {draft.audio.map((track, index) => {
              const node = nodes.get(track.nodeId);
              const broken = invalid("audio", index);
              const Icon = broken ? TriangleAlert : Music;
              const fadeIn = track.fadeInFrames / Math.max(1, track.durationFrames) * 100;
              const fadeOut = 100 - track.fadeOutFrames / Math.max(1, track.durationFrames) * 100;
              return <div className="timeline-lane" key={index}>
                <span className="timeline-lane-label" aria-hidden="true">음향 {index + 1}</span>
                <div className="timeline-lane-content">
                  <ListboxItem value={String(index)} className="timeline-audio" data-silent={audioSource(track.nodeId, nodes) !== "audio" || undefined} data-invalid={broken}
                    style={{ left: percent(track.startFrame), width: percent(track.durationFrames) }}
                    aria-label={`음향 ${index + 1} ${node?.title ?? "보드에 없는 노드"}, ${timecode(track.startFrame)}부터 ${timecode(track.durationFrames)}${audioSource(track.nodeId, nodes) === "silent" ? ", 무음" : ""}${broken ? ", 확인 필요" : ""}`}
                    onPointerDown={grab("audio-move", index)}>
                    <span className="timeline-audio-shape" style={{ clipPath: `polygon(0 100%, ${fadeIn}% 0, ${fadeOut}% 0, 100% 100%)` }} />
                    <span className="timeline-audio-text"><Icon size={12} aria-hidden="true" /> {node?.title ?? "보드에 없는 노드"}</span>
                    <span className="timeline-handle" aria-hidden="true" onPointerDown={grab("audio-trim", index)} />
                  </ListboxItem>
                </div>
              </div>;
            })}
          </Listbox>}
          {!draft.audio.length && <div className="timeline-lane"><span className="timeline-lane-label">음향</span>
            <p className="timeline-lane-hint">{soundItems.length ? "음향 추가를 누르면 재생 위치에 놓입니다." : "음향 노드에 파일을 추가하면 여기에서 배치할 수 있습니다."}</p></div>}
          <div className="timeline-lane"><span className="timeline-lane-label">자막</span>
            <div className="timeline-lane-content"><button type="button" className="timeline-words-lane" aria-pressed={panel === "words"}
              aria-label={`단어 자막 ${draft.words?.length ?? 0}개 편집`} onClick={() => onSelect("words")}>
              {wordLane?.length ? wordLane : <span className="timeline-lane-hint">음성에서 받아쓰거나 직접 입력합니다.</span>}</button></div>
          </div>
          {frames > 0 && <span className="timeline-playhead" aria-hidden="true" style={{ "--at": at / scale } as React.CSSProperties} />}
        </div>
      </div>
    </section>
  </>;
}
