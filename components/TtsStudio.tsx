"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { fishTagLabel } from "@/lib/fish-tag-labels";
import { optionSummary, plainSpeech, previewText, secondsRange, speechStyles, supportsDesign, type LocalTtsOptions } from "@/lib/local-tts-options";
import { requestJson as request } from "@/lib/local-tts-poll";
import { createCatalogCache, type CatalogSnapshot } from "@/lib/tts-catalog-cache";
import { assetId, fishVoiceAgeLabels, isLocalTtsModel, localDefaultVoiceId, localTtsModels, randomSeed, ttsFilterValues, ttsProviderIds, ttsProviderLabels, ttsTextLimit, type FishTranslationStatus, type LocalTtsModel, type TtsCatalog, type TtsCatalogCache, type TtsFilters, type TtsProvider, type TtsVoice } from "@/lib/tts-types";
import { fromKorean } from "@/lib/speech-markup";
import { splitSentences } from "@/lib/speech-direction";
import type { Asset } from "@/lib/types";
import type { VoiceRecommendationResult } from "@/lib/tts-recommendation";
import SpeechControls, { insertTag, SpeechTagBar, VoiceDesignControls } from "./LocalTtsControls";
import LocalTtsProgressPanel, { phaseLabels } from "./LocalTtsProgress";
import DirectionReview, { askDirections, DirectionButton, type Directed } from "./SpeechDirector";
import { useLocalTts } from "./useLocalTts";
import TtsMultiFilter from "./TtsMultiFilter";
import TtsVoiceList, { localizedVoice, requiresTranslation, voiceKey, type Translation } from "./TtsVoiceList";
import "./tts-studio.css";

type Props = {
  projectId: string;
  initialText: string;
  applyLabel: string;
  onApply: (asset: Asset, spokenText: string) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  canApply?: boolean;
  characterId?: string;
  characterText?: string;
  prepareRecommendation?: () => Promise<void>;
};
const fishPages = createCatalogCache();
const translatedQueries = new Map<string, string>();
const localModelIds = Object.keys(localTtsModels) as LocalTtsModel[];
const maxTakes = 5;
type Take = { id: string; asset: Asset; text: string; /** 지시가 든 원문. */ script: string; audition: boolean; title: string; settings: string; options?: LocalTtsOptions };
const directedText = ({ lines, made, reverted, gaps }: Directed & { gaps: string[] }) =>
  lines.map((line, index) => (reverted.includes(index) ? line.text : made[index].text) + gaps[index]).join("");
function mergeVoices(first: TtsVoice[], second: TtsVoice[]) {
  return Array.from(new Map([...first, ...second].map((voice) => [voice.id, voice])).values());
}

export default function TtsStudio({ projectId, initialText, applyLabel, onApply, onBusyChange, canApply = true, characterId, characterText, prepareRecommendation }: Props) {
  const [available, setAvailable] = useState<Partial<Record<TtsProvider, boolean>>>({});
  const [localReady, setLocalReady] = useState<Partial<Record<LocalTtsModel, boolean>>>({});
  const [fishEngine, setFishEngine] = useState<LocalTtsModel | "api">("api");
  const [localEngine, setLocalEngine] = useState<LocalTtsModel>("drama-3");
  const [rightsVoice, setRightsVoice] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [localOptions, setLocalOptions] = useState<LocalTtsOptions>({});
  const [directed, setDirected] = useState<Directed & { gaps: string[]; overall?: string; style: LocalTtsOptions["style"]; styleNote: string | undefined }>();
  const [retake, setRetake] = useState<Take>();
  const textArea = useRef<HTMLTextAreaElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [provider, setProvider] = useState<TtsProvider>("fish-audio");
  const [query, setQuery] = useState("");
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [selected, setSelected] = useState<TtsVoice>();
  const [cursor, setCursor] = useState<string>();
  const [filters, setFilters] = useState<TtsFilters>({ sort: "popular" });
  const [searchedFilters, setSearchedFilters] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagLabels, setTagLabels] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<VoiceRecommendationResult & { characterId: string }>();
  const [cache, setCache] = useState<TtsCatalogCache>();
  const [fishTranslation, setFishTranslation] = useState<FishTranslationStatus>();
  const [startingTranslation, setStartingTranslation] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshAbort = useRef<AbortController | null>(null);
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translationJobs, setTranslationJobs] = useState(0);
  const translationPending = useRef(new Set<string>());
  const translationQueue = useRef<Promise<void>>(Promise.resolve());
  const voicePool = useRef<{ scope: string; voices: TtsVoice[] }>({ scope: "", voices: [] });
  const providerSearch = useRef("");
  const [text, setText] = useState(initialText);
  const [takes, setTakes] = useState<Take[]>([]);
  const [busy, setBusy] = useState("");
  const [searching, setSearching] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const retry = useRef(new Map<string, string>());
  const catalogVersion = useRef(0);
  const endpoint = `/api/projects/${projectId}/tts`;
  const { progress, requestId: localRequest, generate, cancel } = useLocalTts(endpoint);
  const overLimit = text.trim().length > ttsTextLimit;
  const fish = provider === "fish-audio";
  const filterKey = JSON.stringify(fish ? filters : {});
  const disabled = Boolean(busy) || searching;
  const localModel = provider === "local" ? localEngine : fish && isLocalTtsModel(fishEngine) ? fishEngine : undefined;
  const needsReference = Boolean(localModel && selected && selected.id !== localDefaultVoiceId);
  const retaking = localModel === "drama-3" ? retake : undefined;
  // 한국어로 적은 지시는 고른 모델의 지시로 바꿔 쓴다.
  const cued = localModel ? fromKorean(text, localModel) : text;
  const characters = plainSpeech(cued).length;
  const usableOptions: LocalTtsOptions = localModel ? {
    ...localOptions, design: needsReference || retaking || !supportsDesign(localModel) ? undefined : localOptions.design,
    seconds: localModel === "drama-3" ? localOptions.seconds : undefined,
  } : {};
  const { min: shortest, max: longest } = secondsRange(characters);
  const badLength = usableOptions.seconds !== undefined && !(usableOptions.seconds >= shortest && usableOptions.seconds <= longest);

  useEffect(() => {
    const controller = new AbortController();
    request<{ providers: Partial<Record<TtsProvider, boolean>>; localModels: Record<LocalTtsModel, boolean> }>(endpoint, { signal: controller.signal })
      .then(({ providers, localModels }) => {
        setAvailable(providers);
        setLocalReady(localModels);
        if (!localModels["drama-3"] && localModels["s2-pro"]) setLocalEngine("s2-pro");
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("서비스 연결 상태를 불러오지 못했습니다."); });
    return () => {
      controller.abort();
      refreshAbort.current?.abort();
    };
  }, [endpoint]);

  useEffect(() => {
    if (!fish || !available["fish-audio"]) return;
    const controller = new AbortController();
    async function readTranslationStatus() {
      try {
        const status = await request<{ translation?: FishTranslationStatus }>(`${endpoint}/catalog`, { signal: controller.signal });
        if (!controller.signal.aborted && status.translation) setFishTranslation(status.translation);
      } catch { /* The catalogue remains available while the translation worker is offline. */ }
    }
    void readTranslationStatus();
    const timer = window.setInterval(() => void readTranslationStatus(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [available, endpoint, fish]);

  function tagLabel(tag: string) {
    return fishTagLabel(tag, tagLabels);
  }

  function localized(voice: TtsVoice) {
    return localizedVoice(voice, translations[voiceKey(provider, voice)]);
  }

  function needsTranslation(voice: TtsVoice) {
    const existing = localized(voice);
    return requiresTranslation(voice) && !(existing.nameKo && (!voice.description || existing.descriptionKo));
  }

  async function translatePage(voices: TtsVoice[]) {
    if (provider === "fish-audio" || provider === "local") return;
    const batch = voices.filter((voice) => {
      return needsTranslation(voice) && !translationPending.current.has(voiceKey(provider, voice));
    });
    if (!batch.length) return;
    for (const voice of batch) translationPending.current.add(voiceKey(provider, voice));
    setTranslationJobs((count) => count + 1);
    const task = translationQueue.current.then(async () => {
      for (let index = 0; index < batch.length; index += 10) {
        await Promise.all([batch.slice(index, index + 5), batch.slice(index + 5, index + 10)]
          .filter((group) => group.length).map(async (group) => {
            try {
              const { items } = await request<{ items: Translation[] }>(`${endpoint}/translations`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, items: group.map(({ id, name, description }) => ({ id, name, description })) }),
              });
              const byId = new Map(items.map((item) => [item.id, item]));
              setTranslations((previous) => ({ ...previous, ...Object.fromEntries(group.flatMap((voice) => {
                const item = byId.get(voice.id);
                return item ? [[voiceKey(provider, voice), item]] : [];
              })) }));
            } catch {
              // 번역하지 못한 항목은 목록의 번역 버튼으로 다시 요청할 수 있다.
            }
          }));
      }
    }).finally(() => {
      for (const voice of batch) translationPending.current.delete(voiceKey(provider, voice));
      setTranslationJobs((count) => count - 1);
    });
    translationQueue.current = task;
  }

  function catalogParams(search: string, currentFilters: TtsFilters, next?: string, source = provider) {
    const params = new URLSearchParams({ provider: source, ...(search ? { search } : {}), ...(next ? { cursor: next } : {}) });
    if (source === "fish-audio") for (const [key, value] of Object.entries(currentFilters)) {
      for (const selection of ttsFilterValues(value)) params.append(key, selection);
    }
    return params;
  }

  function remember(key: string, snapshot: CatalogSnapshot, append = false) {
    if (snapshot.cache?.count) fishPages.set(key, snapshot, append);
  }

  function showCatalog(snapshot: CatalogSnapshot, search: string, currentFilterKey: string) {
    providerSearch.current = snapshot.providerSearch;
    if (snapshot.cache) setCache(snapshot.cache);
    setTagLabels(snapshot.tagLabels);
    setLanguages(snapshot.languages);
    setTags((previous) => [...new Set([...previous, ...snapshot.tags])]);
    setRecommendations(undefined);
    setListVersion((version) => version + 1);
    setSearchedQuery(search);
    setSearchedFilters(currentFilterKey);
    setVoices(snapshot.voices);
    setCursor(snapshot.cursor);
    if (!snapshot.voices.length) setMessage("검색 조건에 맞는 목소리가 없습니다.");
  }

  async function loadVoices(nextFilters = filters, source = provider) {
    const fish = source === "fish-audio";
    const version = ++catalogVersion.current;
    const search = query.trim();
    const nextFilterKey = JSON.stringify(fish ? nextFilters : {});
    const pageKey = JSON.stringify([search, nextFilterKey]);
    setMessage("");
    setMoreError("");
    setLoadingMore(false);
    // 같은 조건을 다시 찾으면 새로 조회하고, 조건을 바꿔 되돌아오면 보관한 목록을 보여준다.
    const saved = fish && !(search === searchedQuery && nextFilterKey === searchedFilters) ? fishPages.get(pageKey) : undefined;
    if (saved) {
      setSearching(false);
      showCatalog(saved, search, nextFilterKey);
      return;
    }
    setSearching(true);
    try {
      const scope = JSON.stringify([source, fish ? nextFilters : {}]);
      let sentSearch = search;
      const params = catalogParams(sentSearch, nextFilters, undefined, source);
      const known = voicePool.current.scope === scope ? voicePool.current.voices : [];
      const localMatches = search ? known.filter((voice) => {
        const translated = localized(voice);
        const fields = [translated.nameKo, translated.descriptionKo, ...(voice.tags ?? []).map(tagLabel)];
        return fields.some((value) => value?.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
      }) : [];
      let catalog = await request<TtsCatalog>(`${endpoint}?${params}`);
      if (version !== catalogVersion.current) return;
      if (fish && !catalog.voices.length && !localMatches.length && /[가-힣]/.test(search)) {
        const queryEn = translatedQueries.get(search) ?? (await request<{ queryEn: string }>(`${endpoint}/translations`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: search }),
        }).catch(() => null))?.queryEn;
        if (version !== catalogVersion.current) return;
        if (queryEn && queryEn !== search) {
          translatedQueries.set(search, queryEn);
          sentSearch = queryEn;
          params.set("search", sentSearch);
          catalog = await request<TtsCatalog>(`${endpoint}?${params}`);
        }
      }
      if (version !== catalogVersion.current) return;
      voicePool.current = { scope, voices: mergeVoices(known, catalog.voices).slice(-240) };
      const snapshot: CatalogSnapshot = {
        voices: mergeVoices(catalog.voices, localMatches), cursor: catalog.nextCursor,
        providerSearch: sentSearch, tags: catalog.tags ?? [], tagLabels: catalog.tagLabels ?? {},
        languages: catalog.languages ?? [], cache: catalog.cache,
      };
      if (fish) remember(pageKey, snapshot);
      showCatalog(snapshot, search, nextFilterKey);
      if (source === "local") setSelected((current) => current ?? snapshot.voices.find((voice) => voice.id === localDefaultVoiceId));
      else if (source === provider) void translatePage(catalog.voices);
    } catch (error) {
      if (version === catalogVersion.current) setMessage(error instanceof Error ? error.message : "목소리 목록을 불러오지 못했습니다.");
    } finally {
      if (version === catalogVersion.current) setSearching(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore || searching || filterKey !== searchedFilters) return;
    const version = catalogVersion.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const catalog = await request<TtsCatalog>(`${endpoint}?${catalogParams(providerSearch.current, filters, cursor)}`);
      if (version !== catalogVersion.current) return;
      const merged = mergeVoices(voices, catalog.voices);
      setVoices(merged);
      setCursor(catalog.nextCursor);
      if (catalog.tags) setTags((previous) => [...new Set([...previous, ...catalog.tags!])]);
      const scope = JSON.stringify([provider, fish ? filters : {}]);
      const known = voicePool.current.scope === scope ? voicePool.current.voices : [];
      voicePool.current = { scope, voices: mergeVoices(known, catalog.voices).slice(-240) };
      if (fish) remember(JSON.stringify([searchedQuery, searchedFilters]), {
        voices: merged, cursor: catalog.nextCursor, providerSearch: providerSearch.current, tags, tagLabels, languages, cache,
      }, true);
    } catch (error) {
      if (version === catalogVersion.current) setMoreError(error instanceof Error ? error.message : "다음 목소리를 불러오지 못했습니다.");
    } finally {
      if (version === catalogVersion.current) setLoadingMore(false);
    }
  }

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; });
  const requestMore = useCallback(() => void loadMoreRef.current(), []);
  const selectVoice = useCallback((voice: TtsVoice) => {
    setSelected(voice);
    setRetake(undefined);
    setRightsVoice("");
    setReferenceText("");
  }, []);

  async function refreshFishCatalog() {
    if (refreshing) return;
    const controller = new AbortController();
    refreshAbort.current = controller;
    const version = catalogVersion.current;
    setRefreshing(true);
    setMessage("");
    try {
      const start = await request<TtsCatalogCache>(`${endpoint}/catalog`, { method: "POST", signal: controller.signal });
      const deadline = Date.now() + 18 * 60_000;
      let idleChecks = 0;
      while (!controller.signal.aborted && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 4500));
        if (controller.signal.aborted) return;
        const current = await request<TtsCatalogCache>(`${endpoint}/catalog`, { signal: controller.signal });
        setCache(current);
        if (!current.syncing && current.complete && current.lastSyncedAt !== start.lastSyncedAt) {
          fishPages.clear();
          if (catalogVersion.current === version) await loadVoices();
          return;
        }
        idleChecks = current.syncing ? 0 : idleChecks + 1;
        if (idleChecks >= 2) {
          setMessage("목소리 DB 갱신이 멈췄습니다. 목록 갱신에서 진행 위치부터 이어갈 수 있습니다.");
          return;
        }
      }
      if (!controller.signal.aborted) setMessage("목소리 DB를 갱신하고 있습니다. 검색은 지금도 사용할 수 있습니다.");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "목소리 DB를 갱신하지 못했습니다.");
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }

  async function resumeFishTranslation() {
    if (startingTranslation) return;
    setStartingTranslation(true);
    setMessage("");
    try {
      const status = await request<{ translation?: FishTranslationStatus }>(`${endpoint}/catalog?task=translate`, { method: "POST" });
      if (status.translation) setFishTranslation({ ...status.translation, running: status.translation.pending > status.translation.retrying });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "번역 작업을 시작하지 못했습니다.");
    } finally {
      setStartingTranslation(false);
    }
  }

  function updateFilters(next: TtsFilters) {
    setFilters(next);
    void loadVoices(next);
  }

  async function recommendVoices() {
    if (!characterId || disabled) return;
    setBusy("캐릭터에 어울리는 목소리를 찾는 중");
    setMessage("");
    onBusyChange?.(true);
    try {
      await prepareRecommendation?.();
      const result = await request<VoiceRecommendationResult>(`${endpoint}/recommend`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, filters }),
      });
      setRecommendations({ characterId, ...result });
      if (selected && !result.voices.some((voice) => voice.id === selected.id)) {
        setSelected(undefined);
      }
      void translatePage(result.voices);
      if (!result.voices.length) setMessage("캐릭터의 조건과 현재 필터에 맞는 목소리를 찾지 못했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "목소리를 추천하지 못했습니다.");
    } finally {
      setBusy("");
      onBusyChange?.(false);
    }
  }

  const review = directed && text === directedText(directed) ? directed : undefined;
  function showDirected(next: NonNullable<typeof directed>) {
    setDirected(next);
    setText(directedText(next));
  }
  async function direct() {
    if (!localModel || disabled) return;
    setBusy("AI가 대사를 읽고 연기 지시를 고르는 중");
    setMessage("");
    onBusyChange?.(true);
    try {
      const before = review?.before ?? text;
      const sentences = splitSentences(before);
      const lines = sentences.map((sentence) => ({ text: sentence.text }));
      const made = await askDirections(endpoint, localModel, lines, characterText ?? "");
      // 한 목소리의 말투는 전체에 적용되므로 모든 문장이 같은 말투일 때만 고른다.
      const style = made.every((line) => line.style === made[0].style) ? made[0].style : undefined;
      const previous = review ?? localOptions;
      setLocalOptions((current) => ({ ...current, style: style ?? previous.style, styleNote: style ? undefined : previous.styleNote }));
      showDirected({ before, lines, gaps: sentences.map(({ gap }) => gap), reverted: [], style: previous.style, styleNote: previous.styleNote,
        overall: style && speechStyles[style].label, made: made.map((line, index) => ({ ...line, style: undefined, changed: line.text !== lines[index].text })) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "연기 지시를 고르지 못했습니다.");
    } finally {
      setBusy("");
      onBusyChange?.(false);
    }
  }

  async function synthesize(audition: boolean) {
    const spoken = audition ? previewText(cued, 120) : cued.trim();
    if (!selected || !spoken || disabled || (!audition && (overLimit || badLength))) return;
    const key = JSON.stringify([provider, selected.id, spoken]);
    const requestId = localModel ? crypto.randomUUID() : retry.current.get(key) ?? crypto.randomUUID();
    if (!localModel) retry.current.set(key, requestId);
    const options: LocalTtsOptions | undefined = localModel && {
      ...usableOptions, ...(audition ? { seconds: undefined } : {}),
      seed: localOptions.seed ?? randomSeed(),
    };
    const content = { provider, voiceId: selected.id, text: spoken, confirmed: true,
      ...(localModel ? { localModel, options, retakeOf: retaking && assetId(retaking.asset), rightsConfirmed: rightsVoice === selected.id, referenceText: provider === "local" ? referenceText.trim() : "" } : {}) };
    setBusy(audition ? "샘플 생성 중" : "음성 생성 중");
    onBusyChange?.(true);
    setMessage("");
    try {
      let asset: Asset | undefined;
      if (localModel) {
        ({ asset } = await generate(requestId, content, ({ phase }) =>
          setBusy((current) => current.startsWith("음성 생성을 취소") ? current : phaseLabels[phase])));
      } else {
        ({ asset } = await request<{ asset: Asset }>(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...content, requestId }),
        }));
        retry.current.delete(key);
      }
      if (asset) {
        const take: Take = {
          id: requestId, asset, text: options ? plainSpeech(spoken) : spoken, script: text, audition: audition && spoken !== cued.trim(), options,
          title: `${localized(selected).nameKo ?? selected.name} · ${localModel ? localTtsModels[localModel].label : ttsProviderLabels[provider]}`,
          settings: options ? [optionSummary(options), `시드 ${options.seed}`].filter(Boolean).join(" · ") : "",
        };
        setTakes((previous) => [take, ...previous].slice(0, maxTakes));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "음성을 생성하지 못했습니다.");
    } finally {
      setBusy("");
      onBusyChange?.(false);
    }
  }

  function startRetake(take: Take) {
    setRetake(take);
    setText(take.script);
    // 기준 음성에 이미 적용한 속도·음정·음량을 또 적용하지 않는다.
    setLocalOptions(({ temperature, topP, topK, design }) => ({ temperature, topP, topK, design }));
    if (fish) setFishEngine("drama-3"); else setLocalEngine("drama-3");
    textArea.current?.focus();
  }

  async function cancelLocal() {
    setBusy("음성 생성을 취소하는 중");
    await cancel().catch(() => setBusy("취소 요청을 보내지 못했습니다. 생성을 계속합니다."));
  }

  async function apply(take: Take) {
    if (take.audition || disabled) return;
    setBusy("적용 중");
    onBusyChange?.(true);
    setMessage("");
    try {
      await onApply(take.asset, take.text);
      setMessage("음성을 적용했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "음성을 적용하지 못했습니다.");
    } finally {
      setBusy("");
      onBusyChange?.(false);
    }
  }

  const canSynthesize = !disabled && Boolean(selected && text.trim()) &&
    (!localModel || Boolean(localReady[localModel])) && (!needsReference || rightsVoice === selected?.id);
  const activeRecommendations = fish && recommendations?.characterId === characterId ? recommendations : undefined;
  const visibleVoices = activeRecommendations?.voices ?? voices;
  const untranslated = !fish && provider !== "local" && visibleVoices.some(needsTranslation);
  const selectedInList = selected && visibleVoices.some((voice) => voice.id === selected.id);
  const tagOptions = new Map<string, string[]>();
  for (const tag of tags) {
    const label = tagLabel(tag);
    if (["male", "female"].includes(tag.toLowerCase()) || Object.hasOwn(fishVoiceAgeLabels, tag)) continue;
    tagOptions.set(label, [...(tagOptions.get(label) ?? []), tag]);
  }
  const languageNames = new Intl.DisplayNames(["ko"], { type: "language", fallback: "none" });
  const catalogueScope = cache?.scopeCount && cache.scopeIndex !== undefined
    ? `${cache.nextLanguage ? languageNames.of(cache.nextLanguage) ?? cache.nextLanguage : "기본 목록"} · ${cache.scopeIndex + 1}/${cache.scopeCount} 범위`
    : "";
  const target = activeRecommendations?.target;
  const recommendationCriteria = [
    target?.gender ? tagLabel(target.gender) : "",
    target?.age ? fishVoiceAgeLabels[target.age] : "",
    target?.language ? languageNames.of(target.language) ?? target.language : "",
  ].filter(Boolean).join(" · ");
  return (
    <section className="tts-studio" aria-label="TTS 목소리 제작">
      <div className="tts-catalog">
      <label>음성 서비스
        <select value={provider} disabled={disabled} onChange={(event) => {
          catalogVersion.current++;
          const next = event.target.value as TtsProvider;
          setProvider(next);
          setFilters({ sort: "popular" });
          setTags([]); setTagLabels({}); setLanguages([]); setRecommendations(undefined);
          setVoices([]); setCursor(undefined); setSelected(undefined); setMessage("");
          setSearchedQuery(""); setSearchedFilters(""); setLoadingMore(false); setMoreError("");
          setRightsVoice(""); setReferenceText("");
          if (next === "local" && available.local) void loadVoices({}, next);
        }}>
          {ttsProviderIds.map((id) => <option key={id} value={id}>{ttsProviderLabels[id]}{available[id] ? "" : id === "local" ? " · 설치 필요" : " · 설정 필요"}</option>)}
        </select>
      </label>
      {!available[provider] && (provider === "local"
        ? <p>터미널에서 <code>npm run setup:local-tts</code>로 로컬 모델을 설치해 주세요.</p>
        : <p>작업실 설정에서 {ttsProviderLabels[provider]} API 키를 연결해 주세요.</p>)}
      <div className="tts-search">
        <label>목소리 검색<input value={query} maxLength={120} disabled={disabled} onChange={(event) => setQuery(event.target.value)} placeholder="목소리 이름, 설명 또는 태그"
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!disabled && available[provider]) void loadVoices(); } }} /></label>
        <button type="button" className="studio-action" disabled={disabled || !available[provider]} onClick={() => void loadVoices()}>
          <Search size={16} aria-hidden="true" /> 목소리 찾기
        </button>
      </div>
      {fish && <div className="tts-filters" aria-label="Fish Audio 목소리 필터">
        <label>정렬
          <select value={filters.sort ?? "popular"} disabled={disabled || !available[provider]}
            onChange={(event) => updateFilters({ ...filters, sort: event.target.value as TtsFilters["sort"] })}>
            <option value="popular">인기순</option><option value="recent">최신순</option>
          </select>
        </label>
        <label>성별
          <select value={ttsFilterValues(filters.gender)[0] ?? ""} disabled={disabled || !available[provider]}
            onChange={(event) => updateFilters({ ...filters, gender: event.target.value === "male" || event.target.value === "female"
              ? event.target.value : undefined })}>
            <option value="">전체</option><option value="male">남성</option><option value="female">여성</option>
          </select>
        </label>
        <TtsMultiFilter label="연령대"
          options={(Object.keys(fishVoiceAgeLabels) as (keyof typeof fishVoiceAgeLabels)[]).map((age) =>
            ({ label: fishVoiceAgeLabels[age], values: [age] }))}
          selected={ttsFilterValues(filters.age)} disabled={disabled || !available[provider]}
          onChange={(age) => updateFilters({ ...filters, age })} />
        <TtsMultiFilter label="언어"
          options={languages.map((language) => ({ label: languageNames.of(language) ?? language, values: [language] }))
            .sort((a, b) => a.label.localeCompare(b.label, "ko"))}
          selected={ttsFilterValues(filters.language)} disabled={disabled || !languages.length}
          onChange={(language) => updateFilters({ ...filters, language })} />
        <TtsMultiFilter label="Fish Audio 태그"
          options={[...tagOptions].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([label, values]) => ({ label, values }))}
          selected={ttsFilterValues(filters.tag)} disabled={disabled || !tagOptions.size}
          onChange={(tag) => updateFilters({ ...filters, tag })} />
      </div>}
      {fish && available[provider] && <div className="tts-catalog-summary">
        <p>{cache?.count ? `DB에 저장한 목소리 ${cache.count.toLocaleString()}개` : "Fish Audio 목소리 DB"}
          {(refreshing || cache?.syncing) && (catalogueScope ? ` · ${catalogueScope} 갱신 중` : " · 갱신 중")}</p>
        <button type="button" className="studio-action" data-tone="quiet" disabled={refreshing || disabled}
          onClick={() => void refreshFishCatalog()}>목록 갱신</button>
      </div>}
      {fish && fishTranslation && <div className="tts-catalog-summary">
        <p role="status">한국어 번역 저장 {fishTranslation.ready.toLocaleString()} / {fishTranslation.total.toLocaleString()}개
          {fishTranslation.running && " · 백그라운드 번역 중"}
          {!fishTranslation.running && fishTranslation.retrying > 0 && ` · 재시도 대기 ${fishTranslation.retrying.toLocaleString()}개`}</p>
        {!fishTranslation.running && fishTranslation.pending > fishTranslation.retrying && <button type="button" className="studio-action" data-tone="quiet"
          disabled={startingTranslation || disabled} onClick={() => void resumeFishTranslation()}>번역 이어받기</button>}
      </div>}
      {fish && characterId && <div className="tts-actions">
        <button type="button" className="studio-action" disabled={disabled || !available[provider]} onClick={() => void recommendVoices()}>
          <Sparkles size={16} aria-hidden="true" /> 캐릭터에 맞는 목소리 추천
        </button>
        {activeRecommendations && <button type="button" className="studio-action" data-tone="quiet" disabled={disabled}
          onClick={() => setRecommendations(undefined)}>전체 목록으로 돌아가기</button>}
      </div>}
      {recommendationCriteria && <p>캐릭터 조건 <strong>{recommendationCriteria}</strong></p>}
      {visibleVoices.length > 0 && <div className="tts-catalog-summary">
        <p role="status">{activeRecommendations ? "추천 목소리" : "불러온 목소리"} {visibleVoices.length}개{translationJobs > 0 && " · 한국어로 번역 중"}</p>
        {!fish && !translationJobs && untranslated && <button type="button" className="studio-action" data-tone="quiet"
          onClick={() => void translatePage(visibleVoices)}>한국어로 번역</button>}
      </div>}
      {visibleVoices.length > 0 && <TtsVoiceList key={`${listVersion}:${Boolean(activeRecommendations)}`} provider={provider} voices={visibleVoices} translations={translations}
        translating={translationJobs > 0} tagLabels={tagLabels} selectedId={selected?.id} disabled={disabled}
        hasMore={Boolean(cursor) && !activeRecommendations && filterKey === searchedFilters}
        loadingMore={loadingMore} moreError={moreError} onSelect={selectVoice} onMore={requestMore} />}
      {provider === "local" && localModel && selected && !needsReference && !retaking && <VoiceDesignControls model={localModel} options={localOptions} disabled={disabled}
        characterText={characterText} canUseDesignModel={Boolean(localReady["drama-3"])} onUpdate={setLocalOptions} onUseDesignModel={() => setLocalEngine("drama-3")} />}
      {selected && !selectedInList && <div className="tts-voice-preview"><p>이전 검색에서 선택한 목소리 <strong>{localized(selected).nameKo ?? selected.name}</strong></p>
        {selected.previewUrl && <audio controls preload="none" src={selected.previewUrl} aria-label={`${selected.name} 목소리 미리 듣기`} />}
      </div>}
      </div>
      <div className="tts-composition">
      {selected && <p>선택한 목소리 <strong>{localized(selected).nameKo ?? selected.name}</strong></p>}
      {(fish || provider === "local") && <label>생성 모델
        <select value={fish ? fishEngine : localEngine} disabled={disabled} onChange={(event) => {
          const value = event.target.value;
          if (fish) setFishEngine(isLocalTtsModel(value) ? value : "api");
          else if (isLocalTtsModel(value)) setLocalEngine(value);
        }}>
          {fish && <option value="api">Fish Audio S2.1 Pro · API 사용량 적용</option>}
          {localModelIds.map((model) => <option key={model} value={model} disabled={!localReady[model]}>
            {localTtsModels[model].label} · {localReady[model] ? "로컬 무료" : "설치 필요"}</option>)}
        </select>
      </label>}
      {localModel && <p>{localTtsModels[localModel].license}</p>}
      {retaking && <div className="local-tts-notice">
        <p>다시 연기할 음성 <strong>{retaking.title}</strong></p>
        <p>대사만 고치면 이 연기를 이어 가고, 감정과 말투를 고르면 목소리만 유지하고 새로 연기합니다. 앞 연기가 남으면 여러 번 만들거나 다른 대사로 만든 음성을 기준으로 쓰세요.</p>
        <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} onClick={() => setRetake(undefined)}>
          <X size={16} aria-hidden="true" /> 다시 연기 끝내기
        </button>
      </div>}
      {needsReference && selected && <>
        {provider === "local" && <label>참조 음성에서 말한 내용
          <textarea value={referenceText} maxLength={ttsTextLimit} disabled={disabled} rows={2}
            onChange={(event) => setReferenceText(event.target.value)} placeholder="비워 두면 이 컴퓨터의 Whisper가 받아씁니다." />
        </label>}
        <label className="tts-rights">
          <input type="checkbox" checked={rightsVoice === selected.id} disabled={disabled}
            onChange={(event) => setRightsVoice(event.target.checked ? selected.id : "")} />
          <span>이 목소리를 참조해 음성을 만들 권한이 있고, 실존 인물의 동의 없는 복제가 아님을 확인했습니다.</span>
        </label>
      </>}
      <label>읽을 대사
        <textarea ref={textArea} value={text} aria-invalid={overLimit} disabled={disabled} onChange={(event) => setText(event.target.value)} rows={4}
          placeholder="목소리로 만들 대사를 입력하세요." />
      </label>
      <p>{text.trim().length.toLocaleString()} / {ttsTextLimit.toLocaleString()}자 · {localModel ? "이 컴퓨터에서 무료로 생성합니다." : "짧은 합성과 음성 생성에는 API 사용량이 적용됩니다."}</p>
      {overLimit && <p role="status">한 번에 {ttsTextLimit.toLocaleString()}자까지 합성할 수 있습니다. 대사를 나눠 주세요.</p>}
      {localModel && <DirectionButton again={Boolean(review)} disabled={disabled || !characters || overLimit} onClick={() => void direct()} />}
      {localModel && review && <DirectionReview model={localModel} directed={review} overall={review.overall} disabled={disabled}
        onRevertAll={() => { setText(review.before); setLocalOptions((current) => ({ ...current, style: review.style, styleNote: review.styleNote })); setDirected(undefined); }}
        onRevert={(index) => showDirected({ ...review, reverted: review.reverted.includes(index) ? review.reverted.filter((item) => item !== index) : [...review.reverted, index] })} />}
      {localModel && <SpeechTagBar model={localModel} disabled={disabled} onInsert={(before, after) => insertTag(textArea.current, text, setText, before, after)} />}
      {localModel && <SpeechControls model={localModel} reference={needsReference && !retaking} characters={characters} options={localOptions} disabled={disabled} onUpdate={setLocalOptions} />}
      <div className="tts-submit">
      {optionSummary(usableOptions) && <p>고른 옵션 <strong>{optionSummary(usableOptions)}</strong></p>}
      {badLength && <p role="status">목표 길이는 이 대사에서 {shortest}~{longest}초로 정해 주세요.</p>}
      <div className="tts-actions">
        <button type="button" className="studio-action" disabled={!canSynthesize} onClick={() => void synthesize(true)}>
          <AudioLines size={16} aria-hidden="true" /> 짧게 합성
        </button>
        <button type="button" className="studio-action" data-tone="primary" disabled={!canSynthesize || overLimit || badLength} onClick={() => void synthesize(false)}>
          <Sparkles size={16} aria-hidden="true" /> 음성 생성
        </button>
        {localRequest && <button type="button" className="studio-action" data-tone="quiet" onClick={() => void cancelLocal()}>
          <X size={16} aria-hidden="true" /> 생성 취소
        </button>}
      </div>
      {progress && localModel && <LocalTtsProgressPanel reading={progress} modelLabel={localTtsModels[localModel].label} />}
      <p className="tts-status" role="status" data-hidden={Boolean(progress)}>{busy || (searching ? "목소리 불러오는 중" : message)}</p>
      </div>
      {takes.length > 0 && <div className="tts-result">
        <strong>만든 음성</strong>
        <ol className="tts-takes">
          {takes.map((take) => <li key={take.id}>
            <div><strong>{take.audition ? "짧은 미리 듣기 · " : ""}{take.title}</strong>
              {take.settings && <small>{take.settings}</small>}<small>{take.text.length > 60 ? `${take.text.slice(0, 60)}…` : take.text}</small></div>
            <audio controls src={take.asset.url} aria-label={`${take.title} 재생`} />
            <div className="tts-actions">
              <a className="studio-action" href={take.asset.url} download={take.asset.name}>다운로드</a>
              {!take.audition && <button type="button" className="studio-action" disabled={disabled || !canApply} onClick={() => void apply(take)}>{applyLabel}</button>}
              {take.options && localReady["drama-3"] && (fish || provider === "local") && <button type="button" className="studio-action" disabled={disabled} onClick={() => startRetake(take)}>
                <RefreshCw size={16} aria-hidden="true" /> 다시 연기</button>}
              {take.options && <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} onClick={() => setLocalOptions(take.options!)}>이 설정과 시드 쓰기</button>}
            </div>
          </li>)}
        </ol>
      </div>}
      </div>
    </section>
  );
}
