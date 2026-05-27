const sampleNotes = `Cellular respiration converts glucose into ATP through glycolysis, the Krebs cycle, and oxidative phosphorylation.
Glycolysis happens in the cytoplasm and breaks glucose into pyruvate while producing a small amount of ATP and NADH.
The Krebs cycle happens in the mitochondrial matrix and releases carbon dioxide while producing NADH and FADH2.
The electron transport chain uses NADH and FADH2 to move electrons, pump protons, and drive ATP synthase.
Oxygen is the final electron acceptor. Without oxygen, fermentation helps regenerate NAD+ so glycolysis can continue.
Weak spots: compare aerobic respiration with fermentation, remember where each stage occurs, and explain why oxygen matters.`;

const elements = {
  subject: document.querySelector("#subject"),
  topic: document.querySelector("#topic"),
  examDate: document.querySelector("#examDate"),
  dailyMinutes: document.querySelector("#dailyMinutes"),
  confidence: document.querySelector("#confidence"),
  studyStyle: document.querySelector("#studyStyle"),
  notesInput: document.querySelector("#notesInput"),
  readinessScore: document.querySelector("#readinessScore"),
  focusMinutes: document.querySelector("#focusMinutes"),
  quizScore: document.querySelector("#quizScore"),
  sessionBadge: document.querySelector("#sessionBadge"),
  readinessBadge: document.querySelector("#readinessBadge"),
  coachScore: document.querySelector("#coachScore"),
  scoreFill: document.querySelector("#scoreFill"),
  coachBrief: document.querySelector("#coachBrief"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  flashcardStack: document.querySelector("#flashcardStack"),
  flashcardCount: document.querySelector("#flashcardCount"),
  quizList: document.querySelector("#quizList"),
  quizBadge: document.querySelector("#quizBadge"),
  insightStack: document.querySelector("#insightStack"),
  insightCount: document.querySelector("#insightCount")
};

const state = {
  session: null,
  answered: 0,
  correct: 0,
  completedTasks: 0
};

function setDefaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  elements.examDate.value = date.toISOString().slice(0, 10);
}

function readProfile() {
  return {
    subject: elements.subject.value.trim() || "General study",
    topic: elements.topic.value.trim() || "Core concepts",
    examDate: elements.examDate.value,
    dailyMinutes: Math.max(15, Number(elements.dailyMinutes.value) || 60),
    confidence: elements.confidence.value,
    studyStyle: elements.studyStyle.value,
    notes: elements.notesInput.value.trim()
  };
}

function daysUntil(dateValue) {
  if (!dateValue) return 7;
  const today = new Date();
  const target = new Date(`${dateValue}T12:00:00`);
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

function extractConcepts(notes, topic) {
  const sentences = notes
    .split(/[.!?\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 24);
  const keywords = Array.from(
    new Set(
      notes
        .toLowerCase()
        .replace(/[^a-z0-9+\s-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 5 && !["through", "without", "happens", "producing", "remember"].includes(word))
    )
  ).slice(0, 10);

  if (!sentences.length) {
    return [
      `${topic} definition and purpose`,
      `${topic} key terms`,
      `${topic} examples and common mistakes`
    ];
  }

  return sentences.slice(0, 6).map((sentence, index) => {
    const keyword = keywords[index] || topic;
    return `${capitalize(keyword)}: ${sentence}`;
  });
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function generateSession() {
  const profile = readProfile();
  const days = daysUntil(profile.examDate);
  const concepts = extractConcepts(profile.notes, profile.topic);
  const readiness = scoreReadiness(profile, days, concepts.length);
  const tasks = buildTasks(profile, days, concepts);
  const flashcards = buildFlashcards(profile, concepts);
  const quiz = buildQuiz(profile, concepts);
  const insights = buildInsights(profile, readiness, days, concepts);

  state.session = { profile, days, readiness, tasks, flashcards, quiz, insights };
  state.answered = 0;
  state.correct = 0;
  state.completedTasks = 0;
  renderSession();
}

function scoreReadiness(profile, days, conceptCount) {
  let score = 42;
  score += Math.min(18, profile.dailyMinutes / 5);
  score += Math.min(16, days * 1.2);
  score += profile.confidence === "high" ? 14 : profile.confidence === "medium" ? 7 : 0;
  score += Math.min(10, conceptCount * 1.5);
  if (days <= 2) score -= 16;
  if (profile.notes.length < 120) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildTasks(profile, days, concepts) {
  const reviewTime = Math.max(10, Math.round(profile.dailyMinutes * 0.25));
  const learnTime = Math.max(15, Math.round(profile.dailyMinutes * 0.35));
  const practiceTime = Math.max(10, Math.round(profile.dailyMinutes * 0.25));
  const recallTime = Math.max(5, profile.dailyMinutes - reviewTime - learnTime - practiceTime);
  const primaryConcept = concepts[0]?.split(":")[0] || profile.topic;
  const secondConcept = concepts[1]?.split(":")[0] || "supporting ideas";

  const tasks = [
    {
      title: `Review ${primaryConcept}`,
      detail: "Skim notes, mark confusing lines, and rewrite the concept in your own words.",
      minutes: reviewTime
    },
    {
      title: `Deep work on ${secondConcept}`,
      detail: "Build a mini explanation with one example and one non-example.",
      minutes: learnTime
    },
    {
      title: "Practice retrieval",
      detail: "Answer the quiz without looking, then correct the misses immediately.",
      minutes: practiceTime
    },
    {
      title: "Close the loop",
      detail: days <= 3 ? "Make a compact cram sheet for the highest-risk facts." : "Schedule tomorrow's spaced repetition pass.",
      minutes: recallTime
    }
  ];

  if (profile.studyStyle === "visual") {
    tasks[1].detail = "Draw a diagram or flow map before writing the explanation.";
  }
  if (profile.studyStyle === "practice") {
    tasks[2].minutes += 10;
    tasks[2].detail = "Do two rounds: one slow accuracy round and one timed round.";
  }
  if (profile.studyStyle === "reading") {
    tasks[0].minutes += 10;
    tasks[0].detail = "Annotate the notes and extract the three most testable claims.";
  }

  return tasks;
}

function buildFlashcards(profile, concepts) {
  return concepts.slice(0, 6).map((concept) => {
    const [term, ...rest] = concept.split(":");
    const answer = rest.join(":").trim() || `Explain how ${term} connects to ${profile.topic}.`;
    return {
      front: `Explain ${term.trim()}`,
      back: answer
    };
  });
}

function buildQuiz(profile, concepts) {
  const base = concepts.slice(0, 4);
  const fallback = [`${profile.topic}: Define the main idea`, `${profile.topic}: Give one example`];
  return (base.length ? base : fallback).map((concept, index) => {
    const [term, ...rest] = concept.split(":");
    const answer = rest.join(":").trim() || `It is a key part of ${profile.topic}.`;
    return {
      question: `Which statement best matches ${term.trim()}?`,
      options: shuffle([
        answer,
        `It is unrelated to ${profile.topic} and can be skipped.`,
        "It only matters after the exam is over."
      ]),
      answer,
      id: `q-${index}`
    };
  });
}

function shuffle(items) {
  return items
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
}

function buildInsights(profile, readiness, days, concepts) {
  const insights = [];
  const weakSpotLine = profile.notes
    .split(/\n+/)
    .find((line) => /weak|confus|miss|hard|struggle/i.test(line));

  insights.push({
    title: readiness >= 75 ? "You have room for higher-order practice" : "Start with active recall",
    detail: readiness >= 75
      ? "Move beyond rereading. Explain the topic, compare ideas, and practice mixed questions."
      : "Use short recall loops before rereading so you can see what is actually missing.",
    impact: readiness >= 75 ? "Stretch" : "Priority",
    tone: readiness >= 75 ? "good" : "warn"
  });

  if (days <= 3) {
    insights.push({
      title: "Exam is close",
      detail: "Favor retrieval, worked examples, and compact review sheets over broad note rewriting.",
      impact: "Urgent",
      tone: "risk"
    });
  }

  if (weakSpotLine) {
    insights.push({
      title: "Weak spot detected",
      detail: weakSpotLine.replace(/^weak spots:\s*/i, ""),
      impact: "Target",
      tone: "warn"
    });
  }

  if (concepts.length >= 5) {
    insights.push({
      title: "Notes have enough material for spaced review",
      detail: "Use the flashcards today, tomorrow, and again before the exam.",
      impact: "Retention",
      tone: "good"
    });
  }

  return insights;
}

function renderSession() {
  const { profile, days, readiness, tasks, flashcards, quiz, insights } = state.session;
  elements.readinessScore.textContent = readiness;
  elements.coachScore.textContent = readiness;
  elements.scoreFill.style.width = `${readiness}%`;
  elements.focusMinutes.textContent = profile.dailyMinutes;
  elements.quizScore.textContent = "0%";
  elements.sessionBadge.textContent = `${days} day${days === 1 ? "" : "s"} left`;
  elements.coachBrief.textContent = `${profile.subject}: focus on ${profile.topic}. Today is a ${profile.dailyMinutes}-minute session with ${tasks.length} tasks, ${flashcards.length} flashcards, and ${quiz.length} practice questions.`;
  renderReadinessBadge(readiness);
  renderTasks(tasks);
  renderFlashcards(flashcards);
  renderQuiz(quiz);
  renderInsights(insights);
}

function renderReadinessBadge(readiness) {
  elements.readinessBadge.className = "verdict";
  if (readiness >= 80) {
    elements.readinessBadge.classList.add("ready");
    elements.readinessBadge.textContent = "Ready";
  } else if (readiness >= 62) {
    elements.readinessBadge.classList.add("review");
    elements.readinessBadge.textContent = "Review";
  } else if (readiness >= 42) {
    elements.readinessBadge.classList.add("crunch");
    elements.readinessBadge.textContent = "Crunch";
  } else {
    elements.readinessBadge.classList.add("behind");
    elements.readinessBadge.textContent = "Behind";
  }
}

function renderTasks(tasks) {
  const template = document.querySelector("#taskTemplate");
  elements.taskList.innerHTML = "";
  tasks.forEach((task) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const checkbox = node.querySelector("input");
    checkbox.addEventListener("change", () => {
      state.completedTasks += checkbox.checked ? 1 : -1;
      updateProgress();
    });
    node.querySelector("span").textContent = `${task.title}. ${task.detail}`;
    node.querySelector("small").textContent = `${task.minutes} min`;
    elements.taskList.appendChild(node);
  });
  elements.taskCount.textContent = `${tasks.length} tasks`;
}

function renderFlashcards(cards) {
  const template = document.querySelector("#flashcardTemplate");
  elements.flashcardStack.innerHTML = "";
  cards.forEach((card) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const button = node.querySelector("button");
    button.querySelector("strong").textContent = card.front;
    button.querySelector("span").textContent = "Tap to reveal answer";
    button.addEventListener("click", () => {
      const revealed = button.dataset.revealed === "true";
      button.dataset.revealed = String(!revealed);
      button.querySelector("span").textContent = revealed ? "Tap to reveal answer" : card.back;
    });
    elements.flashcardStack.appendChild(node);
  });
  elements.flashcardCount.textContent = `${cards.length} cards`;
}

function renderQuiz(questions) {
  const template = document.querySelector("#quizTemplate");
  elements.quizList.innerHTML = "";
  questions.forEach((question) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = question.question;
    const optionWrap = node.querySelector("div");
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => scoreAnswer(optionWrap, button, option === question.answer));
      optionWrap.appendChild(button);
    });
    elements.quizList.appendChild(node);
  });
  elements.quizBadge.textContent = "0 answered";
}

function scoreAnswer(optionWrap, selectedButton, isCorrect) {
  if (optionWrap.dataset.answered === "true") return;
  optionWrap.dataset.answered = "true";
  state.answered += 1;
  if (isCorrect) state.correct += 1;
  Array.from(optionWrap.querySelectorAll("button")).forEach((button) => {
    button.dataset.state = button === selectedButton
      ? isCorrect ? "correct" : "wrong"
      : "";
  });
  updateProgress();
}

function renderInsights(insights) {
  const template = document.querySelector("#quizTemplate");
  elements.insightStack.innerHTML = "";
  insights.forEach((insight) => {
    const node = document.createElement("article");
    node.className = "insight-card";
    node.dataset.tone = insight.tone;
    node.innerHTML = `
      <div>
        <strong>${insight.title}</strong>
        <span>${insight.detail}</span>
      </div>
      <small>${insight.impact}</small>
    `;
    elements.insightStack.appendChild(node);
  });
  elements.insightCount.textContent = `${insights.length} insights`;
}

function updateProgress() {
  if (!state.session) return;
  const quizPercent = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const taskBoost = Math.round((state.completedTasks / state.session.tasks.length) * 8);
  const quizBoost = Math.round((quizPercent / 100) * 8);
  const readiness = Math.min(100, state.session.readiness + taskBoost + quizBoost);
  elements.quizScore.textContent = `${quizPercent}%`;
  elements.quizBadge.textContent = `${state.answered} answered`;
  elements.readinessScore.textContent = readiness;
  elements.coachScore.textContent = readiness;
  elements.scoreFill.style.width = `${readiness}%`;
  renderReadinessBadge(readiness);
}

function startFocus() {
  const minutes = Number(elements.dailyMinutes.value) || 25;
  elements.focusMinutes.textContent = minutes;
  elements.coachBrief.textContent = `Focus mode started: ${minutes} minutes on ${elements.topic.value || "today's topic"}. Put the hardest task first, then take a short break.`;
}

function markComplete() {
  if (!state.session) {
    generateSession();
  }
  state.completedTasks = state.session.tasks.length;
  Array.from(elements.taskList.querySelectorAll("input")).forEach((input) => {
    input.checked = true;
  });
  updateProgress();
}

function exportPlan() {
  if (!state.session) {
    generateSession();
  }
  const { profile, days, readiness, tasks, flashcards, insights } = state.session;
  const lines = [
    "# AI Study Plan",
    "",
    `Subject: ${profile.subject}`,
    `Topic: ${profile.topic}`,
    `Days until exam: ${days}`,
    `Readiness score: ${readiness}/100`,
    "",
    "## Today's Tasks",
    "",
    ...tasks.map((task) => `- ${task.title} (${task.minutes} min): ${task.detail}`),
    "",
    "## Flashcards",
    "",
    ...flashcards.map((card) => `- ${card.front}: ${card.back}`),
    "",
    "## Insights",
    "",
    ...insights.map((insight) => `- ${insight.title}: ${insight.detail}`)
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ai-study-plan.md";
  link.click();
  URL.revokeObjectURL(url);
}

function drawLearningVisual() {
  const canvas = document.querySelector("#learningCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#edf3f5";
  ctx.fillRect(0, 0, width, height);

  const nodes = [
    [72, 68, "#245f73"],
    [188, 44, "#6855a3"],
    [306, 82, "#2f744b"],
    [124, 168, "#a06916"],
    [256, 178, "#af3e56"]
  ];

  ctx.strokeStyle = "rgba(36, 95, 115, 0.28)";
  ctx.lineWidth = 4;
  for (let i = 0; i < nodes.length; i += 1) {
    const [x1, y1] = nodes[i];
    const [x2, y2] = nodes[(i + 2) % nodes.length];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  nodes.forEach(([x, y, color], index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 18px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), x, y + 1);
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#17202a";
  ctx.font = "800 18px Inter, sans-serif";
  ctx.fillText("Plan", 36, 228);
  ctx.fillText("Recall", 128, 228);
  ctx.fillText("Practice", 238, 228);
}

function resetWorkspace() {
  elements.subject.value = "Biology";
  elements.topic.value = "Cellular respiration";
  elements.dailyMinutes.value = 60;
  elements.confidence.value = "medium";
  elements.studyStyle.value = "balanced";
  elements.notesInput.value = "";
  setDefaultDate();
  state.session = null;
  state.answered = 0;
  state.correct = 0;
  state.completedTasks = 0;
  elements.readinessScore.textContent = "0";
  elements.focusMinutes.textContent = "0";
  elements.quizScore.textContent = "0%";
  elements.coachScore.textContent = "0";
  elements.scoreFill.style.width = "0";
  elements.readinessBadge.className = "verdict neutral";
  elements.readinessBadge.textContent = "Idle";
  elements.sessionBadge.textContent = "Manual session";
  elements.coachBrief.textContent = "Generate a session to get a focused learning path, quiz, and flashcards.";
  elements.taskList.innerHTML = "";
  elements.flashcardStack.innerHTML = "";
  elements.quizList.innerHTML = "";
  elements.insightStack.innerHTML = '<div class="empty-state">Weak spots and next steps will appear here.</div>';
  elements.taskCount.textContent = "0 tasks";
  elements.flashcardCount.textContent = "0 cards";
  elements.quizBadge.textContent = "0 answered";
  elements.insightCount.textContent = "0 insights";
}

document.querySelector("#generateSession").addEventListener("click", generateSession);
document.querySelector("#startFocus").addEventListener("click", startFocus);
document.querySelector("#markComplete").addEventListener("click", markComplete);
document.querySelector("#exportPlan").addEventListener("click", exportPlan);
document.querySelector("#loadSample").addEventListener("click", () => {
  elements.notesInput.value = sampleNotes;
  setDefaultDate();
  generateSession();
});
document.querySelector("#resetWorkspace").addEventListener("click", resetWorkspace);

setDefaultDate();
elements.notesInput.value = sampleNotes;
drawLearningVisual();
generateSession();
