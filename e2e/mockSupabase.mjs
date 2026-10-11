/**
 * 테스트용 Supabase 흉내 서버 — 서버가 쓰는 만큼만 흉내 낸다.
 *
 *  - PostgREST: schoolfix_store 표의 조회(GET)·추가(POST)·조건부 수정(PATCH, updated_at=eq.…)
 *  - Storage: 버킷 만들기, 파일 올리기·내려받기·지우기·목록
 *
 * 진짜 Supabase 처럼 updated_at 을 "2026-10-11T03:00:00.123+00:00" 꼴로 돌려주고,
 * 문서 키는 supabase/schema.sql 의 허용 목록만 받는다(그 밖은 check 제약 위반).
 */

import http from "node:http";

const ALLOWED_KEYS = ["reports", "school_applications", "custom_schools", "blocked_reporters", "settings", "staff_accounts", "staff_sessions", "push_subscriptions", "audit_log"];

function pgTimestamp(value) {
  return new Date(value).toISOString().replace("Z", "+00:00");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json", ...headers });
  res.end(payload);
}

function pick(row, select) {
  if (!select || select === "*") return { ...row };
  return Object.fromEntries(select.split(",").map((column) => [column, row[column]]));
}

/** 필터 값 "eq.xxx" → "xxx" */
function eq(value) {
  return typeof value === "string" && value.startsWith("eq.") ? value.slice(3) : null;
}

export function startMockSupabase({ port = 0, apiKey = "sb_secret_test", allowedKeys = ALLOWED_KEYS } = {}) {
  const rows = new Map();
  const buckets = new Map();
  const stats = { patchConflicts: 0, insertConflicts: 0, writes: 0 };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.apikey !== apiKey) return send(res, 401, { message: "Invalid API key" });
      const url = new URL(req.url, "http://localhost");
      const body = await readBody(req);
      const prefer = String(req.headers.prefer ?? "");

      // --- PostgREST -----------------------------------------------------
      if (url.pathname === "/rest/v1/schoolfix_store") {
        const keyFilter = eq(url.searchParams.get("key"));
        const versionFilter = eq(url.searchParams.get("updated_at"));
        const select = url.searchParams.get("select");
        const matches = () => [...rows.values()].filter((row) =>
          (keyFilter === null || row.key === keyFilter)
          && (versionFilter === null || Date.parse(row.updated_at) === Date.parse(versionFilter)));

        if (req.method === "GET") {
          const limit = Number(url.searchParams.get("limit")) || Infinity;
          return send(res, 200, matches().slice(0, limit).map((row) => pick(row, select)));
        }
        if (req.method === "POST") {
          const input = JSON.parse(body.toString("utf8"));
          if (!allowedKeys.includes(input.key)) return send(res, 400, { code: "23514", message: "new row violates check constraint \"schoolfix_store_key_check\"" });
          const exists = rows.has(input.key);
          if (exists && !/resolution=merge-duplicates/.test(prefer)) {
            stats.insertConflicts += 1;
            return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
          }
          const row = { key: input.key, payload: input.payload, updated_at: pgTimestamp(input.updated_at ?? Date.now()) };
          rows.set(row.key, row);
          stats.writes += 1;
          return /return=representation/.test(prefer) ? send(res, 201, [pick(row, select)]) : send(res, 201, undefined);
        }
        if (req.method === "PATCH") {
          const input = JSON.parse(body.toString("utf8"));
          const targets = matches();
          if (targets.length === 0 && versionFilter !== null) stats.patchConflicts += 1;
          for (const row of targets) {
            if ("payload" in input) row.payload = input.payload;
            if ("updated_at" in input) row.updated_at = pgTimestamp(input.updated_at);
            stats.writes += 1;
          }
          return /return=representation/.test(prefer) ? send(res, 200, targets.map((row) => pick(row, select))) : send(res, 204, undefined);
        }
        return send(res, 405, { message: "method not allowed" });
      }

      // --- Storage -------------------------------------------------------
      if (url.pathname === "/storage/v1/bucket" && req.method === "POST") {
        const input = JSON.parse(body.toString("utf8"));
        if (buckets.has(input.id)) return send(res, 409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        buckets.set(input.id, new Map());
        return send(res, 200, { name: input.id });
      }
      const listMatch = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(url.pathname);
      if (listMatch && req.method === "POST") {
        const bucket = buckets.get(decodeURIComponent(listMatch[1]));
        if (!bucket) return send(res, 400, { message: "Bucket not found" });
        const input = JSON.parse(body.toString("utf8"));
        const prefix = input.prefix ? `${input.prefix}/` : "";
        const items = [...bucket.entries()]
          .filter(([name]) => name.startsWith(prefix) && !name.slice(prefix.length).includes("/"))
          .map(([name, object]) => ({ name: name.slice(prefix.length), created_at: object.createdAt, metadata: { size: object.body.length } }))
          .sort((a, b) => (input.sortBy?.order === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
        return send(res, 200, items.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 100)));
      }
      const bucketOnly = /^\/storage\/v1\/object\/([^/]+)$/.exec(url.pathname);
      if (bucketOnly && req.method === "DELETE") {
        const bucket = buckets.get(decodeURIComponent(bucketOnly[1]));
        if (!bucket) return send(res, 400, { message: "Bucket not found" });
        const input = JSON.parse(body.toString("utf8"));
        for (const name of input.prefixes ?? []) bucket.delete(name);
        return send(res, 200, []);
      }
      const objectMatch = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (objectMatch) {
        const bucket = buckets.get(decodeURIComponent(objectMatch[1]));
        const name = objectMatch[2].split("/").map(decodeURIComponent).join("/");
        if (!bucket) return send(res, 400, { message: "Bucket not found" });
        if (req.method === "POST" || req.method === "PUT") {
          if (bucket.has(name) && req.headers["x-upsert"] !== "true") return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
          bucket.set(name, { body, contentType: req.headers["content-type"], createdAt: new Date().toISOString() });
          return send(res, 200, { Key: `${objectMatch[1]}/${name}` });
        }
        if (req.method === "GET") {
          const object = bucket.get(name);
          if (!object) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
          return send(res, 200, object.body, { "Content-Type": object.contentType ?? "application/octet-stream" });
        }
      }
      return send(res, 404, { message: `mock: ${req.method} ${url.pathname} 없음` });
    } catch (err) {
      return send(res, 500, { message: String(err) });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        rows,
        buckets,
        stats,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
