/**
 * Código de ejemplo: nada de esto pertenece al framework.
 *
 * Es un servicio con las tres cosas que más cuesta testear en la vida real —
 * red, tiempo y caché — para enseñar cómo se cubren con spies y fake timers.
 */
export class UserService {
  constructor({ fetch, cacheTtlMs = 60_000, maxRetries = 2 } = {}) {
    this.fetch = fetch;
    this.cacheTtlMs = cacheTtlMs;
    this.maxRetries = maxRetries;
    this.cache = new Map();
  }

  async getUser(id) {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.storedAt < this.cacheTtlMs) {
      return cached.value;
    }

    const user = await this.fetchWithRetry(`/api/users/${id}`);
    this.cache.set(id, { value: user, storedAt: Date.now() });
    return user;
  }

  async fetchWithRetry(url, attempt = 0) {
    const response = await this.fetch(url);

    if (response.ok) return response.body;

    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt >= this.maxRetries) {
      throw new Error(`La petición a ${url} falló con ${response.status}`);
    }

    await delay(2 ** attempt * 100);
    return this.fetchWithRetry(url, attempt + 1);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}