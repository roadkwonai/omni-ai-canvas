import { higgsfieldProfiles } from "./higgsfield-models";
import { klingProfiles } from "./kling";
import { topviewProfiles } from "./topview";
import {
  mediaModelProvider,
  mediaOperation,
  type MediaOperation,
  type MediaProvider,
} from "./media-model-types";
import { MediaInputError, resolveMedia } from "./media-request";
import type { RunInput } from "./types";

export async function getMediaProfiles(
  provider: MediaProvider,
  model: string,
  operation: MediaOperation,
) {
  if (provider === "higgsfield") return higgsfieldProfiles(model, operation);
  if (provider === "kling") return klingProfiles(model, operation);
  return topviewProfiles(model, operation);
}

export async function prepareMedia(input: RunInput) {
  if (!input.media) return undefined;
  if (!mediaModelProvider(input.provider) || !input.model || !mediaOperation(input.operation))
    throw new MediaInputError("사용 가능한 이미지·영상 모델을 선택해 주세요.");
  const profiles = await getMediaProfiles(input.provider, input.model, input.operation)
    .catch(() => { throw new MediaInputError("서비스의 모델 사양을 조회하지 못했습니다. 연결을 확인해 주세요."); });
  const profile = profiles.find((item) => item.mode === input.media?.mode);
  if (!profile)
    throw new MediaInputError("선택한 모델의 작업 방식이 변경됐습니다. 모델 목록을 새로고침해 주세요.");
  return { profile, resolved: resolveMedia(profile, input) };
}
