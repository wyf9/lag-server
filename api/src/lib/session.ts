import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';

let secretKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (!secretKey) {
    const envSecret = process.env.SESSION_SECRET;
    if (envSecret) {
      secretKey = new TextEncoder().encode(envSecret);
    } else {
      const generated = randomBytes(32).toString('hex');
      process.env.SESSION_SECRET = generated;
      secretKey = new TextEncoder().encode(generated);
      console.log('[session] Auto-generated SESSION_SECRET (set SESSION_SECRET env to persist across restarts)');
    }
  }
  return secretKey;
}

export interface SessionPayload {
  sub: string;
  nickname: string;
  iat: number;
  exp: number;
}

export async function createSessionToken(userId: string, nickname: string): Promise<string> {
  return new SignJWT({ nickname })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    algorithms: ['HS256'],
  });
  return payload as unknown as SessionPayload;
}
