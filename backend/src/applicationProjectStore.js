"use strict";

const crypto = require("crypto");
const path = require("path");
const fileStore = require("./fileStore");
const settingsStore = require("./settingsStore");
const problemStore = require("./problemStore");
const ai = require("./ai");
const { analyzeInput, assertCoachRequirement, isNaturalVietnamese } = require("./applicationAnalysis");
const seedRegistry = require("./applicationSeedRegistry");
const projectVerifier = require("./projectVerifier");
const projectDemoRunner = require("./projectDemoRunner");
const runtime = require("./xuongRuntime");
const scenarioRegistry = require("./xuongScenarioRegistry");
const { APPLICATION_PROJECTS_DIR, APPLICATION_SESSIONS_DIR, LIMITS } = require("./config");

const now = () => new Date().toISOString();
const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const sessionPath = (sessionId) => path.join(APPLICATION_SESSIONS_DIR, sessionId, "session.json");
const projectDir = (projectId) => path.join(APPLICATION_PROJECTS_DIR, projectId);
const projectPath = (projectId) => path.join(projectDir(projectId), "project.json");

function safeId(value, prefix) {
  const normalized = String(value || "");
  if (!new RegExp(`^${prefix}-[a-f0-9-]{36}$`).test(normalized)) throw fail(`Invalid ${prefix} id.`);
  return normalized;
}

function safeFilePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")
      || !/^[A-Za-z0-9_.\-/]+$/.test(normalized)) throw fail("Invalid project file path.");
  return normalized;
}

function publicSession(session) {
  return {
    id: session.id,
    status: session.status,
    origin: session.origin,
    analysis: session.analysis,
    pathways: (session.pathways || []).map((pathway) => {
      const registered = seedRegistry.getSeed(pathway.seedId);
      if (!registered) return null;
      return runtime.publicPathway(pathway, seedRegistry.materializeSeed(pathway.seedId).files);
    }).filter(Boolean),
    selectedPathwayId: session.selectedPathwayId,
    projectId: session.projectId,
  };
}

function publicProject(project, { includeSource = true } = {}) {
  const activeStage = Math.max(0, Number(project._stageIndex) || 0);
  const arc = scenarioRegistry.getArc(project._seedId, activeStage);
  if (!arc) throw fail("Project không có ScenarioSpec trusted.", 500);
  const mappings = runtime.sourceMappings(project);
  const requirements = project._v2Requirements || [{ id: "trusted-change", state: "candidate", failureEvidenceIds: [], passEvidenceIds: [] }];
  const requirement = requirements[activeStage] || requirements.at(-1);
  const requirementState = requirement.state || "candidate";
  const status = requirementState === "met" ? "ready" : requirementState === "failing" ? "needs-attention" : "building";
  const fileDisplay = (file) => ({
    label: file.path,
    description: file.editable
      ? `File em sửa trong build này · ${arc.sourceLabel}`
      : /\.hpp$/i.test(file.path)
        ? "Giao diện công khai · chỉ đọc"
        : /requirement-change/i.test(file.path)
          ? "Scenario test của build hiện tại · chỉ đọc"
          : /demo\//.test(file.path)
            ? "Chương trình demo · chỉ đọc"
            : "Kiểm tra hồi quy · chỉ đọc",
  });
  const fallbackMain = String(arc.buildHarness({ header: (project.files || []).find((file) => /\.hpp$/i.test(file.path))?.path || "Component.hpp" }))
    .split("\n")
    .filter((line) => !line.trim().startsWith("#include"))
    .join("\n")
    .trim();
  const learningBridge = {
    intro: arc.learningBridge?.intro || "Vẫn là C++ em đang dùng. main() nằm trong file scenario; file .cpp chỉ giữ phần xử lý để sản phẩm gọi lại.",
    familiarCode: arc.learningBridge?.familiarCode || fallbackMain,
    editInstruction: arc.learningBridge?.editInstruction || `Chỉ sửa TODO gần ${arc.sourceLabel}; các hàm còn lại là phần nền đã có.`,
    fileRoles: arc.learningBridge?.fileRoles || [
      { suffix: ".hpp", label: "Giao diện", description: "Tên class và các hàm mà chương trình có thể gọi; chỉ đọc." },
      { suffix: ".cpp", label: "Phần em sửa", description: "Thuật toán được tách khỏi main(); sửa đúng vùng TODO." },
      { suffix: ".requirement-change.test.cpp", label: "Cách app gọi code", description: "main() của scenario và điều kiện kết quả; chỉ đọc." },
    ],
  };
  return {
    id: project.id,
    display: { label: arc.productTitle || project.title, description: arc.display.description },
    status,
    sourceRevision: runtime.sourceRevision(project.files),
    brief: {
      context: project.pathway && project.pathway.context || "Một nhóm cần hệ thống phản ứng đúng khi tình huống thay đổi.",
      application: project.pathway && project.pathway.application || arc.capability.summary,
      mission: arc.transformation.requirement,
      doneWhen: arc.transformation.observableOutcome,
    },
    learningBridge,
    capability: { summary: arc.capability.summary, capabilities: [{ id: "core-capability", display: { label: arc.capability.label }, evidence: mappings.length ? [{ mappingId: mappings[0].id, claim: arc.capability.claim }] : [] }], constraints: [arc.transformation.oldAssumption] },
    transformation: { oldAssumption: arc.transformation.oldAssumption, breakingEvent: arc.transformation.breakingEvent, newCapability: arc.transformation.newCapability, observableOutcome: arc.transformation.observableOutcome, editableMappingIds: mappings.map((mapping) => mapping.id) },
    files: (project.files || []).map((file) => ({
      path: file.path, display: fileDisplay(file), editable: Boolean(file.editable),
      ...(includeSource ? { source: String(file.content == null ? "" : file.content), ...(file.editable ? { contentHash: runtime.hash(file.content) } : {}) } : {}),
    })),
    ...(includeSource ? { sourceMappings: mappings } : {}),
    scenarios: Array.from({ length: activeStage + 1 }, (_, index) => runtime.scenarioSummary(scenarioRegistry.getArc(project._seedId, index))),
    growth: [{ id: "baseline", display: { label: "Năng lực hiện có" }, state: "present" }].concat(Array.from({ length: activeStage + 1 }, (_, index) => {
      const stageArc = scenarioRegistry.getArc(project._seedId, index);
      const stageRequirement = requirements[index];
      return { id: stageRequirement.id, display: { label: stageArc.transformation.newCapability }, state: stageRequirement.state === "met" ? "present" : "current" };
    })).concat([{ id: "next", display: { label: "Mở rộng tình huống tiếp theo" }, state: "next" }]),
    requirements: Array.from({ length: activeStage + 1 }, (_, index) => {
      const stageArc = scenarioRegistry.getArc(project._seedId, index);
      const stageRequirement = requirements[index];
      return { id: stageRequirement.id, display: { label: stageArc.transformation.requirement }, state: stageRequirement.state, verifierIds: stageRequirement.verifierIds || [], failureEvidenceIds: stageRequirement.failureEvidenceIds || [], passEvidenceIds: stageRequirement.passEvidenceIds || [] };
    }),
    nextAction: requirementState === "met" ? { label: "Mở rộng tình huống", reason: "Yêu cầu mới đã có fail trước đó và evidence pass ở source revision mới." } : requirementState === "failing" ? { label: "Sửa theo điểm neo", reason: arc.transformation.breakingEvent } : { label: "Chạy scenario", reason: "Quan sát breaking event trước khi mở Checks." },
  };
}

function inputFingerprint(input) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ origin: input.origin, statement: input.statement, code: input.code, target: input.target }))
    .digest("hex");
}

function pathwaysSignature(pathways) {
  const canonical = pathways.map((pathway) => JSON.stringify({
    title: pathway.title,
    purpose: pathway.purpose,
    context: pathway.context,
    application: pathway.application,
    target: pathway.target,
    seedId: pathway.seedId,
    deliverables: pathway.deliverables,
    verification: pathway.verification,
    tasks: pathway.tasks,
    contractCriteria: pathway.contractCriteria,
  })).sort();
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function editableSourceHash(files) {
  const canonical = (files || [])
    .filter((file) => file.editable)
    .map((file) => `${file.path}\u0000${String(file.content == null ? "" : file.content)}`)
    .sort()
    .join("\u0001");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

async function inputContext(body = {}) {
  let statement = String(body.input || body.statement || "");
  let code = String(body.code || "");
  let inputSummary = "";
  const evidenceRefs = [];
  let origin = { type: "direct-input" };
  if (body.problemId) {
    if (!(await problemStore.problemExists(body.problemId))) throw fail("Problem does not exist.", 404);
    const [meta, savedStatement, savedCode] = await Promise.all([
      problemStore.readMeta(body.problemId),
      problemStore.getFile(body.problemId, "statement"),
      problemStore.getFile(body.problemId, "code"),
    ]);
    if (meta.lastVerdict !== "AC") throw fail("Phát triển lời giải chỉ mở sau một Judge AC.", 409);
    statement = statement || savedStatement;
    code = code || savedCode;
    inputSummary = meta.title || "";
    evidenceRefs.push(`problem:${body.problemId}:verdict:AC`);
    origin = { type: "problem", problemId: body.problemId, title: meta.title };
  }
  if (!statement.trim() && !code.trim()) throw fail("Provide a problem, input or code to analyze.");
  return {
    origin,
    statement: statement.slice(0, 30000),
    code: code.slice(0, LIMITS.maxCodeBytes),
    inputSummary: inputSummary.slice(0, 1000),
    target: body.target || "cpp",
    evidenceRefs,
  };
}

async function rejectStaticFallback(fingerprint, signature) {
  const ids = await fileStore.listSubdirs(APPLICATION_SESSIONS_DIR);
  for (const sessionId of ids) {
    const previous = await fileStore.readJson(sessionPath(sessionId), null);
    if (previous && previous._inputFingerprint !== fingerprint && previous._pathwaysSignature === signature) {
      throw fail("AI returned the same pathway set for a different solution; static fallback is not accepted.", 502);
    }
  }
}

async function createAnalysisSession(body, options = {}) {
  const input = await inputContext(body);
  const analysis = await analyzeInput(input, options);
  const fingerprint = inputFingerprint(input);
  const signature = pathwaysSignature(analysis.pathways);
  await rejectStaticFallback(fingerprint, signature);
  const at = now();
  const session = {
    id: createId("session"),
    status: "analyzed",
    origin: input.origin,
    analysis: {
      summary: analysis.summary,
      concepts: analysis.concepts,
      constraints: analysis.constraints,
      evidenceRefs: [...new Set([...input.evidenceRefs, ...analysis.evidenceRefs])],
    },
    pathways: analysis.pathways,
    selectedPathwayId: null,
    projectId: null,
    _inputFingerprint: fingerprint,
    _pathwaysSignature: signature,
    _createdAt: at,
    _updatedAt: at,
  };
  await fileStore.writeJson(sessionPath(session.id), session);
  return publicSession(session);
}

async function readSessionDocument(sessionId) {
  safeId(sessionId, "session");
  const session = await fileStore.readJson(sessionPath(sessionId), null);
  if (!session) throw fail("Analysis session does not exist.", 404);
  return session;
}

async function getSession(sessionId) {
  return publicSession(await readSessionDocument(sessionId));
}

async function readProjectDocument(projectId) {
  safeId(projectId, "project");
  const manifest = await fileStore.readJson(projectPath(projectId), null);
  if (!manifest) throw fail("Xưởng project does not exist.", 404);
  let files = await Promise.all((manifest.files || []).map(async (file) => ({
    ...file,
    content: await fileStore.readText(path.join(projectDir(projectId), "files", file.path), ""),
  })));
  // One-time migration for projects materialized by the first v2 agents. They
  // contained a complete baseline implementation but no visible build task, so
  // the student opened Xưởng without knowing what to change. The migration only
  // adds an idempotent coach comment; it never replaces student code.
  const stageIndex = Math.max(0, Number(manifest._stageIndex) || 0);
  const starterKey = `${manifest._seedId}:${stageIndex}`;
  const applied = new Set(Array.isArray(manifest._starterTasks) ? manifest._starterTasks : []);
  if (!applied.has(starterKey)) {
    const editable = files.find((file) => file.editable);
    if (editable) {
      const next = scenarioRegistry.applyStarterTask(manifest._seedId, stageIndex, editable.content);
      if (next !== editable.content) {
        editable.content = next;
        await fileStore.writeText(path.join(projectDir(projectId), "files", editable.path), next);
      }
    }
    applied.add(starterKey);
    manifest._starterTasks = [...applied];
    manifest._updatedAt = now();
    await writeManifest({ ...manifest, files });
  }
  const layoutKey = `${manifest._seedId}:cpp-learning-v3`;
  const layouts = new Set(Array.isArray(manifest._learningLayouts) ? manifest._learningLayouts : []);
  if (!layouts.has(layoutKey)) {
    const editable = files.find((file) => file.editable);
    if (editable) {
      const next = scenarioRegistry.applyLearningLayout(manifest._seedId, editable.content);
      if (next !== editable.content) {
        editable.content = next;
        await fileStore.writeText(path.join(projectDir(projectId), "files", editable.path), next);
      }
    }
    layouts.add(layoutKey);
    manifest._learningLayouts = [...layouts];
    manifest._updatedAt = now();
    await writeManifest({ ...manifest, files });
  }
  return { ...manifest, files };
}

async function readProject(projectId) {
  return publicProject(await readProjectDocument(projectId));
}

async function readProjectReference(projectId) {
  return runtime.referenceStoryboard(await readProjectDocument(projectId));
}

async function readProjectSource(projectId, filePath) {
  filePath = safeFilePath(filePath);
  const project = await readProjectDocument(projectId);
  const file = project.files.find((item) => item.path === filePath);
  if (!file) throw fail("Project file does not exist.", 404);
  return file.content;
}

async function writeManifest(project) {
  const manifest = { ...project, files: (project.files || []).map(({ content, ...file }) => file) };
  await fileStore.writeJson(projectPath(project.id), manifest);
}

function initialRequirements(pathway, registeredRequirements = []) {
  const summaries = registeredRequirements.length
    ? registeredRequirements
    : pathway.contractCriteria.length
    ? pathway.contractCriteria
    : pathway.deliverables.length
      ? pathway.deliverables.map((item) => `Hoàn thành ${item}`)
      : [pathway.purpose];
  return summaries.map((summary, index) => ({
    id: `requirement-${index + 1}`,
    summary,
    status: "active",
    verifierIds: [],
  }));
}

function normalizeEvolution(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw fail("AI evolution does not match the Xưởng schema.", 502);
  }
  const summary = String(raw.summary || "").trim().slice(0, 500);
  if (!summary) throw fail("AI evolution does not match the Xưởng schema.", 502);
  assertCoachRequirement(summary, "evolution.summary");
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map((item) => String(item || "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 12);
  for (const task of tasks) {
    if (!isNaturalVietnamese(task)) throw fail("AI evolution tasks must be natural Vietnamese.", 502);
  }
  return { summary, tasks };
}

async function selectPathway(sessionId, pathwayId) {
  return fileStore.withLock(`xuong-session:${sessionId}`, async () => {
    const session = await readSessionDocument(sessionId);
    if (session.projectId) {
      const existing = await readProjectDocument(session.projectId);
      return { project: publicProject(existing), reference: runtime.referenceStoryboard(existing) };
    }
    const pathway = session.pathways.find((item) => item.id === pathwayId);
    if (!pathway) throw fail("Pathway does not exist in this analysis session.", 404);
    if (pathway.target !== "cpp") {
      throw fail(`Pathway "${pathway.title}" thuộc adapter ${pathway.target}, hiện mới là bản xem trước. Hãy chọn một pathway C++ để tạo project chạy được ngay.`, 422);
    }
    const seed = seedRegistry.materializeSeed(pathway.seedId);
    seed.files = seed.files.map((file) => file.editable
      ? { ...file, content: scenarioRegistry.applyStarterTask(pathway.seedId, 0, file.content) }
      : file);
    const at = now();
    const project = {
      id: createId("project"),
      title: pathway.title,
      status: "work",
      pathway: {
        id: pathway.id,
        title: pathway.title,
        purpose: pathway.purpose,
        context: pathway.context,
        application: pathway.application,
        target: pathway.target,
      },
      brief: {
        context: pathway.context,
        application: pathway.application,
        mission: seed.demo.mission,
        acceptance: seed.demo.acceptance,
      },
      files: seed.files.map(({ content, ...file }) => file),
      requirements: initialRequirements(pathway, seed.demo.requirements),
      evidence: [],
      demo: { title: seed.demo.title, description: seed.demo.description },
      demoRuns: [],
      nextAction: { label: "Chạy demo", reason: "Xem sản phẩm hoạt động và vai trò của thuật toán trước khi sửa code." },
      _seedId: seed.seedId,
      _stageIndex: 0,
      _starterTasks: [`${seed.seedId}:0`],
      _suite: "baseline",
      _tasks: pathway.tasks,
      _evolutionRound: 0,
      _evolutionBaselineHash: null,
      _v2Requirements: [{ id: "trusted-change", state: "candidate", verifierIds: [`trusted:${seed.seedId}:requirement`], failureEvidenceIds: [], passEvidenceIds: [], failedSourceRevisions: [] }],
      runs: [],
      _createdAt: at,
      _updatedAt: at,
    };
    await Promise.all(seed.files.map((file) => fileStore.writeText(path.join(projectDir(project.id), "files", file.path), file.content)));
    await writeManifest(project);
    session.status = "selected";
    session.selectedPathwayId = pathway.id;
    session.projectId = project.id;
    session._updatedAt = at;
    await fileStore.writeJson(sessionPath(session.id), session);
    const selected = await readProjectDocument(project.id);
    return { project: publicProject(selected), reference: runtime.referenceStoryboard(selected) };
  });
}

async function listProjects() {
  const ids = await fileStore.listSubdirs(APPLICATION_PROJECTS_DIR);
  const projects = await Promise.all(ids.filter((value) => /^project-[a-f0-9-]{36}$/.test(value)).map(readProjectDocument));
  return projects
    // Projects created before the v2 materializer have no trusted requirement
    // lifecycle. Keep their files intact, but never present them as a current
    // Xưởng project: their v1 copy/provenance would make the v2 workbench lie.
    .filter((project) => Array.isArray(project._v2Requirements))
    .sort((a, b) => Date.parse(b._updatedAt || 0) - Date.parse(a._updatedAt || 0))
    .map((project) => publicProject(project, { includeSource: false }));
}

async function saveProjectFile(projectId, filePath, source, expectedContentHash) {
  filePath = safeFilePath(filePath);
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > LIMITS.maxCodeBytes) {
    throw fail("Project source is invalid or too large.");
  }
  return fileStore.withLock(`xuong-project:${projectId}`, async () => {
    const project = await readProjectDocument(projectId);
    const file = project.files.find((item) => item.path === filePath);
    if (!file) throw fail("Project file does not exist.", 404);
    if (!file.editable) throw fail("Generated headers and verifier files are read-only.", 409);
    if (typeof expectedContentHash !== "string" || expectedContentHash !== runtime.hash(file.content)) {
      throw Object.assign(fail("Source đã thay đổi ở nơi khác; hãy tải lại trước khi lưu.", 409), { code: "STALE_SOURCE" });
    }
    await fileStore.writeText(path.join(projectDir(projectId), "files", filePath), source);
    project._v2Requirements = (project._v2Requirements || []).map((requirement, index) => index === (Number(project._stageIndex) || 0) && requirement.state === "met"
      ? { ...requirement, state: "candidate" }
      : requirement);
    project.status = "needs-verification";
    project.requirements = project.requirements.map((requirement) => requirement.status === "met" ? { ...requirement, status: "active" } : requirement);
    project.nextAction = { label: "Verify thay đổi", reason: `${filePath} đã đổi; evidence cũ không xác nhận source mới.` };
    project._updatedAt = now();
    await writeManifest(project);
    return publicProject(await readProjectDocument(projectId));
  });
}

async function readRun(projectId, runId) {
  const project = await readProjectDocument(projectId);
  const run = (project.runs || []).find((item) => item.id === runId);
  if (!run) throw Object.assign(fail("Không tìm thấy lần chạy của project này.", 404), { code: "SCENARIO_NOT_FOUND" });
  return { project, run };
}

async function runProjectScenario(projectId, request = {}) {
  return fileStore.withLock(`xuong-project:${projectId}`, async () => {
    const project = await readProjectDocument(projectId);
    const scenarioId = String(request.scenarioId || "");
    const controlState = request.controlState && typeof request.controlState === "object" && !Array.isArray(request.controlState) ? request.controlState : {};
    const revision = runtime.sourceRevision(project.files);
    const cacheKey = JSON.stringify({ scenarioId, controlState });
    let run = (project.runs || []).find((item) => item.sourceRevision === revision && item._cacheKey === cacheKey);
    if (!run) {
      run = await runtime.runScenario({ project, scenarioId, controlState, settings: await settingsStore.getSettings(), runId: createId("run") });
      run._cacheKey = cacheKey;
      project.runs = [run, ...(project.runs || [])].slice(0, 40);
      project._updatedAt = now();
      await fileStore.writeJson(path.join(projectDir(projectId), "runs", `${run.id}.json`), run);
      await writeManifest(project);
    }
    return { project: publicProject(await readProjectDocument(projectId)), run: runtime.publicRun(run), observable: run._observable || null, recipe: run._recipe || null };
  });
}

async function replayProjectRun(projectId, runId, cursor) {
  const { run } = await readRun(projectId, runId);
  return { run: runtime.publicRun(run), replay: runtime.replay(run, cursor) };
}

async function checkProjectRun(projectId, requestedRunId) {
  return fileStore.withLock(`xuong-project:${projectId}`, async () => {
    const project = await readProjectDocument(projectId);
    const run = requestedRunId ? (project.runs || []).find((item) => item.id === requestedRunId) : (project.runs || [])[0];
    if (!run) throw Object.assign(fail("Hãy chạy scenario trước khi mở Checks.", 422), { code: "RUN_FAILED" });
    if (run.projectId !== project.id) throw Object.assign(fail("Lần chạy không thuộc project này.", 404), { code: "SCENARIO_NOT_FOUND" });
    const raw = runtime.checkRun(project, run);
    const at = now();
    const evidence = raw.map((item) => ({ id: createId("evidence"), at, kind: item.kind, outcome: item.outcome, durationMs: item.durationMs, detail: item.detail, requirementId: item.requirementId }));
    const passed = evidence.every((item) => item.outcome === "pass");
    const stageIndex = scenarioRegistry.findStageIndex(project._seedId, run.scenarioId);
    const req = (project._v2Requirements || [])[stageIndex];
    if (!req) throw fail("Project thiếu trusted requirement.", 500);
    if (passed) {
      if (!(req.failedSourceRevisions || []).some((revision) => revision !== run.sourceRevision)) {
        // A green baseline must never unlock a capability by itself.
        req.state = "candidate";
      } else {
        req.state = "met";
        req.passEvidenceIds = [...new Set([...(req.passEvidenceIds || []), ...evidence.map((item) => item.id)])];
      }
    } else {
      req.state = "failing";
      req.failureEvidenceIds = [...new Set([...(req.failureEvidenceIds || []), ...evidence.map((item) => item.id)])];
      req.failedSourceRevisions = [...new Set([...(req.failedSourceRevisions || []), run.sourceRevision])];
    }
    req.verifierIds = [...new Set([...(req.verifierIds || []), runtime.verifierIdFor(project._seedId, stageIndex)])];
    project._v2Requirements[stageIndex] = req;
    project.evidence = [...evidence].reverse().concat(project.evidence || []);
    project._updatedAt = at;
    await Promise.all(evidence.map((item) => fileStore.writeJson(path.join(projectDir(projectId), "evidence", `${item.id}.json`), item)));
    await writeManifest(project);
    return { project: publicProject(await readProjectDocument(projectId)), checkedRunId: run.id, evidence };
  });
}

async function runProjectDemo(projectId) {
  return fileStore.withLock(`xuong-project:${projectId}`, async () => {
    const project = await readProjectDocument(projectId);
    const result = await projectDemoRunner.runProjectDemo({
      plan: seedRegistry.demoPlan(project._seedId, project.files),
      settings: await settingsStore.getSettings(),
    });
    const demoRun = {
      id: createId("demo"),
      at: now(),
      status: result.status,
      durationMs: result.durationMs,
      output: String(result.output || "").trim(),
      detail: String(result.detail || "Demo không trả chi tiết.").trim(),
    };
    project.demoRuns = [demoRun, ...(project.demoRuns || [])].slice(0, 12);
    if (demoRun.status === "completed" && !(project.evidence || []).length && project.status === "work") {
      project.nextAction = {
        label: "Hoàn thiện lõi",
        reason: "Em đã thấy demo hoạt động; tiếp theo hãy đọc requirement, sửa phần triển khai rồi Verify.",
      };
    }
    project._updatedAt = demoRun.at;
    await fileStore.writeJson(path.join(projectDir(projectId), "demo-runs", `${demoRun.id}.json`), demoRun);
    await writeManifest(project);
    return { project: publicProject(await readProjectDocument(projectId)), demoRun };
  });
}

async function verifyProject(projectId) {
  return fileStore.withLock(`xuong-project:${projectId}`, async () => {
    const project = await readProjectDocument(projectId);
    const active = project.requirements.filter((requirement) => ["active", "failing"].includes(requirement.status));
    const requirementId = active.at(-1)?.id || null;
    const unchangedEvolution = project._evolutionBaselineHash
      && editableSourceHash(project.files) === project._evolutionBaselineHash;
    const rawEvidence = unchangedEvolution
      ? [{
        kind: "unit-test",
        outcome: "fail",
        durationMs: 0,
        detail: `Requirement "${active.at(-1)?.summary || requirementId || "mới"}" chưa được triển khai: source của file editable chưa thay đổi từ lúc evolve.`,
      }]
      : await projectVerifier.runProjectVerifiers({
        plan: seedRegistry.verificationPlan(project._seedId, project.files, project._suite),
        settings: await settingsStore.getSettings(),
      });
    const at = now();
    const evidence = rawEvidence.map((item) => ({
      id: createId("evidence"),
      at,
      kind: item.kind,
      outcome: item.outcome,
      durationMs: item.durationMs,
      detail: String(item.detail || "Verifier không trả chi tiết.").trim(),
      requirementId,
    }));
    const passed = evidence.length > 0 && evidence.every((item) => item.outcome === "pass");
    const verifierIds = evidence.map((item) => item.id);
    project.requirements = project.requirements.map((requirement) => active.some((item) => item.id === requirement.id)
      ? { ...requirement, status: passed ? "met" : "failing", verifierIds: [...new Set([...(requirement.verifierIds || []), ...verifierIds])] }
      : requirement);
    project.evidence = [...evidence].reverse().concat(project.evidence || []);
    project.status = passed ? "verified" : "needs-work";
    if (passed) project._evolutionBaselineHash = null;
    project.nextAction = passed
      ? { label: "Mở requirement tiếp theo", reason: "Compile, unit test và các verifier hiện tại đều có evidence pass." }
      : { label: "Sửa theo evidence", reason: evidence.find((item) => item.outcome === "fail")?.detail || "Verifier chưa pass." };
    project._updatedAt = at;
    await Promise.all(evidence.map((item) => fileStore.writeJson(path.join(projectDir(projectId), "evidence", `${item.id}.json`), item)));
    await writeManifest(project);
    return { project: publicProject(await readProjectDocument(projectId)), evidence };
  });
}

async function evolveProject(projectId, request, { provider } = {}) {
  return fileStore.withLock(`xuong-project:${projectId}`, async () => {
    const project = await readProjectDocument(projectId);
    const activeStage = Math.max(0, Number(project._stageIndex) || 0);
    const trustedRequirement = (project._v2Requirements || [])[activeStage];
    if (!trustedRequirement || trustedRequirement.state !== "met") {
      throw fail("Checks phải có evidence pass sau một lần fail trước khi mở rộng scenario.", 409);
    }
    const nextStage = activeStage + 1;
    const arc = scenarioRegistry.getArc(project._seedId, nextStage);
    const at = now();
    project._evolutionRound = Math.max(0, Number(project._evolutionRound) || 0) + 1;
    if (!arc) {
      project.status = "evolving";
      project.nextAction = { label: "Giữ bản đang chạy", reason: "Catalog chưa đăng ký scenario kế tiếp có runner, oracle và verifier trusted." };
    } else {
      project._stageIndex = nextStage;
      project._v2Requirements = [...(project._v2Requirements || []), {
        id: `trusted-change-stage-${nextStage + 1}`,
        state: "candidate",
        verifierIds: [runtime.verifierIdFor(project._seedId, nextStage)],
        failureEvidenceIds: [],
        passEvidenceIds: [],
        failedSourceRevisions: [],
      }];
      project.status = "evolving";
      const editable = project.files.find((file) => file.editable);
      if (editable) {
        const nextSource = scenarioRegistry.applyStarterTask(project._seedId, nextStage, editable.content);
        if (nextSource !== editable.content) {
          editable.content = nextSource;
          await fileStore.writeText(path.join(projectDir(projectId), "files", editable.path), nextSource);
        }
      }
      project._starterTasks = [...new Set([...(project._starterTasks || []), `${project._seedId}:${nextStage}`])];
      project.nextAction = { label: "Chạy scenario mới", reason: `${arc.transformation.breakingEvent} đã có runner, oracle và verifier trusted riêng.` };
    }
    project._updatedAt = at;
    await writeManifest(project);
    return publicProject(await readProjectDocument(projectId));
  });
}

module.exports = {
  inputContext,
  createAnalysisSession,
  getSession,
  selectPathway,
  listProjects,
  readProject,
  readProjectReference,
  readProjectSource,
  saveProjectFile,
  runProjectScenario,
  replayProjectRun,
  checkProjectRun,
  runProjectDemo,
  verifyProject,
  evolveProject,
  safeFilePath,
  normalizeEvolution,
};
