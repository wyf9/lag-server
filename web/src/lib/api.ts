import { getSessionState } from './stores/session.svelte';

const API_URL = import.meta.env.VITE_API_URL || '';

interface FetchOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}

export async function api<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
	const { method = 'GET', body, headers = {} } = options;

	const session = getSessionState();
	if (session.token) {
		headers['Authorization'] = `Bearer ${session.token}`;
	}

	const fetchOptions: RequestInit = {
		method,
		headers: {
			...headers,
		},
	};

	if (body !== undefined) {
		fetchOptions.body = JSON.stringify(body);
		(fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
	}

	const response = await fetch(`${API_URL}${path}`, fetchOptions);

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
		throw new Error(errorData.error || `Request failed with status ${response.status}`);
	}

	return response.json() as Promise<T>;
}

export function getWsUrl(): string {
	const session = getSessionState();
	const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	const host = API_URL ? new URL(API_URL).host : location.host;
	return `${protocol}//${host}/api/ws?token=${session.token}`;
}
