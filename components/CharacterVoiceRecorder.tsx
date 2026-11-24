"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import {
  recordingToWav,
  VOICE_MAX_RECORDING_BYTES,
  VOICE_MAX_SECONDS,
} from "../lib/voice-recording";
import "./character-voice-recorder.css";

type Props = {
  name: string;
  onAttach: (file: File) => Promise<boolean>;
  disabled?: boolean;
};

export default function CharacterVoiceRecorder({
  name,
  onAttach,
  disabled,
}: Props) {
  const [state, setState] = useState<
    "idle" | "recording" | "preparing" | "ready" | "attaching"
  >("idle");
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const currentUrl = useRef("");

  function release() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  }
  function discard() {
    generation.current++;
    const active = recorder.current;
    if (active && active.state !== "inactive") active.stop();
    release();
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = "";
    setAudio(null);
    setError("");
    setState("idle");
  }
  useEffect(
    () => () => {
      generation.current++;
      const active = recorder.current;
      if (active && active.state !== "inactive") active.stop();
      release();
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    },
    [],
  );

  async function start() {
    if (disabled || state !== "idle") return;
    setError("");
    setState("preparing");
    const token = ++generation.current;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("이 브라우저에서는 마이크 녹음을 사용할 수 없습니다.");
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (generation.current !== token) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      const media = new MediaRecorder(acquired);
      recorder.current = media;
      const chunks: Blob[] = [];
      let bytes = 0,
        exceeded = false;
      media.ondataavailable = (event) => {
        bytes += event.data.size;
        if (bytes > VOICE_MAX_RECORDING_BYTES) {
          exceeded = true;
          if (media.state !== "inactive") media.stop();
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      media.onerror = () => {
        if (generation.current !== token) return;
        generation.current++;
        release();
        setError("마이크 녹음이 중단됐습니다. 다시 시도해 주세요.");
        setState("idle");
      };
      media.onstop = async () => {
        if (recorder.current === media) release();
        if (generation.current !== token) return;
        setState("preparing");
        try {
          if (exceeded)
            throw new Error(
              "녹음 크기 한도를 초과했습니다. 다시 녹음해 주세요.",
            );
          const wav = await recordingToWav(
            new Blob(chunks, { type: media.mimeType }),
          );
          if (generation.current !== token) return;
          const url = URL.createObjectURL(wav);
          currentUrl.current = url;
          setAudio({ blob: wav, url });
          setState("ready");
        } catch (cause) {
          if (generation.current === token) {
            setError(
              cause instanceof Error
                ? cause.message
                : "녹음을 처리하지 못했습니다.",
            );
            setState("idle");
          }
        }
      };
      media.start(1000);
      timer.current = setTimeout(() => {
        if (media.state !== "inactive") media.stop();
      }, VOICE_MAX_SECONDS * 1000);
      setState("recording");
    } catch (cause) {
      if (generation.current === token) {
        release();
        setError(
          cause instanceof Error ? cause.message : "마이크를 열지 못했습니다.",
        );
        setState("idle");
      }
    }
  }
  async function attach() {
    if (!audio || disabled || state !== "ready") return;
    setState("attaching");
    setError("");
    try {
      const filename = `${name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").slice(0, 80) || "캐릭터"}-목소리.wav`;
      if (
        await onAttach(new File([audio.blob], filename, { type: "audio/wav" }))
      )
        discard();
      else {
        setError("노드에 음성을 첨부하지 못했습니다. 다시 시도해 주세요.");
        setState("ready");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "노드에 음성을 첨부하지 못했습니다.",
      );
      setState("ready");
    }
  }
  return (
    <section
      className="character-voice-recorder"
      aria-label="캐릭터 목소리 녹음"
    >
      <h3>캐릭터 목소리 녹음</h3>
      <p>최대 60초 녹음한 뒤 듣고 이 노드에 첨부합니다.</p>
      {state === "idle" && (
        <button type="button" disabled={disabled} onClick={() => void start()}>
          <Mic size={15} /> 녹음 시작
        </button>
      )}
      {state === "recording" && (
        <div>
          <button
            type="button"
            onClick={() => {
              if (recorder.current?.state !== "inactive")
                recorder.current?.stop();
            }}
          >
            <Square size={14} /> 녹음 종료
          </button>
          <button type="button" onClick={discard}>
            취소
          </button>
          <span role="status">녹음 중 · 최대 60초</span>
        </div>
      )}
      {state === "preparing" && (
        <div>
          <span role="status">마이크 또는 녹음 파일을 준비하고 있습니다.</span>
          <button type="button" onClick={discard}>
            취소
          </button>
        </div>
      )}
      {audio && (
        <div>
          <audio controls src={audio.url} aria-label="녹음 미리 듣기" />
          <button
            type="button"
            disabled={disabled || state === "attaching"}
            onClick={() => void attach()}
          >
            WAV 첨부
          </button>
          <button
            type="button"
            disabled={state === "attaching"}
            onClick={discard}
          >
            <Trash2 size={14} /> 버리기
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="character-voice-error">
          {error}
        </p>
      )}
    </section>
  );
}
