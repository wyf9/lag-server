const API_URL = import.meta.env.VITE_API_URL || '';

interface FetchOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public data?: unknown,
	) {
		super(message);
	}
}

function cookie(name: string): string | undefined {
	if (typeof document === 'undefined') return undefined;
	const prefix = `${encodeURIComponent(name)}=`;
	const value = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
	return value ? decodeURIComponent(value.slice(prefix.length)) : undefined;
}

export async function api<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
	const { method = 'GET', body, headers = {} } = options;
	const normalizedMethod = method.toUpperCase();
	const requestHeaders: Record<string, string> = { ...headers };
	if (!['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) {
		const csrf = cookie('__Host-lag_csrf');
		if (csrf) requestHeaders['X-CSRF-Token'] = csrf;
	}

	const fetchOptions: RequestInit = {
		method: normalizedMethod,
		credentials: 'include',
		headers: requestHeaders,
	};
	if (body !== undefined) {
		fetchOptions.body = JSON.stringify(body);
		requestHeaders['Content-Type'] = 'application/json';
	}

	const response = await fetch(`${API_URL}${path}`, fetchOptions);
	if (!response.ok) {
		const data = await response.json().catch(() => ({ error: 'Request failed' }));
		throw new ApiError(data.error || `Request failed with status ${response.status}`, response.status, data);
	}
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

export function apiHref(path: string): string {
	return `${API_URL}${path}`;
}

export function getWsUrl(): string {
	if (API_URL) {
		const url = new URL(API_URL, location.href);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		url.pathname = '/api/ws';
		url.search = '';
		return url.toString();
	}
	const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${location.host}/api/ws`;
}
