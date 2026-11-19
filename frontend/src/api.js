export const auth = '/api/auth';
export const booking = '/api/booking';

export async function request(url, { method = 'GET', token, data, signal, key } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method, signal,
      headers: {
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const error = new Error(payload?.message || 'El servicio no pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return payload;
}
