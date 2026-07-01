const USER_ID_KEY = 'wc_user_id';

function createUserId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `user_${crypto.randomUUID()}`;
  }
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function getLocalUserId(): string {
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = createUserId();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch {
    return createUserId();
  }
}
