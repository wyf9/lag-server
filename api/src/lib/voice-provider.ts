import { AccessToken, RoomServiceClient, type VideoGrant } from 'livekit-server-sdk';
import { TrackSource } from '@livekit/protocol';
import { getConfig } from '../config.js';

export interface CreateVoiceTokenInput {
  roomId: string;
  userId: string;
  displayName?: string;
  canPublish: boolean;
}

export interface CreateVoiceTokenResult {
  voiceUrl: string;
  participantToken: string;
  participantIdentity: string;
}

export async function createVoiceToken(input: CreateVoiceTokenInput): Promise<CreateVoiceTokenResult> {
  const { voiceKey: apiKey, voiceSecret: apiSecret, voiceUrl } = getConfig();

  const participantIdentity = input.userId;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: input.displayName ?? participantIdentity,
    ttl: '1h',
  });

  const videoGrant: VideoGrant = {
    room: input.roomId,
    roomJoin: true,
    canPublish: input.canPublish,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: input.canPublish
      ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [],
  };
  token.addGrant(videoGrant);

  const participantToken = await token.toJwt();

  return {
    voiceUrl,
    participantToken,
    participantIdentity,
  };
}

function roomService(): RoomServiceClient {
  const config = getConfig();
  return new RoomServiceClient(config.voiceUrl.replace(/^ws/, 'http'), config.voiceKey, config.voiceSecret);
}

export async function updateVoicePermissions(roomId: string, userId: string, publish: boolean): Promise<void> {
  try {
    await roomService().updateParticipant(roomId, userId, undefined, {
      canPublish: publish,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: publish
        ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : [],
    });
  } catch (error) {
    if (!String(error).toLowerCase().includes('not found')) throw error;
  }
}

export async function removeVoiceParticipant(roomId: string, userId: string): Promise<void> {
  try { await roomService().removeParticipant(roomId, userId); }
  catch (error) { if (!String(error).toLowerCase().includes('not found')) throw error; }
}
