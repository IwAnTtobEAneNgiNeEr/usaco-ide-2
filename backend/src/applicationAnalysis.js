"use strict";

const crypto = require("crypto");
const ai = require("./ai");
const fileStore = require("./fileStore");
const settingsStore = require("./settingsStore");
const seeds = require("./applicationSeedRegistry");
const scenarioRegistry = require("./xuongScenarioRegistry");
const { XUONG_ANALYSIS_CACHE_FILE } = require("./config");

const TARGETS = new Set(["cpp", "frontend", "backend", "python"]);
const text = (value, max = 4000) => String(value == null ? "" : value).trim().slice(0, max);
const strings = (value, max = 8) => (Array.isArray(value) ? value : [])
  .map((item) => text(item, 300))
  .filter(Boolean)
  .slice(0, max);
const VIETNAMESE_MARKS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const VIETNAMESE_WORDS = /\b(?:và|của|cho|với|trong|khi|để|hãy|cần|không|được|thêm|xử lý|kiểm tra|chạy|trả|giữ|xây|sửa|hỗ trợ|đúng|sai)\b/i;
const META_REQUIREMENT = /^(?:introduce|add|create|propose|define)\s+(?:a\s+|an\s+|the\s+)?requirement\b|^(?:hãy\s+)?(?:giới thiệu|đề xuất|tạo|đưa ra|thêm)\s+(?:một\s+)?yêu cầu\s+(?:rằng|để|về|mới\b)/i;
const GENERIC_PATHWAY_TITLE = /\bpathway\s*\d*\b|^x\s*[·:\-]\s*(?:pathway|hướng)\b|\bv\s*\d+(?:\.\d+)*\b|\bphiên bản\s*\d+\b/i;
const ANALYSIS_CACHE_SCHEMA_VERSION = "xuong-analysis-cache.v2";
const ANALYSIS_CACHE_LIMIT = 100;
const pendingAnalyses = new Map();

function schemaError(message) {
  return Object.assign(new Error(message), { status: 502 });
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function catalogVersion(seedCatalog = seeds.listSeeds()) {
  const catalog = (seedCatalog || []).map((seed) => ({
    id: text(seed && seed.id, 100),
    title: text(seed && seed.title, 200),
    concepts: strings(seed && seed.concepts, 8),
    purpose: text(seed && seed.purpose, 600),
    fileNames: strings(seed && seed.fileNames, 30),
  })).sort((left, right) => left.id.localeCompare(right.id));
  return digest(JSON.stringify({ registry: scenarioRegistry.REGISTRY_VERSION, catalog }));
}

function analysisCacheKey(input, prompt, seedCatalog) {
  const origin = input && input.origin && input.origin.type === "problem"
    ? { problemId: String(input.origin.problemId || "") }
    : { directProblem: digest(`${input && input.inputSummary || ""}\u0000${input && input.statement || ""}`) };
  return digest(JSON.stringify({
    schemaVersion: ANALYSIS_CACHE_SCHEMA_VERSION,
    problem: origin,
    code: digest(input && input.code || ""),
    prompt: digest(prompt),
    catalog: catalogVersion(seedCatalog),
  }));
}

async function readAnalysisCache() {
  const cache = await fileStore.readJson(XUONG_ANALYSIS_CACHE_FILE, null);
  return cache && cache.schemaVersion === ANALYSIS_CACHE_SCHEMA_VERSION && cache.entries && typeof cache.entries === "object"
    ? cache
    : { schemaVersion: ANALYSIS_CACHE_SCHEMA_VERSION, entries: {} };
}

async function writeAnalysisCache(cache) {
  const entries = Object.entries(cache.entries || {})
    .filter(([, item]) => item && item.analysis && Number.isFinite(item.savedAt))
    .sort(([, left], [, right]) => right.savedAt - left.savedAt)
    .slice(0, ANALYSIS_CACHE_LIMIT);
  await fileStore.writeJson(XUONG_ANALYSIS_CACHE_FILE, {
    schemaVersion: ANALYSIS_CACHE_SCHEMA_VERSION,
    entries: Object.fromEntries(entries),
  });
}


function isNaturalVietnamese(value) {
  const content = text(value);
  return VIETNAMESE_MARKS.test(content) || VIETNAMESE_WORDS.test(content);
}

function seedMetadataTokens(seedCatalog = seeds.listSeeds()) {
  return (seedCatalog || []).flatMap((seed) => {
    const id = text(seed && seed.id, 100).toLowerCase();
    return id ? [id, id.replace(/-/g, " ")] : [];
  });
}

function hasSeedMetadata(value, seedCatalog) {
  const content = text(value).toLowerCase();
  if (/\bseed\s*id\b|\bseed\b/.test(content)) return true;
  return seedMetadataTokens(seedCatalog).some((token) => token && content.includes(token));
}

function scaffoldIdentifierTokens(seedCatalog = seeds.listSeeds()) {
  const tokens = new Set();
  for (const seed of seedCatalog || []) {
    const registered = seeds.getSeed(seed && seed.id);
    for (const [fileName, source] of Object.entries((registered && registered.files) || {})) {
      if (!/\.hpp$/i.test(fileName)) continue;
      tokens.add(fileName.toLowerCase());
      tokens.add(fileName.replace(/\.hpp$/i, "").toLowerCase());
      for (const match of String(source || "").matchAll(/\b(?:class|struct)\s+([A-Za-z_]\w*)/g)) {
        tokens.add(match[1].toLowerCase());
      }
      for (const match of String(source || "").matchAll(/\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?;/g)) {
        tokens.add(match[1].toLowerCase());
      }
    }
  }
  return [...tokens].filter((token) => token.length >= 4);
}

function hasScaffoldIdentifier(value, seedCatalog) {
  const content = text(value).toLowerCase();
  return scaffoldIdentifierTokens(seedCatalog).some((token) => (
    token.includes(".") ? content.includes(token) : new RegExp(`\\b${token}\\b`, "i").test(content)
  ));
}

function cleanDisplayTitle(value, seedCatalog) {
  let title = text(value, 160);
  title = title.replace(/\s*\(([^)]*)\)\s*$/g, (match, suffix) => (
    hasSeedMetadata(suffix, seedCatalog) ? "" : match
  )).trim();
  return title;
}

function assertVietnamese(value, field) {
  if (!isNaturalVietnamese(value)) {
    throw schemaError(`AI field ${field} must be natural Vietnamese.`);
  }
}

function assertCoachRequirement(value, field) {
  assertVietnamese(value, field);
  if (META_REQUIREMENT.test(text(value))) {
    throw schemaError(`AI field ${field} must state the requirement directly, not describe adding one.`);
  }
}

function buildAnalysisSystemPrompt(seedCatalog = seeds.listSeeds()) {
  const technicalSeeds = seedCatalog.map((seed) => {
    const concepts = strings(seed && seed.concepts, 6).join(", ") || "C++ tổng quát";
    const registered = seeds.getSeed(seed && seed.id);
    const contracts = registered
      ? Object.entries(registered.files || {})
        .filter(([fileName]) => /\.hpp$/i.test(fileName))
        .map(([fileName, source]) => `${fileName}:\n${text(source, 2200)}`)
        .join("\n")
      : "";
    return `- ${text(seed && seed.id, 100)} (${concepts})\n  Các interface được phép dùng:\n${contracts || "  (không có header)"}`;
  }).join("\n");
  return [
    "Bạn là kiến trúc sư sản phẩm biến lời giải thuật toán thành ứng dụng thực tế cho học sinh Việt Nam.",
    "Chỉ trả về đúng một JSON object. Không tự nhận code đúng; compiler và verifier mới được kết luận.",
    "Đọc đúng đề bài và code được cung cấp. Suy ra năng lực tái sử dụng và giới hạn từ nội dung thật; không tra cứu theo tên thuật toán.",
    "Đề xuất số hướng phát triển biến thiên theo chất lượng thực tế của input (có thể 0, 1 hoặc nhiều hơn). Mỗi hướng phải khác nhau về giả định bị phá, capability mới và hành vi quan sát được; nếu không có hướng đủ tin cậy thì trả ít hơn, tuyệt đối không bịa filler. Card fallback tĩnh là không hợp lệ.",
    "TOÀN BỘ nội dung dành cho người học phải viết bằng tiếng Việt tự nhiên, có dấu, giọng một HLV đang giao việc trực tiếp. Chỉ giữ English cho tên file, API, identifier và thuật ngữ kỹ thuật quen dùng.",
    "summary phải giải thích ngắn gọn em đang có gì trong lời giải. title BẮT BUỘC là tên sản phẩm bằng tiếng Việt có dấu (ví dụ 'Bản đồ cứu hộ', không viết 'BFS Pathfinder'), không phải tên seed, không có hậu tố '(… seed)', không dùng 'pathway 1', 'v2', 'phiên bản mới', 'linh hoạt' hay một nhãn kỹ thuật chung chung.",
    "purpose nói ngắn gọn sản phẩm dùng để làm gì. context nêu rõ ai đang cần nó và vướng mắc thực tế khiến nó phải tồn tại. application giải thích thuật toán đang làm việc gì bên trong sản phẩm. Ba field phải bổ sung cho nhau, không lặp ý.",
    "verification nói bằng chứng quan sát được để nghiệm thu; không dùng verification để kể lại purpose.",
    "tasks và contractCriteria phải là câu giao việc/điều kiện nghiệm thu trực tiếp. Cấm meta-phrase như 'Introduce a requirement that…', 'Add a requirement…', 'Giới thiệu một yêu cầu rằng…'.",
    "seedId là mã kỹ thuật nội bộ chỉ dùng để chọn bộ khung. Tuyệt đối không chép seedId, chữ 'seed', tên khung kỹ thuật hay metadata này vào title, purpose, verification, tasks hoặc contractCriteria.",
    "Trong title, purpose, context và application, tuyệt đối không nêu tên file, class, method, API identifier hay chi tiết scaffold. Hãy diễn đạt nhu cầu sản phẩm và vai trò của thuật toán bằng tiếng Việt đời thường; tên kỹ thuật chỉ được xuất hiện trong deliverables và phần code sau khi đã chọn project.",
    "Với mỗi hướng C++, application và tasks phải dùng được đúng các public method trong header của seedId đã chọn. Không được bịa method/API mới như canReach/getPath nếu header không có, không chọn khung dependency/topological-sort cho DSU, và không chọn weighted graph cho hành vi mà interface không đáp ứng.",
    "Mỗi hướng C++ phải là một sản phẩm mà chính scaffold, demo hiện có và verifier đã đăng ký có thể chứng minh ngay. Không được hứa thêm đường đi chi tiết, phân loại, giao diện, CLI, nhiều nguồn, lịch sử hay output mới nếu public header và demo không cung cấp hành vi đó; hãy đổi bối cảnh sử dụng nhưng giữ đúng năng lực lõi thật.",
    "deliverables chỉ nêu các file kỹ thuật có trong seed đã chọn; không tự thêm README.md hay tài liệu ngoài scaffold.",
    "Schema: {analysis:{summary:string,concepts:string[],constraints:string[],evidenceRefs:string[]},pathways:[{id,title,purpose,context,application,target:'cpp'|'frontend'|'backend'|'python',seedId,deliverables:string[],verification,tasks:string[],contractCriteria:string[]}]}. pathways có thể từ 0 đến N; không ép số lượng.",
    "Mỗi pathway phải bám một năng lực có bằng chứng source, giả định cũ, breaking event, capability mới, outcome quan sát được và vùng code có thể sửa. Registry trusted mới quyết định scenario, runner, oracle và verifier.",
    "Không sinh verifier, oracle, JSX, Canvas, renderer hoặc code preview. Không tự quyết định pass/fail.",
    "Với target=cpp, seedId bắt buộc chọn từ danh sách kỹ thuật dưới đây. Target khác chỉ là bản xem trước:",
    technicalSeeds,
  ].join("\n");
}

function normalizeAnalysis(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw schemaError("AI analysis does not match the Xưởng schema.");
  }
  const analysis = raw.analysis && typeof raw.analysis === "object" && !Array.isArray(raw.analysis)
    ? raw.analysis
    : {};
  const seedCatalog = seeds.listSeeds();
  const pathways = (Array.isArray(raw.pathways) ? raw.pathways : []).map((pathway, index) => ({
    id: text(pathway && pathway.id, 80) || `pathway-${index + 1}`,
    title: cleanDisplayTitle(pathway && pathway.title, seedCatalog),
    purpose: text(pathway && pathway.purpose, 800),
    context: text(pathway && pathway.context, 1000),
    application: text(pathway && pathway.application, 1000),
    target: TARGETS.has(pathway && pathway.target) ? pathway.target : "cpp",
    seedId: text(pathway && pathway.seedId, 100),
    deliverables: strings(pathway && pathway.deliverables),
    verification: text(pathway && pathway.verification, 500),
    tasks: strings(pathway && pathway.tasks, 12),
    contractCriteria: strings(pathway && pathway.contractCriteria, 12),
  })).filter((pathway) => pathway.title && pathway.purpose && pathway.context && pathway.application && pathway.verification);

  if (pathways.length > 20) {
    throw schemaError("AI analysis returned too many usable pathways.");
  }
  if (new Set(pathways.map((pathway) => pathway.id)).size !== pathways.length) {
    throw schemaError("AI analysis returned duplicate pathway ids.");
  }
  const normalizedSummary = text(analysis.summary, 1800);
  assertVietnamese(normalizedSummary, "analysis.summary");
  const allowedSeeds = new Set(seedCatalog.map((seed) => seed.id));
  for (const pathway of pathways) {
    if (pathway.target === "cpp" && !allowedSeeds.has(pathway.seedId)) {
      throw schemaError(`AI selected unknown seed: ${pathway.seedId || "(missing)"}.`);
    }
    const rawDisplayFields = [pathway.title, pathway.purpose, pathway.context, pathway.application, pathway.verification, ...pathway.tasks, ...pathway.contractCriteria];
    if (rawDisplayFields.some((value) => hasSeedMetadata(value, seedCatalog))) {
      throw schemaError("AI exposed an internal Xưởng seed in user-facing content.");
    }
    const productFields = [pathway.title, pathway.purpose, pathway.context, pathway.application];
    if (productFields.some((value) => hasScaffoldIdentifier(value, seedCatalog))) {
      throw schemaError("AI đã đưa tên kỹ thuật nội bộ vào card sản phẩm.");
    }
    assertVietnamese(pathway.verification, `pathways.${pathway.id}.verification`);
    pathway.tasks.forEach((item, index) => assertVietnamese(item, `pathways.${pathway.id}.tasks.${index}`));
    pathway.contractCriteria.forEach((item, index) => assertCoachRequirement(item, `pathways.${pathway.id}.contractCriteria.${index}`));
    if (pathway.target === "cpp") {
      const trustedArc = scenarioRegistry.getArc(pathway.seedId, 0);
      pathway.verification = `Chạy scenario thật và quan sát ${trustedArc.transformation.observableOutcome.toLocaleLowerCase("vi-VN")}`;
      pathway.tasks = [trustedArc.transformation.requirement];
      pathway.contractCriteria = [trustedArc.transformation.observableOutcome];
    }
    if (GENERIC_PATHWAY_TITLE.test(pathway.title)) {
      throw schemaError("AI pathway title must be a meaningful product name, not a fallback label.");
    }
    assertVietnamese(pathway.title, `pathways.${pathway.id}.title`);
    const displayFields = [pathway.title, pathway.purpose, pathway.context, pathway.application, pathway.verification, ...pathway.tasks, ...pathway.contractCriteria];
    if (displayFields.some((value) => hasSeedMetadata(value, seedCatalog))) {
      throw schemaError("AI exposed an internal Xưởng seed in user-facing content.");
    }
    assertVietnamese(pathway.purpose, `pathways.${pathway.id}.purpose`);
    assertVietnamese(pathway.context, `pathways.${pathway.id}.context`);
    assertVietnamese(pathway.application, `pathways.${pathway.id}.application`);
    assertVietnamese(pathway.verification, `pathways.${pathway.id}.verification`);
    pathway.tasks.forEach((item, index) => assertVietnamese(item, `pathways.${pathway.id}.tasks.${index}`));
    pathway.contractCriteria.forEach((item, index) => assertCoachRequirement(item, `pathways.${pathway.id}.contractCriteria.${index}`));
    if (pathway.purpose.localeCompare(pathway.verification, "vi", { sensitivity: "base" }) === 0) {
      throw schemaError("AI pathway purpose and verification must describe different information.");
    }
  }

  return {
    summary: normalizedSummary,
    concepts: strings(analysis.concepts),
    constraints: strings(analysis.constraints),
    evidenceRefs: strings(analysis.evidenceRefs),
    pathways,
  };
}

async function analyzeInput(input, { provider } = {}) {
  const seedCatalog = seeds.listSeeds();
  if (provider) return normalizeAnalysis(await provider(input, seedCatalog));

  const messages = [
    {
      role: "system",
      content: buildAnalysisSystemPrompt(seedCatalog),
    },
    {
      role: "user",
      content: JSON.stringify({
        inputSummary: input.inputSummary,
        statement: input.statement,
        code: input.code,
        target: input.target || "cpp",
        evidenceRefs: input.evidenceRefs || [],
      }),
    },
  ];
  const key = analysisCacheKey(input, messages[0].content, seedCatalog);
  const cached = (await readAnalysisCache()).entries[key];
  // Cache entries are written only after normalizeAnalysis succeeds, so they
  // are already normalized (not raw AI envelope data).
  if (cached && cached.analysis) return cached.analysis;
  if (pendingAnalyses.has(key)) return pendingAnalyses.get(key);

  const task = (async () => {
    const settings = await settingsStore.getAiSettings();
    let lastError = schemaError("AI did not return valid structured JSON.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const content = await ai.chat({ settings, jsonMode: true, maxTokens: 2600, messages });
      try {
        const parsed = ai.safeParseJson(content);
        if (!parsed) throw schemaError("AI did not return valid structured JSON.");
        const analysis = normalizeAnalysis(parsed);
        await fileStore.withLock("xuong-analysis-cache", async () => {
          const cache = await readAnalysisCache();
          cache.entries[key] = { analysis, savedAt: Date.now() };
          await writeAnalysisCache(cache);
        });
        return analysis;
      } catch (error) {
        lastError = error && error.status
          ? error
          : schemaError("AI trả về JSON không hợp lệ sau khi phân tích.");
        if (attempt === 1) break;
        messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content: `JSON vừa rồi vi phạm schema: ${lastError.message} Hãy viết lại toàn bộ JSON. Đặc biệt, title/purpose/context/application chỉ nói về nhu cầu và vai trò thuật toán bằng tiếng Việt; không nêu tên file, class, method, API, seed hay scaffold.`,
          },
        );
      }
    }
    throw lastError;
  })();
  pendingAnalyses.set(key, task);
  try {
    return await task;
  } finally {
    pendingAnalyses.delete(key);
  }
}

module.exports = {
  TARGETS,
  normalizeAnalysis,
  analyzeInput,
  buildAnalysisSystemPrompt,
  isNaturalVietnamese,
  assertCoachRequirement,
  ANALYSIS_CACHE_SCHEMA_VERSION,
  analysisCacheKey,
  catalogVersion,
};
