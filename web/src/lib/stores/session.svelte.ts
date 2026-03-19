import { api } from '$lib/api';

const SESSION_STORAGE_KEY = 'lag:self-host:session';

export interface SessionUser {
	id: string;
	nickname: string;
	avatarColor: string;
}

export interface SessionState {
	token: string | null;
	user: SessionUser | null;
	loaded: boolean;
}

let _state = $state<SessionState>({
	token: null,
	user: null,
	loaded: false,
});

export function getSessionState(): SessionState {
	return _state;
}

function persist(): void {
	if (typeof window === 'undefined') return;
	if (_state.token && _state.user) {
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: _state.token, user: _state.user }));
	} else {
		localStorage.removeItem(SESSION_STORAGE_KEY);
	}
}

let _initializing = false;

export async function initSession(): Promise<void> {
	if (_initializing) return;
	_initializing = true;

	if (typeof window === 'undefined') {
		_state = { ..._state, loaded: true };
		_initializing = false;
		return;
	}

	try {
		const raw = localStorage.getItem(SESSION_STORAGE_KEY);
		if (!raw) {
			_state = { token: null, user: null, loaded: true };
			_initializing = false;
			return;
		}

		const saved = JSON.parse(raw) as { token: string; user: SessionUser };

		const data = await api<{ user: SessionUser }>('/api/session', {
			headers: { Authorization: `Bearer ${saved.token}` },
		});

		_state = { token: saved.token, user: data.user, loaded: true };
	} catch {
		localStorage.removeItem(SESSION_STORAGE_KEY);
		_state = { token: null, user: null, loaded: true };
	}

	_initializing = false;
}

export async function createSession(nickname: string): Promise<void> {
	const data = await api<{ token: string; user: SessionUser }>('/api/session', {
		method: 'POST',
		body: { nickname },
	});

	_state = { token: data.token, user: data.user, loaded: true };
	persist();
}

export async function updateNickname(nickname: string): Promise<void> {
	const data = await api<{ user: SessionUser }>('/api/session', {
		method: 'PATCH',
		body: { nickname },
	});

	_state = { ..._state, user: data.user };
	persist();
}

export function clearSession(): void {
	_state = { token: null, user: null, loaded: true };
	persist();
}
