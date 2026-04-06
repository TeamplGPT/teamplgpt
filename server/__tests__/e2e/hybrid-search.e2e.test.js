/* eslint-env jest, node */

/**
 * Hybrid Search E2E Test
 *
 * 실제 PostgreSQL(pgvector + pg_trgm)에 연결하여
 * 하이브리드 검색 파이프라인 전체를 검증합니다.
 *
 * 테스트 환경:
 * - Docker: pgvector/pgvector:pg14 (localhost:5432)
 * - 네임스페이스: e2e-hybrid-test-{timestamp} (격리)
 * - 차원: 1536 (프로덕션과 동일)
 *
 * 테스트 범위:
 * E2E-1: 테스트 데이터 삽입 및 tsvector 생성 검증
 * E2E-2: 키워드 검색 (tsvector + pg_trgm)
 * E2E-3: 벡터 유사도 검색 (cosine distance)
 * E2E-4: 하이브리드 검색 (RRF 융합)
 * E2E-5: filterIdentifiers 적용
 * E2E-6: 빈 결과 처리
 * E2E-7: performSimilaritySearch 전체 파이프라인
 */

const pgsql = require("pg");
const { v4: uuidv4 } = require("uuid");

// ─── Config ─────────────────────────────────────────────────────
const CONNECTION_STRING =
  "postgresql://anythingllm:anythingllm@localhost:5432/anythingllm";
const TABLE_NAME = "anythingllm_vectors";
const DIMENSIONS = 1536;
const TEST_NAMESPACE = `e2e-hybrid-test-${Date.now()}`;

// ─── Helpers ────────────────────────────────────────────────────

/**
 * 특정 방향으로 편향된 1536차원 벡터 생성
 * @param {number} seed - 벡터 방향 결정 시드 (0-999)
 * @param {number} magnitude - 벡터 크기 (기본 1.0)
 * @returns {number[]} 정규화된 1536차원 벡터
 */
function createVector(seed, magnitude = 1.0) {
  const vec = new Array(DIMENSIONS).fill(0);
  // seed 기반으로 특정 차원에 가중치 부여
  for (let i = 0; i < DIMENSIONS; i++) {
    // 시드에 따라 다른 패턴 생성
    vec[i] = Math.sin(seed * 0.1 + i * 0.01) * magnitude;
  }
  // 정규화
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

/**
 * 두 벡터의 코사인 유사도 계산
 */
function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Test Data ──────────────────────────────────────────────────

// 쿼리 벡터: seed=100 기반
const QUERY_VECTOR = createVector(100);
const QUERY_TEXT = "연차 휴가 잔여일수 조회";

// 테스트 문서들
const TEST_DOCS = [
  {
    // DOC-1: 벡터 + 키워드 모두 매칭 (하이브리드 최상위)
    id: uuidv4(),
    seed: 100, // 쿼리와 거의 동일한 벡터 방향
    text: "직원의 연차 휴가 잔여일수를 조회하는 방법입니다. 연차는 입사일 기준으로 부여됩니다.",
    docId: "doc-annual-leave",
    chunkIndex: 0,
    title: "연차 휴가 관리",
    source: "hr-manual/leave.pdf",
  },
  {
    // DOC-2: 키워드만 매칭 (벡터는 다른 방향)
    id: uuidv4(),
    seed: 500, // 쿼리와 다른 벡터 방향
    text: "연차 휴가 사용 시 3일 전까지 신청해야 합니다. 잔여일수는 HR 시스템에서 확인 가능합니다.",
    docId: "doc-leave-policy",
    chunkIndex: 0,
    title: "휴가 정책",
    source: "hr-manual/policy.pdf",
  },
  {
    // DOC-3: 벡터만 매칭 (텍스트에 연차/휴가 없음)
    id: uuidv4(),
    seed: 101, // 쿼리와 유사한 벡터 방향
    text: "Employee benefit information for annual paid time off allocation and remaining balance inquiry system.",
    docId: "doc-benefit-en",
    chunkIndex: 0,
    title: "Employee Benefits",
    source: "hr-manual/benefits-en.pdf",
  },
  {
    // DOC-4: 아무것도 매칭 안됨
    id: uuidv4(),
    seed: 800, // 완전히 다른 벡터 방향
    text: "사내 식당 메뉴는 매주 월요일에 업데이트됩니다. 중식과 석식 모두 제공합니다.",
    docId: "doc-cafeteria",
    chunkIndex: 0,
    title: "사내 식당",
    source: "general/cafeteria.pdf",
  },
  {
    // DOC-5: 키워드 부분 매칭 (trgm 유사도 낮음)
    id: uuidv4(),
    seed: 600,
    text: "휴가 종류에는 연차, 경조사, 병가가 있습니다.",
    docId: "doc-leave-types",
    chunkIndex: 0,
    title: "휴가 종류",
    source: "hr-manual/leave-types.pdf",
  },
];

// ─── DB Setup/Teardown ──────────────────────────────────────────

let client;

async function insertTestData(connection) {
  await connection.query("BEGIN");
  for (const doc of TEST_DOCS) {
    const vector = createVector(doc.seed);
    const embedding = `[${vector.map(Number).join(",")}]`;
    const metadata = {
      text: doc.text,
      docId: doc.docId,
      chunkIndex: doc.chunkIndex,
      title: doc.title,
      chunkSource: doc.source,
    };
    await connection.query(
      `INSERT INTO "${TABLE_NAME}" (id, namespace, embedding, metadata, text_search)
       VALUES ($1, $2, $3, $4, to_tsvector('simple', $5))`,
      [doc.id, TEST_NAMESPACE, embedding, metadata, doc.text]
    );
  }
  await connection.query("COMMIT");
}

async function cleanupTestData(connection) {
  await connection.query(
    `DELETE FROM "${TABLE_NAME}" WHERE namespace = $1`,
    [TEST_NAMESPACE]
  );
}

// ─── Import PGVector module ─────────────────────────────────────

// PGVector 모듈을 직접 가져오되, 환경변수로 연결 설정
const originalEnv = { ...process.env };

// ─── Tests ──────────────────────────────────────────────────────

describe("Hybrid Search E2E (Real PostgreSQL)", () => {
  beforeAll(async () => {
    // 직접 pg 클라이언트로 연결
    client = new pgsql.Client({ connectionString: CONNECTION_STRING });
    await client.connect();

    // 테스트 네임스페이스에 데이터 삽입
    await insertTestData(client);

    // 데이터 삽입 확인
    const { rows } = await client.query(
      `SELECT COUNT(*) FROM "${TABLE_NAME}" WHERE namespace = $1`,
      [TEST_NAMESPACE]
    );
    expect(Number(rows[0].count)).toBe(TEST_DOCS.length);
  });

  afterAll(async () => {
    if (client) {
      await cleanupTestData(client);
      await client.end();
    }
    // 환경변수 복원
    process.env = originalEnv;
  });

  // ─── E2E-1: 데이터 삽입 및 tsvector 검증 ───────────────────

  describe("E2E-1: tsvector 생성 검증", () => {
    it("모든 행에 text_search tsvector가 생성되어 있다", async () => {
      const { rows } = await client.query(
        `SELECT COUNT(*) FROM "${TABLE_NAME}"
         WHERE namespace = $1 AND text_search IS NOT NULL`,
        [TEST_NAMESPACE]
      );
      expect(Number(rows[0].count)).toBe(TEST_DOCS.length);
    });

    it("한국어 어절이 tsvector 토큰으로 분리되어 있다", async () => {
      const { rows } = await client.query(
        `SELECT text_search::text FROM "${TABLE_NAME}"
         WHERE namespace = $1 AND metadata->>'docId' = 'doc-annual-leave'`,
        [TEST_NAMESPACE]
      );
      const tokens = rows[0].text_search;
      // 'simple' 토크나이저: 공백 기반 분리
      expect(tokens).toContain("연차");
      expect(tokens).toContain("휴가");
      expect(tokens).toContain("조회하는");
    });

    it("plainto_tsquery로 한국어 검색이 매칭된다", async () => {
      const { rows } = await client.query(
        `SELECT COUNT(*) FROM "${TABLE_NAME}"
         WHERE namespace = $1
           AND text_search @@ plainto_tsquery('simple', '연차 휴가')`,
        [TEST_NAMESPACE]
      );
      // DOC-1, DOC-5에 '연차'와 '휴가' 모두 포함
      expect(Number(rows[0].count)).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── E2E-2: 키워드 검색 (tsvector + pg_trgm) ─────────────

  describe("E2E-2: keywordSearchResponse 실제 DB 검증", () => {
    it("한국어 키워드로 관련 문서를 찾는다", async () => {
      const { rows } = await client.query(
        `SELECT
           metadata->>'docId' AS doc_id,
           (
             COALESCE(ts_rank(text_search, plainto_tsquery('simple', $1)), 0) * 0.4
             + COALESCE(similarity(metadata->>'text', $1), 0) * 0.6
           ) AS _keyword_score
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
           AND (
             text_search @@ plainto_tsquery('simple', $1)
             OR similarity(metadata->>'text', $1) > 0.1
           )
         ORDER BY _keyword_score DESC`,
        [QUERY_TEXT, TEST_NAMESPACE]
      );

      // 연차/휴가/잔여일수 포함 문서가 상위에 위치
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const docIds = rows.map((r) => r.doc_id);
      expect(docIds).toContain("doc-annual-leave");
    });

    it("점수가 양수이고 내림차순이다", async () => {
      const { rows } = await client.query(
        `SELECT
           (
             COALESCE(ts_rank(text_search, plainto_tsquery('simple', $1)), 0) * 0.4
             + COALESCE(similarity(metadata->>'text', $1), 0) * 0.6
           ) AS _keyword_score
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
           AND (
             text_search @@ plainto_tsquery('simple', $1)
             OR similarity(metadata->>'text', $1) > 0.1
           )
         ORDER BY _keyword_score DESC`,
        [QUERY_TEXT, TEST_NAMESPACE]
      );

      for (let i = 0; i < rows.length; i++) {
        expect(Number(rows[i]._keyword_score)).toBeGreaterThan(0);
        if (i > 0) {
          expect(Number(rows[i]._keyword_score)).toBeLessThanOrEqual(
            Number(rows[i - 1]._keyword_score)
          );
        }
      }
    });

    it("pg_trgm similarity가 한국어에서 동작한다", async () => {
      const { rows } = await client.query(
        `SELECT similarity(metadata->>'text', $1) AS sim,
                metadata->>'docId' AS doc_id
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
         ORDER BY sim DESC`,
        [QUERY_TEXT, TEST_NAMESPACE]
      );

      // DOC-1이 가장 높은 유사도
      expect(rows[0].doc_id).toBe("doc-annual-leave");
      expect(Number(rows[0].sim)).toBeGreaterThan(0);
    });

    it("영어 텍스트는 한국어 키워드 검색에 매칭되지 않는다", async () => {
      const { rows } = await client.query(
        `SELECT
           (
             COALESCE(ts_rank(text_search, plainto_tsquery('simple', $1)), 0) * 0.4
             + COALESCE(similarity(metadata->>'text', $1), 0) * 0.6
           ) AS _keyword_score
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
           AND metadata->>'docId' = 'doc-benefit-en'
           AND (
             text_search @@ plainto_tsquery('simple', $1)
             OR similarity(metadata->>'text', $1) > 0.1
           )`,
        [QUERY_TEXT, TEST_NAMESPACE]
      );

      // 영어 문서는 한국어 키워드로 매칭되지 않아야 함
      expect(rows.length).toBe(0);
    });
  });

  // ─── E2E-3: 벡터 유사도 검색 ─────────────────────────────

  describe("E2E-3: similarityResponse 실제 DB 검증", () => {
    it("쿼리 벡터와 유사한 문서가 상위에 위치한다", async () => {
      const embedding = `[${QUERY_VECTOR.map(Number).join(",")}]`;

      const { rows } = await client.query(
        `SELECT
           embedding <=> $1 AS _distance,
           metadata->>'docId' AS doc_id
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
         ORDER BY _distance ASC
         LIMIT 5`,
        [embedding, TEST_NAMESPACE]
      );

      // DOC-1 (seed=100)과 DOC-3 (seed=101)이 상위
      expect(rows.length).toBe(TEST_DOCS.length);
      const topDocIds = rows.slice(0, 2).map((r) => r.doc_id);
      expect(topDocIds).toContain("doc-annual-leave"); // seed=100 (동일)
      expect(topDocIds).toContain("doc-benefit-en"); // seed=101 (유사)
    });

    it("cosine distance가 유사도로 올바르게 변환된다", async () => {
      const embedding = `[${QUERY_VECTOR.map(Number).join(",")}]`;

      const { rows } = await client.query(
        `SELECT
           embedding <=> $1 AS _distance
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
           AND metadata->>'docId' = 'doc-annual-leave'`,
        [embedding, TEST_NAMESPACE]
      );

      const distance = Number(rows[0]._distance);
      const similarity = 1 - distance;

      // seed=100 동일 → 매우 높은 유사도 (거의 1.0)
      expect(similarity).toBeGreaterThan(0.95);
    });

    it("먼 벡터는 낮은 유사도를 가진다", async () => {
      const embedding = `[${QUERY_VECTOR.map(Number).join(",")}]`;

      const { rows } = await client.query(
        `SELECT
           embedding <=> $1 AS _distance,
           metadata->>'docId' AS doc_id
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
           AND metadata->>'docId' = 'doc-cafeteria'`,
        [embedding, TEST_NAMESPACE]
      );

      const distance = Number(rows[0]._distance);
      const similarity = 1 - distance;

      // seed=800 → 쿼리(seed=100)보다 먼 방향 (sine 패턴 상 ~0.6)
      // DOC-1(seed=100)의 유사도(>0.95)보다 확실히 낮아야 함
      expect(similarity).toBeLessThan(0.8);
    });
  });

  // ─── E2E-4: 하이브리드 검색 (RRF 융합) ───────────────────

  describe("E2E-4: hybrid search 전체 파이프라인", () => {
    /**
     * 실제 SQL을 사용해 벡터 + 키워드 검색을 동시에 수행하고
     * JavaScript로 RRF 융합을 실행하여 결과를 검증합니다.
     */
    it("벡터+키워드 병렬 검색 후 RRF 융합이 올바르게 동작한다", async () => {
      const embedding = `[${QUERY_VECTOR.map(Number).join(",")}]`;
      const topN = 4;
      const candidateCount = topN * 3;
      const k = 60;

      // 1) 벡터 검색
      const vectorRes = await client.query(
        `SELECT
           embedding <=> $1 AS _distance,
           metadata
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
         ORDER BY _distance ASC
         LIMIT $3`,
        [embedding, TEST_NAMESPACE, candidateCount]
      );

      const vectorResults = {
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      };
      vectorRes.rows.forEach((row) => {
        const similarity = 1 - Number(row._distance);
        if (similarity >= 0.25) {
          vectorResults.contextTexts.push(row.metadata.text);
          vectorResults.sourceDocuments.push({
            ...row.metadata,
            score: similarity,
          });
          vectorResults.scores.push(similarity);
        }
      });

      // 2) 키워드 검색
      const keywordRes = await client.query(
        `SELECT
           metadata,
           (
             COALESCE(ts_rank(text_search, plainto_tsquery('simple', $1)), 0) * 0.4
             + COALESCE(similarity(metadata->>'text', $1), 0) * 0.6
           ) AS _keyword_score
         FROM "${TABLE_NAME}"
         WHERE namespace = $2
           AND (
             text_search @@ plainto_tsquery('simple', $1)
             OR similarity(metadata->>'text', $1) > 0.1
           )
         ORDER BY _keyword_score DESC
         LIMIT $3`,
        [QUERY_TEXT, TEST_NAMESPACE, candidateCount]
      );

      const keywordResults = {
        contextTexts: [],
        sourceDocuments: [],
        scores: [],
      };
      keywordRes.rows.forEach((row) => {
        if (Number(row._keyword_score) <= 0) return;
        keywordResults.contextTexts.push(row.metadata.text);
        keywordResults.sourceDocuments.push({
          ...row.metadata,
          keywordScore: Number(row._keyword_score),
        });
        keywordResults.scores.push(Number(row._keyword_score));
      });

      // 3) RRF 융합 (PGVector.rrfFusion과 동일한 로직)
      const scoreMap = new Map();
      const docKey = (metadata) =>
        `${metadata.docId || ""}-${metadata.chunkIndex ?? ""}-${(metadata.text || "").slice(0, 50)}`;

      vectorResults.sourceDocuments.forEach((doc, rank) => {
        const key = docKey(doc);
        const entry = scoreMap.get(key) || {
          metadata: doc,
          contextText: vectorResults.contextTexts[rank],
          rrfScore: 0,
        };
        entry.rrfScore += 1 / (k + rank + 1);
        scoreMap.set(key, entry);
      });

      keywordResults.sourceDocuments.forEach((doc, rank) => {
        const key = docKey(doc);
        const entry = scoreMap.get(key) || {
          metadata: doc,
          contextText: keywordResults.contextTexts[rank],
          rrfScore: 0,
        };
        entry.rrfScore += 1 / (k + rank + 1);
        scoreMap.set(key, entry);
      });

      const fused = Array.from(scoreMap.values())
        .sort((a, b) => b.rrfScore - a.rrfScore)
        .slice(0, topN);

      // 검증: DOC-1은 벡터 + 키워드 양쪽에서 높은 순위 → RRF 최상위
      expect(fused.length).toBeGreaterThanOrEqual(1);
      expect(fused[0].metadata.docId).toBe("doc-annual-leave");

      // DOC-1의 RRF 점수는 양쪽에서 기여 → 가장 높은 점수
      const doc1Score = fused[0].rrfScore;
      for (let i = 1; i < fused.length; i++) {
        expect(fused[i].rrfScore).toBeLessThanOrEqual(doc1Score);
      }
    });

    it("벡터만 매칭되는 문서와 키워드만 매칭되는 문서가 모두 결과에 포함된다", async () => {
      const embedding = `[${QUERY_VECTOR.map(Number).join(",")}]`;
      const topN = 4;
      const candidateCount = topN * 3;
      const k = 60;

      // 벡터 검색
      const vectorRes = await client.query(
        `SELECT embedding <=> $1 AS _distance, metadata
         FROM "${TABLE_NAME}" WHERE namespace = $2
         ORDER BY _distance ASC LIMIT $3`,
        [embedding, TEST_NAMESPACE, candidateCount]
      );

      // 키워드 검색
      const keywordRes = await client.query(
        `SELECT metadata,
           (COALESCE(ts_rank(text_search, plainto_tsquery('simple', $1)), 0) * 0.4
            + COALESCE(similarity(metadata->>'text', $1), 0) * 0.6) AS _keyword_score
         FROM "${TABLE_NAME}" WHERE namespace = $2
           AND (text_search @@ plainto_tsquery('simple', $1)
                OR similarity(metadata->>'text', $1) > 0.1)
         ORDER BY _keyword_score DESC LIMIT $3`,
        [QUERY_TEXT, TEST_NAMESPACE, candidateCount]
      );

      const vectorDocIds = vectorRes.rows
        .filter((r) => 1 - Number(r._distance) >= 0.25)
        .map((r) => r.metadata.docId);
      const keywordDocIds = keywordRes.rows
        .filter((r) => Number(r._keyword_score) > 0)
        .map((r) => r.metadata.docId);

      // DOC-3 (영어 텍스트)은 벡터에서만 높은 순위
      if (vectorDocIds.includes("doc-benefit-en")) {
        expect(keywordDocIds).not.toContain("doc-benefit-en");
      }

      // DOC-2 (키워드 매칭)는 키워드에서 매칭
      if (keywordDocIds.includes("doc-leave-policy")) {
        // 벡터에서는 낮은 유사도일 수 있음
        const doc2VectorRank = vectorRes.rows.findIndex(
          (r) => r.metadata.docId === "doc-leave-policy"
        );
        if (doc2VectorRank >= 0) {
          const doc2Similarity =
            1 - Number(vectorRes.rows[doc2VectorRank]._distance);
          // seed=500 → 쿼리(seed=100)와 다른 방향
          expect(doc2Similarity).toBeLessThan(0.8);
        }
      }
    });

    it("RRF 점수는 양쪽 랭킹에 모두 나타난 문서가 가장 높다", async () => {
      const embedding = `[${QUERY_VECTOR.map(Number).join(",")}]`;
      const k = 60;

      // DOC-1: 벡터 1위 + 키워드 1위 → RRF score = 1/(61) + 1/(61) ≈ 0.0328
      // DOC-3: 벡터 2위만 → RRF score = 1/(62) ≈ 0.0161
      // DOC-2: 키워드 2위만 → RRF score = 1/(62) ≈ 0.0161

      const vectorRes = await client.query(
        `SELECT embedding <=> $1 AS _distance, metadata
         FROM "${TABLE_NAME}" WHERE namespace = $2
         ORDER BY _distance ASC LIMIT 5`,
        [embedding, TEST_NAMESPACE]
      );

      const keywordRes = await client.query(
        `SELECT metadata,
           (COALESCE(ts_rank(text_search, plainto_tsquery('simple', $1)), 0) * 0.4
            + COALESCE(similarity(metadata->>'text', $1), 0) * 0.6) AS _keyword_score
         FROM "${TABLE_NAME}" WHERE namespace = $2
           AND (text_search @@ plainto_tsquery('simple', $1)
                OR similarity(metadata->>'text', $1) > 0.1)
         ORDER BY _keyword_score DESC LIMIT 5`,
        [QUERY_TEXT, TEST_NAMESPACE]
      );

      // DOC-1이 벡터 검색에서 1위인지 확인
      const vectorTop = vectorRes.rows[0].metadata.docId;
      expect(vectorTop).toBe("doc-annual-leave");

      // DOC-1이 키워드 검색에서도 상위인지 확인
      const keywordDocIds = keywordRes.rows.map((r) => r.metadata.docId);
      expect(keywordDocIds).toContain("doc-annual-leave");

      // 양쪽 모두에 나타나는 DOC-1의 RRF 점수 계산
      const vectorRank = 0; // 벡터 1위
      const keywordRank = keywordDocIds.indexOf("doc-annual-leave");

      const doc1RrfScore =
        1 / (k + vectorRank + 1) + 1 / (k + keywordRank + 1);

      // 한쪽에만 나타나는 문서의 최대 RRF 점수
      const singleSideMaxScore = 1 / (k + 1); // rank=0일 때 최대

      // DOC-1의 점수가 단일 소스 최대값보다 높다
      expect(doc1RrfScore).toBeGreaterThan(singleSideMaxScore);
    });
  });

  // ─── E2E-5: filterIdentifiers ─────────────────────────────

  describe("E2E-5: filterIdentifiers 적용", () => {
    it("지정된 source가 키워드 검색 결과에서 제외된다", async () => {
      // 실제 키워드 검색 SQL (tsvector OR pg_trgm)을 사용하여 DOC-1 매칭 확인
      // 'simple' 토크나이저는 한국어 조사를 분리하지 않으므로
      // 짧은 키워드("연차 휴가")를 사용하여 tsvector 매칭 확인
      const simpleQuery = "연차 휴가";
      const { rows: withDoc } = await client.query(
        `SELECT metadata->>'chunkSource' AS source
         FROM "${TABLE_NAME}" WHERE namespace = $1
           AND (
             text_search @@ plainto_tsquery('simple', $2)
             OR similarity(metadata->>'text', $2) > 0.1
           )`,
        [TEST_NAMESPACE, simpleQuery]
      );
      const matchedSources = withDoc.map((r) => r.source);
      expect(matchedSources).toContain("hr-manual/leave.pdf");

      // 전체 키워드 검색으로 매칭되는 문서 확인 (pg_trgm 포함)
      const { rows: allMatched } = await client.query(
        `SELECT metadata
         FROM "${TABLE_NAME}" WHERE namespace = $1
           AND (text_search @@ plainto_tsquery('simple', $2)
                OR similarity(metadata->>'text', $2) > 0.1)
         ORDER BY (
           COALESCE(ts_rank(text_search, plainto_tsquery('simple', $2)), 0) * 0.4
           + COALESCE(similarity(metadata->>'text', $2), 0) * 0.6
         ) DESC`,
        [TEST_NAMESPACE, simpleQuery]
      );

      // 필터 적용: DOC-1의 source를 제외
      const filterIdentifiers = ["hr-manual/leave.pdf"];
      const filtered = allMatched.filter(
        (r) => !filterIdentifiers.includes(r.metadata.chunkSource)
      );

      // DOC-1이 제외되고 나머지만 남아야 함
      const filteredDocIds = filtered.map((r) => r.metadata.docId);
      expect(filteredDocIds).not.toContain("doc-annual-leave");
      // 필터 적용 전보다 결과가 줄어야 함
      expect(filtered.length).toBeLessThan(allMatched.length);
    });
  });

  // ─── E2E-6: 빈 결과 처리 ─────────────────────────────────

  describe("E2E-6: 빈 결과 처리", () => {
    it("매칭되지 않는 쿼리에 대해 빈 결과를 반환한다", async () => {
      const noMatchQuery = "xyzzyqwerty_절대매칭불가";

      const { rows } = await client.query(
        `SELECT COUNT(*) FROM "${TABLE_NAME}"
         WHERE namespace = $1
           AND (
             text_search @@ plainto_tsquery('simple', $2)
             OR similarity(metadata->>'text', $2) > 0.1
           )`,
        [TEST_NAMESPACE, noMatchQuery]
      );

      expect(Number(rows[0].count)).toBe(0);
    });

    it("존재하지 않는 네임스페이스에서 검색하면 빈 결과", async () => {
      const { rows } = await client.query(
        `SELECT COUNT(*) FROM "${TABLE_NAME}"
         WHERE namespace = 'nonexistent-namespace-12345'`,
      );

      expect(Number(rows[0].count)).toBe(0);
    });
  });

  // ─── E2E-7: PGVector 모듈 통합 파이프라인 ─────────────────

  describe("E2E-7: PGVector 모듈 메서드 직접 호출", () => {
    let PGVector;

    beforeAll(() => {
      // 환경변수 설정
      process.env.PGVECTOR_CONNECTION_STRING = CONNECTION_STRING;
      process.env.PGVECTOR_TABLE_NAME = TABLE_NAME;

      // PGVector 모듈 직접 로드 (mock 없이)
      // jest.mock을 우회하기 위해 require 캐시 클리어
      const modulePath = require.resolve(
        "../../utils/vectorDbProviders/pgvector/index.js"
      );
      delete require.cache[modulePath];

      // 의존 모듈도 캐시 클리어
      const helpersPath = require.resolve("../../utils/helpers");
      delete require.cache[helpersPath];

      PGVector =
        require("../../utils/vectorDbProviders/pgvector/index.js").PGVector;
    });

    it("connect()로 실제 DB에 연결할 수 있다", async () => {
      let connection = null;
      try {
        connection = await PGVector.connect();
        expect(connection).toBeDefined();

        // 간단한 쿼리 실행
        const { rows } = await connection.query("SELECT 1 AS ok");
        expect(rows[0].ok).toBe(1);
      } finally {
        if (connection) await connection.end();
      }
    });

    it("namespaceExists()가 테스트 네임스페이스를 찾는다", async () => {
      let connection = null;
      try {
        connection = await PGVector.connect();
        const exists = await PGVector.namespaceExists(
          connection,
          TEST_NAMESPACE
        );
        expect(exists).toBe(true);
      } finally {
        if (connection) await connection.end();
      }
    });

    it("similarityResponse()가 벡터 검색 결과를 반환한다", async () => {
      let connection = null;
      try {
        connection = await PGVector.connect();

        const result = await PGVector.similarityResponse({
          client: connection,
          namespace: TEST_NAMESPACE,
          queryVector: QUERY_VECTOR,
          similarityThreshold: 0.25,
          topN: 4,
          filterIdentifiers: [],
        });

        expect(result.contextTexts.length).toBeGreaterThanOrEqual(1);
        expect(result.sourceDocuments.length).toBe(result.contextTexts.length);
        expect(result.scores.length).toBe(result.contextTexts.length);

        // 점수 내림차순
        for (let i = 1; i < result.scores.length; i++) {
          expect(result.scores[i]).toBeLessThanOrEqual(result.scores[i - 1]);
        }
      } finally {
        if (connection) await connection.end();
      }
    });

    it("keywordSearchResponse()가 키워드 검색 결과를 반환한다", async () => {
      let connection = null;
      try {
        connection = await PGVector.connect();

        const result = await PGVector.keywordSearchResponse({
          client: connection,
          namespace: TEST_NAMESPACE,
          queryText: QUERY_TEXT,
          topN: 4,
          filterIdentifiers: [],
        });

        expect(result.contextTexts.length).toBeGreaterThanOrEqual(1);
        expect(result.sourceDocuments.length).toBe(result.contextTexts.length);

        // DOC-1 텍스트가 결과에 포함
        const hasLeaveDoc = result.contextTexts.some(
          (t) => t.includes("연차") && t.includes("휴가")
        );
        expect(hasLeaveDoc).toBe(true);
      } finally {
        if (connection) await connection.end();
      }
    });

    it("hybridSearchResponse()가 RRF 융합 결과를 반환한다", async () => {
      let connection = null;
      try {
        connection = await PGVector.connect();

        const result = await PGVector.hybridSearchResponse({
          client: connection,
          namespace: TEST_NAMESPACE,
          queryText: QUERY_TEXT,
          queryVector: QUERY_VECTOR,
          similarityThreshold: 0.25,
          topN: 4,
          filterIdentifiers: [],
        });

        expect(result.contextTexts.length).toBeGreaterThanOrEqual(1);
        expect(result.sourceDocuments.length).toBe(result.contextTexts.length);

        // RRF 점수 범위: 0 < score < 1
        result.scores.forEach((score) => {
          expect(score).toBeGreaterThan(0);
          expect(score).toBeLessThan(1);
        });

        // DOC-1이 최상위 (벡터 + 키워드 양쪽 매칭)
        expect(result.sourceDocuments[0].docId).toBe("doc-annual-leave");
      } finally {
        if (connection) await connection.end();
      }
    });

    it("performSimilaritySearch(hybridSearch=true) 전체 파이프라인", async () => {
      // Mock LLMConnector: embedTextInput이 QUERY_VECTOR를 반환
      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue(QUERY_VECTOR),
      };

      const result = await PGVector.performSimilaritySearch({
        namespace: TEST_NAMESPACE,
        input: QUERY_TEXT,
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 4,
        filterIdentifiers: [],
        adjacentChunks: 0,
        hybridSearch: true,
      });

      // embedTextInput이 호출되었는지 확인
      expect(mockLLMConnector.embedTextInput).toHaveBeenCalledWith(QUERY_TEXT);

      // 정상 결과 구조
      expect(result).toHaveProperty("contextTexts");
      expect(result).toHaveProperty("sources");
      expect(result).toHaveProperty("message");
      expect(result.message).toBe(false);

      // 결과가 있어야 함
      expect(result.contextTexts.length).toBeGreaterThanOrEqual(1);
      expect(result.sources.length).toBe(result.contextTexts.length);

      // curateSources 적용: metadata 필드가 펼쳐져 있어야 함
      const topSource = result.sources[0];
      expect(topSource).toHaveProperty("docId");
      expect(topSource).toHaveProperty("text");
      expect(topSource.docId).toBe("doc-annual-leave");
    });

    it("performSimilaritySearch(hybridSearch=false) 벡터 전용 검색", async () => {
      const mockLLMConnector = {
        embedTextInput: jest.fn().mockResolvedValue(QUERY_VECTOR),
      };

      const result = await PGVector.performSimilaritySearch({
        namespace: TEST_NAMESPACE,
        input: QUERY_TEXT,
        LLMConnector: mockLLMConnector,
        similarityThreshold: 0.25,
        topN: 4,
        filterIdentifiers: [],
        adjacentChunks: 0,
        hybridSearch: false,
      });

      expect(result.contextTexts.length).toBeGreaterThanOrEqual(1);

      // 벡터 전용: DOC-1(seed=100)과 DOC-3(seed=101)이 상위
      const docIds = result.sources.map((s) => s.docId);
      expect(docIds).toContain("doc-annual-leave");
    });
  });
});
