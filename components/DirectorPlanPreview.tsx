import { kindLabels, roleLabels, type Graph } from "../lib/types";

export default function DirectorPlanPreview({ graph }: { graph: Graph }) {
  const titles = new Map(
    graph.nodes.map((node) => [node.id, node.title || kindLabels[node.kind]]),
  );
  const sceneCount = graph.nodes.filter((node) => node.kind === "scene").length;
  return (
    <div className="plan-preview">
      <strong>{sceneCount ? `제안된 씬 ${sceneCount}개 · ` : ""}노드 {graph.nodes.length}개</strong>
      <div className="plan-nodes">
        {graph.nodes.map((node) => (
          <details key={node.id}>
            <summary title="제안된 노드의 내용을 펼쳐 확인합니다.">
              <span>{kindLabels[node.kind]}</span> {node.title || "제목 없음"}
            </summary>
            <p>{node.body || "내용 없음"}</p>
          </details>
        ))}
      </div>
      <details className="plan-edges">
        <summary title="제안된 노드 사이의 연결과 참조 역할을 확인합니다.">
          연결 {graph.edges.length}개 보기
        </summary>
        <ul>
          {graph.edges.map((edge, index) => (
            <li key={`${edge.source}-${edge.target}-${index}`}>
              {titles.get(edge.source)} → {titles.get(edge.target)}
              {edge.role && edge.role !== "context"
                ? ` · ${roleLabels[edge.role]}`
                : ""}
              {edge.usage === "guide" ? " · 연출 확인용" : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
