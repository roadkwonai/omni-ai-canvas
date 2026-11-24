import path from "node:path";
import { getProject, projectExists } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { isAsset } from "@/lib/asset-shape";
import { registerCharacterAsset, RegistrationConflict } from "@/lib/character-registration-receipt";
import { parseLocalTtsOptions, plainSpeech, speechTags } from "@/lib/local-tts-options";
import { castSample, parseDialogueRequest, textSeed } from "@/lib/dialogue";
import { localTts, localTtsReady, workerDesign, type LocalTtsInput } from "@/lib/local-tts";
import { listTtsVoices, providerKey, synthesizeTts } from "@/lib/tts-provider";
import { parseTtsFilters } from "@/lib/tts-filters";
import { fishReference, localReference, localVoices, rememberSpoken, takeReference } from "@/lib/tts-reference";
import { fishCatalogueOffset, readFishCatalog } from "@/lib/fish-catalog-cache";
import { isLocalTtsModel, localDefaultVoiceId, ttsFilterValues, ttsProviderIds, ttsTextLimit, voiceIdPattern, type LocalTtsModel, type TtsProvider } from "@/lib/tts-types";
import type { Graph } from "@/lib/types";

const isProvider = (value: unknown): value is TtsProvider => ttsProviderIds.some((id) => id === value);
type Context = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store" };
// 진행률이 자주 바뀌므로 짧게 기다린다.
const localWaitMs = 1_000;

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const missing = () => bad("프로젝트를 찾을 수 없습니다.", 404);
    if (!uuid(id)) return missing();
    const query = new URL(request.url).searchParams;
    const provider = query.get("provider");
    if (!provider) {
      const [found, localModels] = await Promise.all([projectExists(id), localTtsReady()]);
      if (!found) return missing();
      const providers = Object.fromEntries(ttsProviderIds.map((item) =>
        [item, item === "local" ? Object.values(localModels).some(Boolean) : Boolean(providerKey(item))]));
      return Response.json({ providers, localModels }, { headers: noStore });
    }
    if (!isProvider(provider)) return bad("음성 서비스를 확인해 주세요.");
    const search = query.get("search") ?? "";
    const cursor = query.get("cursor") ?? "";
    const filters = parseTtsFilters({
      sort: query.get("sort") ?? "popular",
      ...Object.fromEntries(["gender", "age", "language", "tag"].map((key) => [key, query.getAll(key)])),
    });
    if (!filters || search.length > 120 || cursor.length > 512 ||
        (provider === "fish-audio" && fishCatalogueOffset(cursor) === undefined) ||
        (provider === "typecast" && cursor && !/^[1-9]\d{0,5}$/.test(cursor))) {
      return bad("검색 조건을 확인해 주세요.");
    }
    if (provider === "local") {
      const project = await getProject(id);
      return project && !project.deletedAt ? Response.json({ voices: localVoices(project.graph, search) }, { headers: noStore }) : missing();
    }
    try {
      const [found, cached] = await Promise.all([
        projectExists(id), provider === "fish-audio" ? readFishCatalog(search, cursor, filters) : undefined,
      ]);
      if (!found) return missing();
      if (cached?.cache && !cached.cache.count &&
          [filters.gender, filters.age, filters.language, filters.tag].some((value) => ttsFilterValues(value).length > 1)) {
        return bad("목소리 DB를 갱신한 뒤 다중 필터를 적용해 주세요.", 409);
      }
      const page = cached && (!cached.cache || cached.cache.count) ? cached : {
        ...await listTtsVoices(provider, search, cursor, filters),
        ...(cached ? { cache: cached.cache } : {}),
      };
      return Response.json(page, { headers: noStore });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "목소리 목록을 조회하지 못했습니다.", 422);
    }
  });
}

async function synthesizeLocally(id: string, request: { provider: TtsProvider; voiceId: string; text: string; requestId: string }, body: Record<string, unknown>) {
  const { provider, voiceId, text, requestId } = request;
  const { localModel, retakeOf } = body;
  const referenceText = typeof body.referenceText === "string" ? body.referenceText.trim() : "";
  if ((provider !== "local" && provider !== "fish-audio") || !isLocalTtsModel(localModel) ||
      referenceText.length > ttsTextLimit || [text, referenceText].some((value) => value.includes("<|"))) {
    return bad("로컬 모델, 목소리와 대사를 확인해 주세요.");
  }
  const noReference = provider === "local" && voiceId === localDefaultVoiceId;
  if (!noReference && body.rightsConfirmed !== true) return bad("이 목소리를 사용할 권한을 확인해 주세요.");
  if (retakeOf !== undefined && (!uuid(retakeOf) || localModel !== "drama-3")) return bad("다시 연기할 음성과 모델을 확인해 주세요.");
  if (localModel === "s2-pro" && Object.keys(speechTags["drama-3"].spans).some((tag) => text.includes(`<${tag}>`)))
    return bad("S2 Pro는 말을 감싸는 지시를 쓸 수 없습니다. 지시를 지우거나 Drama 3를 골라 주세요.");
  const spoken = plainSpeech(text);
  if (!spoken) return bad("소리 내어 읽을 대사를 입력해 주세요.");
  const options = parseLocalTtsOptions(body.options, { model: localModel, reference: !noReference || Boolean(retakeOf), characters: spoken.length });
  if (!options) return bad("고른 로컬 모델에서 쓸 수 있는 음성 옵션을 확인해 주세요.");
  return runLocally({
    id, requestId, model: localModel, characters: spoken.length, spoken, input: [provider, voiceId, text, localModel, referenceText, options, retakeOf],
    prepare: async (graph) => ({
      text, options, ...(retakeOf ? { retake: true, reference: await takeReference(id, String(retakeOf)) } : noReference ? {} : {
        reference: provider === "local" ? await localReference(graph, voiceId, referenceText) : await fishReference(voiceId),
      }),
    }),
  });
}

async function synthesizeDialogue(id: string, requestId: string, body: Record<string, unknown>) {
  const dialogue = parseDialogueRequest(body.dialogue);
  if (!dialogue) return bad("화자와 목소리, 대사를 확인해 주세요.");
  const { lines, cast, gap, seed } = dialogue;
  if (body.rightsConfirmed !== true && cast.some((voice) => "voiceId" in voice)) return bad("이 목소리를 사용할 권한을 확인해 주세요.");
  const spoken = lines.map(({ text }) => plainSpeech(text)).join(" ");
  const voices = cast.map(({ name }) => name);
  return runLocally({
    id, requestId, model: "drama-3", characters: spoken.length, spoken, input: dialogue,
    prepare: async (graph) => ({
      text: spoken, options: {},
      dialogue: {
        // 줄의 시드를 순서가 아니라 내용으로 정해 다른 줄을 고쳐도 같은 소리가 나게 한다.
        lines: lines.map(({ speaker, text, take }) => ({ voice: voices.indexOf(speaker), text, seed: textSeed(JSON.stringify([seed, speaker, text, take])) })),
        cast: await Promise.all(cast.map(async (voice) => {
          if (!("voiceId" in voice)) return { design: workerDesign(voice.design), seed: voice.seed, refText: castSample };
          const { file, text } = await localReference(graph, voice.voiceId, "").catch((error: Error) => {
            throw new Error(`‘${voice.name}’ 목소리: ${error.message} 한 목소리 화면에서 그 음성을 참조로 고르면 적을 수 있습니다.`);
          });
          return { refAudio: file, refText: text };
        })),
        gap,
      },
    }),
  });
}

async function runLocally({ id, requestId, model, characters, spoken, input: value, prepare }: {
  id: string; requestId: string; model: LocalTtsModel; characters: number; spoken: string; input: unknown; prepare: (graph: Graph) => Promise<LocalTtsInput>;
}) {
  const engine = localTts();
  const key = `${id}:${requestId}`;
  const input = JSON.stringify(value);
  // 이어 기다리는 요청은 DB를 거치지 않아 일시적인 연결 오류로 진행 중인 작업을 놓치지 않는다.
  let job = engine.find(key);
  if (!job) {
    const [project, ready] = await Promise.all([getProject(id), localTtsReady()]);
    if (!project || project.deletedAt) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (!ready[model]) return bad("로컬 모델을 설치한 뒤 다시 시도해 주세요.", 422);
    job = engine.start({ key, input, model, characters }, () => prepare(project.graph), (asset) => rememberSpoken(asset, spoken, id));
  }
  if (job.input !== input) return bad("같은 요청 번호로 다른 음성을 만들 수 없습니다.", 409);
  try {
    // 긴 합성에서 브라우저 응답 대기가 끊기지 않도록 나눠 기다린다. 같은 요청을 다시 보내면 이어서 기다린다.
    const asset = await job.wait(localWaitMs);
    return asset ? Response.json({ asset, marks: job.marks() }, { status: 201, headers: noStore })
      : Response.json({ progress: job.progress() }, { status: 202, headers: noStore });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "음성 생성에 실패했습니다.", 422);
  }
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const body = await jsonObject(request);
    const { provider, voiceId, requestId } = body;
    if (body.dialogue !== undefined) {
      return uuid(requestId) && body.confirmed === true ? synthesizeDialogue(id, requestId, body) : bad("대화 합성 요청을 확인해 주세요.");
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!isProvider(provider) || typeof voiceId !== "string" || !voiceIdPattern.test(voiceId) ||
        !text || text.length > ttsTextLimit || !uuid(requestId) || body.confirmed !== true) {
      return bad("서비스, 목소리와 대사를 확인해 주세요.");
    }
    if (provider === "local" || body.localModel !== undefined) return synthesizeLocally(id, { provider, voiceId, text, requestId }, body);
    if (!await projectExists(id)) return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      const asset = await registerCharacterAsset({
        directory: path.join(process.cwd(), ".scene-room", "tts-receipts"),
        projectId: id,
        nodeId: requestId,
        input: { provider, voiceId, text },
        retryConfirmed: false,
        pendingMs: 180_000,
        inProgress: "음성 생성 요청을 처리하고 있습니다.",
        reviewRequired: "이전 음성 생성 결과를 확인해 주세요.",
        parse: (value) => isAsset(value) && value.type === "audio" ? value : null,
        submit: () => synthesizeTts({ provider, voiceId, text }),
      });
      return Response.json({ asset }, { status: 201, headers: noStore });
    } catch (error) {
      if (error instanceof RegistrationConflict) {
        return Response.json({ error: error.message, code: error.code }, { status: 409 });
      }
      return bad(error instanceof Error ? error.message : "음성 생성에 실패했습니다.", 422);
    }
  });
}

export async function DELETE(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const requestId = new URL(request.url).searchParams.get("requestId");
    if (!uuid(id) || !uuid(requestId)) return bad("취소할 음성 생성을 확인해 주세요.");
    localTts().cancel(`${id}:${requestId}`);
    return Response.json({ cancelled: true }, { headers: noStore });
  });
}
