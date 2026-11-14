// ===== 手元で試すための「Google のまね」 =====
// Google に載せる前に、このPCだけでログインや保存を試すためのもの。
// 中身の処理は Google 側と同じ server-core.js を使い、保存場所だけをブラウザ（localStorage）にしている。
// ★Google に貼る Index.html には入らない（tools/build-gas.sh が外す）。

const LocalApi = (() => {
  const PREFIX = "typingPractice.mock.";
  const SESSION_HOURS = 6;

  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      // 試し用なので、保存できなくても止めない
    }
  };

  // 手元用の印（Google 側の SHA-256 のかわり。試し用なので簡単な計算で済ませる）
  const hash = (text) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    }
    return h1.toString(16) + h2.toString(16);
  };

  const deps = {
    db: {
      read: (table) => load(table, []),
      append: (table, obj) => save(table, [...load(table, []), obj]),
      remove: (table, match) => save(table, load(table, []).filter((r) => !match(r))),
      update: (table, change) => save(table, load(table, []).map((r) => change(r) || r)),
    },
    hash,
    sessions: {
      put: (token, name) => {
        const s = load("sessions", {});
        s[token] = { name, until: Date.now() + SESSION_HOURS * 3600 * 1000 };
        save("sessions", s);
      },
      get: (token) => {
        const v = load("sessions", {})[token];
        return v && v.until > Date.now() ? v.name : null;
      },
      remove: (token) => {
        const s = load("sessions", {});
        delete s[token];
        save("sessions", s);
      },
    },
    limits: {
      get: (key) => {
        const v = load("limits", {})[key];
        return v && v.until > Date.now() ? v.n : null;
      },
      put: (key, n) => {
        const s = load("limits", {});
        s[key] = { n, until: Date.now() + 15 * 60 * 1000 };
        save("limits", s);
      },
      remove: (key) => {
        const s = load("limits", {});
        delete s[key];
        save("limits", s);
      },
    },
    randomId: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    registerCode: () => LocalApi.REGISTER_CODE,
    now: () => new Date().toISOString(),
  };

  const server = createServer(deps);

  return {
    REGISTER_CODE: "れんしゅう", // 手元で試すときの登録用の合言葉
    // Google とのやりとりと同じように、少し待ってから答えを返す
    call(name, payload) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(JSON.parse(JSON.stringify(server.call(name, payload))));
          } catch (e) {
            reject(e);
          }
        }, 150);
      });
    },
  };
})();
