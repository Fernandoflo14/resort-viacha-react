const userFields = 'id, email, name, description, profile_image AS profileImage, created_at AS createdAt';

export function userRepository(db) {
  const select = db.prepare(`SELECT ${userFields} FROM users WHERE id = ?`);
  const login = db.prepare(`SELECT ${userFields}, password_hash AS passwordHash FROM users WHERE email = ?`);
  const create = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING ${userFields}`);
  const update = db.prepare(`UPDATE users SET name = COALESCE(?, name), description = COALESCE(?, description),
    profile_image = COALESCE(?, profile_image) WHERE id = ? RETURNING ${userFields}`);

  return {
    find: id => select.get(id),
    byEmail: email => login.get(email),
    create(email, passwordHash) {
      try {
        return create.get(email, passwordHash);
      } catch (error) {
        if (error.errcode === 2067) return null;
        throw error;
      }
    },
    update(id, fields) {
      return update.get(fields.name ?? null, fields.description ?? null, fields.profileImage ?? null, id);
    },
  };
}
