import { Fragment } from "react";
import { markupPieces } from "@/lib/speech-markup";

/** 대사의 지시를 한국어 태그로, 감싼 말을 밑줄로 보여준다. */
export default function SpeechMarkup({ text }: { text: string }) {
  return <>{markupPieces(text).map((piece, index) => "cue" in piece
    ? <small key={index} className="speech-cue">{piece.cue}</small>
    : piece.spans.length ? <Fragment key={index}><small className="speech-cue" data-span>{piece.spans.join("·")}</small><u>{piece.text}</u></Fragment>
      : <Fragment key={index}>{piece.text}</Fragment>)}</>;
}
