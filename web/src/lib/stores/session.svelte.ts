import { api, ApiError } from '$lib/api';
import { disconnectWs } from './websocket.svelte';

export interface SessionUser {
	id: string;
	nickname: string;
	avatarColor: string;
	avatarUrl?: string | null;
	email?: string | null;
	isGuest?: boolean;
	identity?: { provider?: string; issuer?: string; subject?: string } | null;
	provider?: string;
	platformRole?: string | null;
	platformAdmin?: boolean;
	identityType?: 'oauth' | 'guest';
	roles?: string[];
	grants?: Array<{ role: string; scopeType?: string; scopeId?: string | null }>;
}

export interface AuthDiscovery {
	guestEnabled: boolean;
	provider?: string;
	providerName?: string;
}

export interface SessionState {
	user: SessionUser | null;
	loaded: boolean;
	discovery: AuthDiscovery;
}

let _state = $state<SessionState>({ user: null, loaded: false, discovery: { guestEnabled: false } });
let _initializing = false;

export function getSessionState(): SessionState { return _state; }

export function isPlatformAdmin(user = _state.user): boolean {
	return Boolean(user && (
		user.platformAdmin === true ||
		user.platformRole === 'platform_admin' ||
		user.roles?.includes('platform_admin') ||
		user.grants?.some((grant) => grant.role === 'platform_admin' && (!grant.scopeType || grant.scopeType === 'platform'))
	));
}

function normalizeDiscovery(data: Record<string, unknown>): AuthDiscovery {
	const auth = typeof data.auth === 'object' && data.auth ? data.auth as Record<string, unknown> : {};
	return {
		guestEnabled: data.guestEnabled === true || auth.guestEnabled === true || data.allowGuests === true,
		provider: typeof auth.provider === 'string' ? auth.provider : typeof data.authProvider === 'string' ? data.authProvider : undefined,
		providerName: typeof auth.providerName === 'string' ? auth.providerName : typeof data.providerName === 'string' ? data.providerName : undefined,
	};
}

export async function initSession(): Promise<void> {
	if (_initializing || _state.loaded) return;
	_initializing = true;
	if (typeof window === 'undefined') {
		_state = { ..._state, loaded: true };
		_initializing = false;
		return;
	}
	const discovery = await api<Record<string, unknown>>('/api/auth/config').then((data) => {
		const provider = typeof data.provider === 'object' && data.provider ? data.provider as Record<string, unknown> : {};
		return { guestEnabled: data.guestEnabled === true, provider: typeof provider.mode === 'string' ? provider.mode : undefined, providerName: typeof provider.label === 'string' ? provider.label : undefined };
	}).catch(() => api<Record<string, unknown>>('/api/discover').then(normalizeDiscovery).catch(() => ({ guestEnabled: false })));
	try {
		const data = await api<{ user: SessionUser }>('/api/session');
		_state = { user: data.user, loaded: true, discovery };
	} catch (error) {
		if (!(error instanceof ApiError) || ![401, 404].includes(error.status)) console.warn('Session discovery failed', error);
		_state = { user: null, loaded: true, discovery };
	}
	_initializing = false;
}

export async function createSession(nickname: string): Promise<void> {
	const data = await api<{ user: SessionUser }>('/api/session', { method: 'POST', body: { nickname } });
	_state = { ..._state, user: { ...data.user, isGuest: data.user.isGuest ?? data.user.identityType === 'guest' }, loaded: true };
}

export async function updateNickname(nickname: string): Promise<void> {
	const data = await api<{ user: SessionUser }>('/api/session', { method: 'PATCH', body: { nickname } });
	_state = { ..._state, user: { ..._state.user, ...data.user } };
}

export async function logout(): Promise<boolean> {
	disconnectWs();
	let logoutUrl: string | undefined;
	try {
		const result = await api<{ logoutUrl?: string }>('/api/auth/logout', { method: 'POST' });
		logoutUrl = result?.logoutUrl;
	} finally {
		_state = { ..._state, user: null, loaded: true };
	}
	if (logoutUrl && typeof window !== 'undefined') {
		window.location.assign(logoutUrl);
		return true;
	}
	return false;
}

export function clearSession(): void {
	disconnectWs();
	_state = { ..._state, user: null, loaded: true };
}
