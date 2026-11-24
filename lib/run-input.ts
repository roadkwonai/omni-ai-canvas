import { effortOptions, isAgentEffort } from "./agent-effort";
import { imageEditInstruction, isImageEditSpec, isImageEditProvider } from "./image-edit";
import { parseVideoOptions } from "./video-options";
import { parseImageOutput } from "./image-output";
import { isContestBrief } from "./contest";
import { directorRequestText } from "./node-director-direction";
import { effectiveGuidance, guidanceRecipes } from "./node-guidance";
import { productionGuideText } from "./higgsfield-guidance-kit";
import { parseStyleDraft } from "./style-preset-core";
import { MAX_REFERENCE_VIDEOS } from "./reference-limits";
import { mediaModelProvider, mediaOperation, providerModelId } from "./media-model-types";
import { MediaInputError, parseMediaSelection } from "./media-request";
import { characterInputs, readyCharacterSoul, readyCharacterVoice, soulModels } from "./character-identity";
import {
  nodeOperations,
  parseDirectorOptions,
  type Asset,
  type Graph,
  type Operation,
  type Project,
  type Provider,
  type ProviderInfo,
  type Run,
  type RunInput,
} from "./types";

function directorText(node: { directorNote?: string }, operation: unknown) {
  const text = mediaOperation(operation) && node.directorNote ? directorRequestText(node.directorNote, operation) : "";
  return text && `디렉터 연출\n${text}`;
}

const narrativeKinds = new Set([
  "brief",
  "scenario",
  "script",
  "scene",
  "shot",
  "keyframe",
]);
const providers: Provider[] = [
  "codex",
  "claude",
  "agy",
  "higgsfield",
  "topview",
  "kling",
  "openai-image",
  "gemini-image",
  "seedream",
  "road-music",
];
const operations = ["plan", "text", "image", "video", "audio"];
const reviewKinds = new Set(["scene", "script", "shot", "keyframe", "video"]);
const isProvider = (value: unknown): value is Provider =>
  providers.some((provider) => provider === value);

export class RunInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function chatHistory(runs: Run[], input: RunInput) {
  if (!input.chat) return [];
  const existing = runs.find((run) => run.input.requestId === input.requestId);
  if (existing?.input.chat?.history) return existing.input.chat.history;
  return runs
    .filter((run) =>
      run.input.requestId !== input.requestId &&
      run.input.chat?.threadId === input.chat?.threadId &&
      run.status === "succeeded" &&
      typeof run.result?.text === "string",
    )
    .slice(0, 8)
    .reverse()
    .flatMap((run) => [
      { role: "user" as const, content: run.input.prompt.slice(0, 2000) },
      { role: "assistant" as const, content: run.result!.text!.slice(0, 4000) },
    ]);
}

export function providerSupportsInput(
  input: RunInput,
  account: ProviderInfo | undefined,
): boolean {
  return (
    !!account &&
    account.id === input.provider &&
    account.available &&
    account.operations.includes(input.operation) &&
    (!input.model ||
      !!account.models?.some(
        (model) =>
          model.id === input.model &&
          model.operations.includes(input.operation),
      ))
  );
}

export function resolveProviderInput(
  input: RunInput,
  account: ProviderInfo | undefined,
): RunInput {
  const apiProviders: Provider[] = ["openai-image", "gemini-image", "seedream"];
  const resolved =
    !input.model && apiProviders.includes(input.provider)
      ? { ...input, model: account?.models?.[0]?.id }
      : input;
  if (
    !providerSupportsInput(resolved, account) ||
    (apiProviders.includes(input.provider) && !resolved.model) ||
    (resolved.effort !== undefined && !effortOptions(account, resolved.model ?? "").includes(resolved.effort))
  ) {
    throw new RunInputError(
      "서비스의 로그인 상태와 지원 모델·작업을 확인해 주세요.",
      422,
    );
  }
  return resolved;
}

export function reviewReferences(
  graph: Graph,
  sceneId: string | null,
): RunInput["references"] {
  const eligible = new Map(
    graph.nodes
      .filter((node) => reviewKinds.has(node.kind))
      .map((node) => [node.id, node]),
  );
  const guideSources = new Set(
    graph.edges
      .filter((edge) => edge.usage === "guide")
      .map((edge) => edge.source),
  );
  function descendants(root: string): Set<string> {
    const result = new Set<string>();
    const queue = [root];
    while (queue.length) {
      const id = queue.shift()!;
      const node = eligible.get(id);
      if (!node || result.has(id) || (id !== root && node.kind === "scene"))
        continue;
      result.add(id);
      for (const edge of graph.edges)
        if (edge.source === id && edge.usage !== "guide")
          queue.push(edge.target);
    }
    return result;
  }
  let selected: Set<string>;
  if (sceneId) {
    selected = descendants(sceneId);
    for (const other of graph.nodes.filter(
      (node) => node.kind === "scene" && node.id !== sceneId,
    )) {
      for (const id of descendants(other.id)) selected.delete(id);
    }
  } else {
    selected = new Set(
      graph.nodes.map((node) => node.id).filter((id) => !guideSources.has(id)),
    );
  }
  return graph.nodes
    .filter((node) => selected.has(node.id))
    .map((node) => ({
      nodeId: node.id,
      kind: node.kind,
      title: node.title,
      body: node.body,
    }));
}

export function snapshotReferences(
  graph: Graph,
  nodeId: string | null,
  operation: Operation,
  provider?: Provider,
): RunInput["references"] {
  if (operation === "plan") {
    const guideSources = new Set(
      graph.edges
        .filter((edge) => edge.usage === "guide")
        .map((edge) => edge.source),
    );
    return graph.nodes
      .filter((node) => !guideSources.has(node.id))
      .map((node) => ({ title: node.title, body: node.body, nodeId: node.id }));
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const references: RunInput["references"] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  const reachable = new Set<string>();
  const pending = nodeId ? [nodeId] : [];
  while (pending.length) {
    const target = pending.shift()!;
    if (reachable.has(target)) continue;
    reachable.add(target);
    for (const edge of graph.edges.filter(
      (item) => item.target === target && item.usage !== "guide",
    )) {
      const node = nodes.get(edge.source);
      if (node && narrativeKinds.has(node.kind)) pending.push(node.id);
    }
  }
  const blocked = new Set(
    graph.edges
      .filter((edge) => reachable.has(edge.target) && edge.usage === "guide")
      .map((edge) => edge.source),
  );
  const explicitInputs = new Set(
    graph.edges
      .filter((edge) => edge.target === nodeId && edge.usage !== "guide")
      .map((edge) => edge.source),
  );
  const queue = nodeId ? [nodeId] : [];
  while (queue.length) {
    const target = queue.shift()!;
    if (visited.has(target)) continue;
    visited.add(target);
    for (const edge of graph.edges.filter(
      (item) => item.target === target && item.usage !== "guide",
    )) {
      const node = nodes.get(edge.source);
      if (!node || (blocked.has(node.id) && !explicitInputs.has(node.id)))
        continue;
      const key = `${node.id}\0${edge.role ?? "context"}`;
      if (!seen.has(key)) {
        seen.add(key);
        const includeImages =
          operation === "image" ||
          (operation === "text" && provider === "codex");
        const asset = node.asset?.type === "audio"
          ? operation === "video" && provider === "higgsfield" && target === nodeId ? node.asset : undefined
          : node.asset && (operation === "video" ||
            (operation === "image" && mediaModelProvider(provider)) ||
            (includeImages && node.asset.type === "image"))
            ? node.asset
            : undefined;
        const soul = operation === "video" && provider === "higgsfield" && edge.role === "identity"
          ? readyCharacterSoul(node) : undefined;
        references.push({
          title: node.title,
          body: [node.body, directorText(node, operation)].filter(Boolean).join("\n\n"),
          nodeId: node.id,
          ...(edge.role ? { role: edge.role } : {}),
          ...(asset ? { asset } : {}),
          ...(soul ? { characterSoul: { id: soul.id, variant: soul.variant } } : {}),
        });
      }
      if (narrativeKinds.has(node.kind)) queue.push(node.id);
    }
  }
  const target = nodeId && nodes.get(nodeId);
  if (target)
    references.push({
      title: target.title,
      body: target.body,
      nodeId: target.id,
    });
  return references;
}

export function buildRunInput(
  project: Project,
  value: Record<string, unknown>,
  requestId: string,
): RunInput {
  const {
    nodeId,
    operation,
    provider,
    prompt: rawPrompt,
    version,
    director,
    review,
    model,
    effort,
  } = value;
  const guidanceEdit = value.guidanceEdit;
  let motionDesign: RunInput["motionDesign"];
  if (value.motionDesign !== undefined) {
    const design = value.motionDesign;
    if (!design || typeof design !== "object" || Array.isArray(design) ||
      Object.keys(design).some((key) => !["aspect", "seconds", "style"].includes(key)) ||
      !("aspect" in design) || !("seconds" in design) ||
      (design.aspect !== "16:9" && design.aspect !== "9:16") ||
      typeof design.seconds !== "number" || !Number.isFinite(design.seconds) ||
      design.seconds < 1 || design.seconds > 600 || design.seconds * 2 !== Math.round(design.seconds * 2) ||
      operation !== "text" || nodeId !== null ||
      !["codex", "claude", "agy"].includes(String(provider)) ||
      [value.presetDesign, value.chat, guidanceEdit, director, review, value.contest, value.media, value.audio, value.videoOptions].some((v) => v !== undefined) ||
      (value.attachmentIds !== undefined && (!Array.isArray(value.attachmentIds) || value.attachmentIds.length !== 0)))
      throw new RunInputError("모션 기획의 화면비, 길이와 에이전트를 확인해 주세요.");
    const style = "style" in design ? parseStyleDraft(design.style) : undefined;
    if ("style" in design && !style)
      throw new RunInputError("모션 기획에 사용할 프리셋을 확인해 주세요.");
    motionDesign = { aspect: design.aspect, seconds: design.seconds, ...(style ? { style: { ...style, evidence: "" } } : {}) };
  }
  let presetDesign: RunInput["presetDesign"];
  if (value.presetDesign !== undefined) {
    const design = value.presetDesign;
    if (!design || typeof design !== "object" || Array.isArray(design) ||
        !("mode" in design) || !("draft" in design) ||
        (design.mode !== "analyze" && design.mode !== "recommend") ||
        operation !== "text" || nodeId !== null ||
        [value.chat, guidanceEdit, director, review, value.contest].some((v) => v !== undefined))
      throw new RunInputError("제작 프리셋 요청 방식을 확인해 주세요.");
    const draft = parseStyleDraft(design.draft);
    if (!draft || !["claude", "codex", "agy"].includes(String(provider)))
      throw new RunInputError("제작 프리셋의 유형, 스타일과 에이전트를 확인해 주세요.");
    const ids = value.attachmentIds ?? [];
    if (!Array.isArray(ids) || (design.mode === "analyze"
      ? (ids.length < 1 || ids.length > MAX_REFERENCE_VIDEOS) || provider === "agy" : ids.length !== 0))
      throw new RunInputError(`영상 분석에는 영상 1~${MAX_REFERENCE_VIDEOS}편과 Codex 또는 Claude가 필요합니다. 아이디어 추천에는 첨부가 필요하지 않습니다.`);
    presetDesign = { mode: design.mode, draft };
  }
  const rawChat = value.chat;
  let chat: RunInput["chat"];
  if (rawChat !== undefined) {
    if (
      !rawChat || typeof rawChat !== "object" || Array.isArray(rawChat) ||
      Object.keys(rawChat).some((key) => !["threadId", "nodeIds", "recipeIds", "stylePreset"].includes(key))
    ) throw new RunInputError("대화 설정을 확인해 주세요.");
    const candidate = rawChat as Record<string, unknown>;
    if (
      typeof candidate.threadId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(candidate.threadId) ||
      !Array.isArray(candidate.nodeIds) || candidate.nodeIds.length > 12 ||
      candidate.nodeIds.some((id) => typeof id !== "string" || !project.graph.nodes.some((node) => node.id === id)) ||
      new Set(candidate.nodeIds).size !== candidate.nodeIds.length ||
      !Array.isArray(candidate.recipeIds) || candidate.recipeIds.length > 6 ||
      candidate.recipeIds.some((id) => typeof id !== "string" || !guidanceRecipes.some((recipe) => recipe.id === id)) ||
      new Set(candidate.recipeIds).size !== candidate.recipeIds.length ||
      operation !== "text" || nodeId !== null || guidanceEdit !== undefined ||
      review !== undefined || director !== undefined
    ) throw new RunInputError("대화의 자료와 작업 방식을 확인해 주세요.");
    const stylePreset = parseStyleDraft(candidate.stylePreset);
    if (candidate.stylePreset !== undefined && !stylePreset)
      throw new RunInputError("프로젝트 대화에서 사용할 제작 프리셋을 확인해 주세요.");
    chat = {
      threadId: candidate.threadId,
      nodeIds: candidate.nodeIds as string[],
      recipeIds: candidate.recipeIds as string[],
      ...(stylePreset ? { stylePreset: { ...stylePreset, evidence: "" } } : {}),
    };
  }
  if (guidanceEdit !== undefined && (guidanceEdit !== true || operation !== "text" || chat || review || director))
    throw new RunInputError("지침 수정 요청을 확인해 주세요.");
  const prompt =
    isContestBrief(value.contest) &&
    (rawPrompt === undefined ||
      (typeof rawPrompt === "string" && !rawPrompt.trim()))
      ? "확인한 공모 요강만으로 아이디어 후보를 확장하고 적합한 시나리오·대본·씬을 설계해 주세요."
      : Array.isArray(value.attachmentIds) &&
          value.attachmentIds.length &&
          (rawPrompt === undefined ||
            (typeof rawPrompt === "string" && !rawPrompt.trim()))
        ? operation === "plan"
          ? "첨부한 자료를 바탕으로 요청한 기획 또는 검토를 진행해 주세요."
          : "첨부한 자료와 이 노드의 지시에 맞는 결과를 만들어 주세요."
        : rawPrompt;
  if (
    typeof prompt !== "string" ||
    !prompt.trim() ||
    prompt.length > 12_000 ||
    !Number.isSafeInteger(version) ||
    typeof operation !== "string" ||
    !operations.includes(operation) ||
    !isProvider(provider)
  )
    throw new RunInputError("요청 내용과 프로젝트 버전을 확인해 주세요.");
  if (version !== project.version)
    throw new RunInputError(
      "프로젝트가 변경됐습니다. 최신 상태를 확인해 주세요.",
      409,
    );
  if (effort !== undefined && (!isAgentEffort(effort) ||
      !["codex", "claude", "agy"].includes(provider) || !["plan", "text"].includes(operation)))
    throw new RunInputError("에이전트와 추론 강도를 확인해 주세요.");
  if (model !== undefined && !providerModelId(provider, model))
    throw new RunInputError("모델을 확인해 주세요.");
  let media: RunInput["media"];
  const voiceWork = provider === "higgsfield" && operation === "audio";
  if (value.media !== undefined) {
    if (!mediaModelProvider(provider) || !mediaOperation(operation) || !model)
      throw new RunInputError("이미지·영상 서비스와 모델을 선택해 주세요.");
    try {
      media = parseMediaSelection(value.media);
    } catch (error) {
      if (error instanceof MediaInputError) throw new RunInputError(error.message);
      throw error;
    }
  } else if (!voiceWork && mediaModelProvider(provider) && (model || provider === "topview"))
    throw new RunInputError("모델과 작업 방식을 선택해 주세요.");
  const node = project.graph.nodes.find((item) => item.id === nodeId);
  if (
    review !== undefined &&
    (review !== true || operation !== "plan" || director !== undefined)
  )
    throw new RunInputError("검토 요청을 확인해 주세요.");
  if (
    chat || presetDesign || motionDesign ? false : operation === "plan"
      ? review === true
        ? nodeId !== null && node?.kind !== "scene"
        : nodeId !== null
      : !node
  )
    throw new RunInputError("작업할 노드를 확인해 주세요.");
  if (
    node &&
    operation !== "plan" &&
    !guidanceEdit && !nodeOperations(node.kind).includes(operation as Operation)
  )
    throw new RunInputError("이 노드에서 지원하지 않는 작업입니다.");
  const videoOptions =
    value.videoOptions === undefined
      ? undefined
      : parseVideoOptions(value.videoOptions);
  if (
    value.videoOptions !== undefined &&
    (!videoOptions || media || provider !== "higgsfield" || operation !== "video")
  )
    throw new RunInputError(
      "지원하는 Higgsfield 영상 작업의 모드와 규격을 선택하세요.",
    );
  const imageOutput = value.imageOutput === undefined ? undefined : parseImageOutput(value.imageOutput);
  if (value.imageOutput !== undefined && (!imageOutput || operation !== "image" || provider !== "codex"))
    throw new RunInputError("ChatGPT 이미지 출력 설정을 확인해 주세요.");
  const contest = value.contest;
  if (
    contest !== undefined &&
    (!isContestBrief(contest) || !director || operation !== "plan" || review)
  )
    throw new RunInputError(
      "공모전 요강은 감독 기획에서만 사용할 수 있습니다.",
    );
  const audio = value.audio;
  let characterVoice: RunInput["characterVoice"];
  if (voiceWork) {
    const actors = node ? characterInputs(project.graph, node.id) : [];
    const voice = actors.length === 1 ? readyCharacterVoice(actors[0]) : undefined;
    if (node?.kind !== "audioCue" || !voice)
      throw new RunInputError("음향 큐에 목소리를 등록한 캐릭터 한 명을 화자로 연결해 주세요.", 422);
    if (audio !== undefined || (model !== undefined && model !== "seed_audio") ||
        typeof rawPrompt !== "string" || !rawPrompt.trim() ||
        (Array.isArray(value.attachmentIds) && value.attachmentIds.length > 0))
      throw new RunInputError("음성 합성에 사용할 발화 대사를 확인해 주세요.", 422);
    characterVoice = { id: voice.id, type: voice.type };
  } else if (operation === "audio") {
    if (
      provider !== "road-music" ||
      !audio ||
      typeof audio !== "object" ||
      !("engine" in audio) ||
      !("purpose" in audio) ||
      !("seconds" in audio)
    )
      throw new RunInputError("Road Music 엔진·음향 종류·길이를 선택하세요.");
    const { engine, purpose, seconds } = audio;
    if (
      !["ace", "yue", "yue-mlx"].some((v) => v === engine) ||
      !["music", "sfx", "ambience"].some((v) => v === purpose) ||
      typeof seconds !== "number" ||
      !Number.isInteger(seconds)
    )
      throw new RunInputError("음원 제작 설정을 확인하세요.");
    const fx = purpose !== "music";
    if (
      (fx && engine !== "ace") ||
      seconds < (engine === "ace" ? 1 : 20) ||
      seconds > (fx ? 30 : engine === "ace" ? 600 : 360)
    )
      throw new RunInputError(
        "음향 길이와 엔진 조합을 확인하세요. 효과음은 ACE에서 1~30초입니다.",
      );
  } else if (audio !== undefined)
    throw new RunInputError("오디오 설정은 음향 작업에만 사용할 수 있습니다.");
  const directorOptions =
    director === undefined ? undefined : parseDirectorOptions(director);
  if (director !== undefined && (operation !== "plan" || !directorOptions))
    throw new RunInputError("연출 형식과 장면 수를 확인해 주세요.");
  const parsedDirector = directorOptions?.skillIds
    ? { ...directorOptions, guideSnapshot: productionGuideText(directorOptions.skillIds) }
    : directorOptions;
  const references: RunInput["references"] =
    voiceWork ? [] : chat
      ? chat.nodeIds.map((id) => {
          const selected = project.graph.nodes.find((item) => item.id === id)!;
          return {
            nodeId: selected.id, kind: selected.kind,
            title: selected.title, body: selected.body,
            ...(selected.asset?.type === "image" && ["codex", "claude"].includes(provider)
              ? { asset: selected.asset }
              : {}),
          };
        })
      : review === true
      ? reviewReferences(project.graph, node?.id ?? null)
      : snapshotReferences(
          project.graph,
          node?.id ?? null,
          operation as Operation,
          provider,
        );
  let editSource: Asset | undefined;
  if (node?.imageEdit && operation === "image") {
    const edit = node.imageEdit;
    if (!isImageEditSpec(edit))
      throw new RunInputError("이미지 편집 설정을 확인해 주세요.");
    const source = project.graph.nodes.find((item) => item.id === edit.sourceNodeId);
    const edge = project.graph.edges.find((item) =>
      item.source === edit.sourceNodeId && item.target === node.id && item.usage !== "guide",
    );
    if (!edit.sourceAsset)
      throw new RunInputError("입력 노드에 이미지를 넣고 편집 원본으로 지정해 주세요.", 422);
    const original = edit.sourceAsset;
    if (!source || !edge || source.asset?.type !== "image" ||
        source.asset.url !== original.url)
      throw new RunInputError("원본 이미지 또는 연결이 변경됐습니다. 원본에서 새 편집을 시작해 주세요.", 409);
    if (!isImageEditProvider(provider))
      throw new RunInputError("원본 이미지를 편집할 수 있는 이미지 API 또는 Codex를 선택해 주세요.", 422);
    const index = references.findIndex((reference) =>
      reference.nodeId === source.id && reference.asset?.url === original.url,
    );
    if (index < 0) throw new RunInputError("편집할 원본 이미지를 확인해 주세요.");
    const [first] = references.splice(index, 1);
    references.unshift(first);
    editSource = original;
  }
  if (operation === "video" && !media) {
    for (const ref of references) {
      if (
        (ref.role === "start" || ref.role === "end") &&
        ref.asset?.type !== "image"
      )
        throw new RunInputError(
          `‘${ref.title}’에 프레임 이미지를 먼저 적용해 주세요.`,
        );
      if (ref.role === "motion" && ref.asset?.type !== "video")
        throw new RunInputError(
          `‘${ref.title}’에 동작 참조 영상을 먼저 적용해 주세요.`,
        );
    }
    if (
      ["start", "end"].some(
        (role) => references.filter((ref) => ref.role === role).length > 1,
      )
    )
      throw new RunInputError(
        "시작 프레임과 끝 프레임은 역할별로 한 장씩 선택해 주세요.",
      );
  }
  if (review === true && !references.length)
    throw new RunInputError("검토할 대본이나 장면이 없습니다.");
  let characterSoul: RunInput["characterSoul"];
  if (node && provider === "higgsfield" && operation === "image" && Object.values(soulModels).some((id) => id === model)) {
    const actors = node.kind === "character" ? [node] : project.graph.nodes.filter((item) =>
      item.kind === "character" && references.some((ref) => ref.nodeId === item.id && ref.role === "identity"));
    const bindings = actors.flatMap((item) => item.characterIdentity?.soul ? [item] : []);
    if (bindings.length > 1)
      throw new RunInputError("Soul 이미지 작업에는 Soul ID를 연결한 캐릭터 한 명을 사용해 주세요.", 422);
    if (bindings.length === 1) {
      const soul = readyCharacterSoul(bindings[0]);
      if (!soul) throw new RunInputError("캐릭터 시트에서 Soul 학습 완료 상태를 확인해 주세요.", 422);
      if (soulModels[soul.variant] !== model)
        throw new RunInputError("캐릭터 시트의 Soul 유형과 일치하는 이미지 모델을 선택해 주세요.", 422);
      characterSoul = { id: soul.id, variant: soul.variant };
    }
  }
  if (
    JSON.stringify(references).length > 120_000 ||
    references.filter((reference) => reference.asset &&
      (!reference.nodeId || media?.assignments?.[`node:${reference.nodeId}`] !== "$text")).length > 12
  )
    throw new RunInputError(
      "참조 자료가 너무 많거나 깁니다. 연결된 자료를 줄여 주세요.",
    );
  return {
    ...(editSource ? { imageEditSource: { asset: editSource } } : {}),
    ...(node?.imageEdit && operation === "image" ? { imageEdit: structuredClone(node.imageEdit) } : {}),
    ...(node && review !== true
      ? {
          target: {
            title: node.title,
            body: node.body,
            kind: node.kind,
            guidance: {
              recipeId: effectiveGuidance(node).recipe.id,
              text: [effectiveGuidance(node).text,
                directorText(node, operation),
              ].filter(Boolean).join("\n\n"),
              ...(node.guidance?.skillIds ? { skillIds: [...node.guidance.skillIds],
                guideSnapshot: productionGuideText(node.guidance.skillIds) } : {}),
            },
            ...(node.asset ? { asset: node.asset } : {}),
          },
        }
      : {}),
    ...(review === true ? { review: true as const } : {}),
    ...(guidanceEdit === true ? { guidanceEdit: true as const } : {}),
    ...(chat ? { chat } : {}),
    ...(presetDesign ? { presetDesign } : {}),
    ...(motionDesign ? { motionDesign } : {}),
    ...(isContestBrief(contest) ? { contest } : {}),
    ...(media ? { media } : {}),
    ...(videoOptions ? { videoOptions } : {}),
    ...(imageOutput ? { imageOutput } : {}),
    ...(operation === "audio" && !voiceWork
      ? { audio: audio as NonNullable<RunInput["audio"]> }
      : {}),
    ...(characterSoul ? { characterSoul } : {}),
    ...(characterVoice ? { characterVoice } : {}),
    ...(parsedDirector ? { director: parsedDirector } : {}),
    ...(voiceWork ? { model: "seed_audio" } : model !== undefined ? { model: model as string } : {}),
    ...(isAgentEffort(effort) ? { effort } : {}),
    projectId: project.id,
    requestId,
    nodeId: node?.id ?? null,
    provider,
    operation: operation as Operation,
    prompt: node?.imageEdit && operation === "image"
      ? `${imageEditInstruction(node.imageEdit)}\n\n추가 요청: ${prompt.trim()}`
      : prompt.trim(),
    references,
  };
}
