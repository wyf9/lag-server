import { AccessToken, type VideoGrant } from 'livekit-server-sdk';
import { TrackSource } from '@livekit/protocol';

export interface CreateVoiceTokenInput {
  roomId: string;
  userId: string;
  displayName?: string;
}

export interface CreateVoiceTokenResult {
  voiceUrl: string;
  participantToken: string;
  participantIdentity: string;
}

export async function createVoiceToken(input: CreateVoiceTokenInput): Promise<CreateVoiceTokenResult> {
  const apiKey = (process.env.LAG_VOICE_KEY ?? 'devkey').trim();
  const apiSecret = (process.env.LAG_VOICE_SECRET ?? 'secret').trim();
  const voiceUrl = (process.env.VOICE_URL ?? 'ws://localhost:7880').trim().replace(/\/+$/, '');

  const participantIdentity = input.userId;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: input.displayName ?? participantIdentity,
    ttl: '1h',
  });

  const videoGrant: VideoGrant = {
    room: input.roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  };
  token.addGrant(videoGrant);

  const participantToken = await token.toJwt();

  return {
    voiceUrl,
    participantToken,
    participantIdentity,
  };
}
