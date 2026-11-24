"use client";

import type { RefObject } from "react";
import { MousePointer2, X } from "lucide-react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { workroomGuideFlow, workroomGuideOverview, workroomGuideTabs, type WorkroomTab } from "./workroom-guide-content";
import { Mascot } from "./Brand";
import "./workroom-guide.css";

export type WorkroomGuideTopic = "overview" | WorkroomTab;

export default function WorkroomGuide({ dialog, topic, onClose, onInspect }: {
  dialog: RefObject<HTMLDialogElement | null>;
  topic: WorkroomGuideTopic | null;
  onClose: () => void;
  onInspect: () => void;
}) {
  return (
    <dialog ref={dialog} className="guide-dialog workroom-guide" aria-labelledby="workroom-guide-title"
      onClose={onClose} onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}>
      <div className="guide-shell">
        <header className="guide-header">
          <div>
            <h2 id="workroom-guide-title">작업실 사용 가이드</h2>
            <p>첫 제작 순서와 탭별 사용법</p>
          </div>
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon"
            aria-label="작업실 가이드 닫기" onClick={() => dialog.current?.close()}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {topic && <Tabs className="workroom-guide-topics" defaultValue={topic}>
          <TabsList className="workroom-guide-index" aria-label="작업실 사용 가이드 목차">
            <TabsTab value="overview">처음 시작하기</TabsTab>
            {workroomGuideTabs.map(({ id, label }) => <TabsTab key={id} value={id}>{label}</TabsTab>)}
          </TabsList>
          <TabsPanel className="workroom-guide-article" value="overview" keepMounted>
            <Mascot className="workroom-guide-mascot" pose="direct" size={112} />
            <h3>작업실에서 무엇을 할 수 있나요?</h3>
            <p>{workroomGuideOverview}</p>
            <p>노드는 대본, 씬, 이미지처럼 캔버스에 놓인 제작 자료 한 장을 뜻합니다. 씬은 이야기 속 한 장면이고, 샷은 그 장면을 이루는 개별 촬영 컷입니다.</p>
            <h4 id="workroom-guide-flow">첫 제작 순서</h4>
            <ol className="workroom-guide-flow" role="list" aria-labelledby="workroom-guide-flow">
              {workroomGuideFlow.map(({ title, detail }, index) => (
                <li key={title} data-focal={index === 2 || undefined}>
                  <span aria-hidden="true">{index + 1}</span>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </li>
              ))}
            </ol>
            <h4>하려는 일에 맞는 탭 고르기</h4>
            <dl className="workroom-guide-summary">
              {workroomGuideTabs.map(({ id, label, summary }) => (
                <div key={id}><dt>{label}</dt><dd>{summary}</dd></div>
              ))}
            </dl>
            <h4>작업실과 캔버스 오가기</h4>
            <p>상단의 확대 아이콘으로 작업실을 넓게 볼 수 있습니다. 다른 노드를 고르려면 <strong>패널로 돌아가기</strong>를 누른 뒤 캔버스에서 자료를 선택하세요. 화면이 좁으면 닫기 버튼으로 패널을 접고, 상단의 <strong>프로젝트 에이전트 열기</strong> 버튼으로 다시 엽니다.</p>
          </TabsPanel>
          {workroomGuideTabs.map(({ id, label, summary, steps, tips }) => (
            <TabsPanel key={id} className="workroom-guide-article" value={id} keepMounted>
              <h3>{label} 탭 사용법</h3>
              <p>{summary}</p>
              <h4>따라 하기</h4>
              <ol className="workroom-guide-list">{steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <h4>작업이 막힐 때와 알아둘 점</h4>
              <ul className="workroom-guide-list">{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
            </TabsPanel>
          ))}
        </Tabs>}
        <footer className="guide-footer workroom-guide-footer">
          <button type="button" className="studio-action" onClick={() => {
            dialog.current?.close();
            onInspect();
          }}>
            <MousePointer2 size={16} aria-hidden="true" /> 화면에서 기능 설명 보기
          </button>
        </footer>
      </div>
    </dialog>
  );
}
