const $ = (id) => document.getElementById(id);

const PWNED_API = "https://api.pwnedpasswords.com/range/";
const commonPasswords = new Set([
  "password",
  "password1",
  "123456",
  "12345678",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "iloveyou",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "abc123",
  "trustno1"
]);

const dictionaryWords = [
  "orbit",
  "harbor",
  "cobalt",
  "ember",
  "raven",
  "summit",
  "maple",
  "signal",
  "violet",
  "anchor",
  "canyon",
  "pixel",
  "ledger",
  "marble",
  "rocket",
  "silver"
];

const mfaAccounts = [
  {
    id: "email",
    name: "Email",
    detail: "Protects password resets and account recovery for everything else.",
    guidance: "Use a security key or authenticator app. Save backup codes somewhere offline."
  },
  {
    id: "banking",
    name: "Banking",
    detail: "Protects money movement, statements, and identity information.",
    guidance: "Use the bank app, a hardware key, or authenticator app if offered. Enable transaction alerts."
  },
  {
    id: "cloud",
    name: "Cloud",
    detail: "Protects files, photos, device backups, and synced browser data.",
    guidance: "Use authenticator app or security key. Review trusted devices after enabling MFA."
  },
  {
    id: "admin",
    name: "Admin",
    detail: "Protects privileged systems, routers, hosting panels, and work consoles.",
    guidance: "Use phishing-resistant MFA such as a security key whenever the service supports it."
  }
];

const mfaMethods = [
  { value: "none", label: "Not set", weight: 0 },
  { value: "sms", label: "SMS or voice", weight: 12 },
  { value: "email", label: "Email code", weight: 10 },
  { value: "app", label: "Authenticator app", weight: 20 },
  { value: "push", label: "Number-matching push", weight: 22 },
  { value: "key", label: "Security key", weight: 25 }
];

const checks = [
  {
    id: "length",
    label: "At least 14 characters",
    detail: "Longer passwords resist guessing better than short complex ones.",
    test: (password) => password.length >= 14
  },
  {
    id: "variety",
    label: "Uses multiple character types",
    detail: "Mixes lowercase, uppercase, numbers, or symbols.",
    test: (password) => characterClasses(password) >= 3
  },
  {
    id: "common",
    label: "Avoids common passwords",
    detail: "Does not match a well-known password or simple variant.",
    test: (password) => !isCommonPassword(password)
  },
  {
    id: "sequence",
    label: "Avoids obvious sequences",
    detail: "No keyboard walks, alphabet runs, or repeated character blocks.",
    test: (password) => !hasSequence(password) && !/(.)\1{3,}/.test(password)
  },
  {
    id: "personal",
    label: "No obvious substitutions",
    detail: "Avoids predictable changes like Pa$$word2026.",
    test: (password) => !hasPredictableSubstitutions(password)
  }
];

let lastPwnedHash = "";
const mfaState = Object.fromEntries(mfaAccounts.map((account) => [account.id, { enabled: false, method: "none" }]));

function init() {
  bindEvents();
  renderChecklist("");
  renderAdvice([]);
  renderMfa();
  updateStrength();
}

function bindEvents() {
  $("passwordInput").addEventListener("input", () => {
    lastPwnedHash = "";
    resetPwned();
    updateStrength();
  });
  $("toggleVisibility").addEventListener("click", toggleVisibility);
  $("checkPwned").addEventListener("click", checkPwned);
  $("generatePassword").addEventListener("click", () => setGeneratedPassword(generatePassword()));
  $("usePassword").addEventListener("click", () => setGeneratedPassword(generatePassword()));
  $("usePassphrase").addEventListener("click", () => setGeneratedPassword(generatePassphrase()));
  $("copyPassword").addEventListener("click", copyPassword);
  $("clearPassword").addEventListener("click", clearPassword);
}

function updateStrength() {
  const password = $("passwordInput").value;
  const result = scorePassword(password);
  const passed = checks.filter((check) => check.test(password)).length;

  $("scoreValue").textContent = result.score;
  $("entropyValue").textContent = Math.round(result.entropy);
  $("scoreFill").style.width = `${result.score}%`;
  $("ratingLabel").textContent = result.rating;
  $("crackTime").textContent = password ? `Offline attack: ${result.crackTime}` : "No estimate yet";
  $("summaryBox").textContent = result.summary;
  $("passedCount").textContent = `${passed} passed`;
  renderChecklist(password);
  renderAdvice(result.advice);
}

function scorePassword(password) {
  if (!password) {
    return {
      score: 0,
      entropy: 0,
      rating: "Start typing",
      crackTime: "No estimate yet",
      summary: "Enter a password to get a local strength score and recommendations.",
      advice: [
        ["Use length first", "Aim for 14 or more characters, or use a 4 to 5 word passphrase."],
        ["Prefer uniqueness", "Every important account should have a different password stored in a password manager."]
      ]
    };
  }

  const entropy = estimateEntropy(password);
  let score = Math.min(100, Math.round(entropy * 1.7));
  const advice = [];

  if (password.length < 14) {
    score -= 18;
    advice.push(["Make it longer", "Length is the most reliable upgrade. Add words or generate a longer password."]);
  }
  if (characterClasses(password) < 3) {
    score -= 10;
    advice.push(["Add variety", "A mix of character types increases the search space for attackers."]);
  }
  if (isCommonPassword(password)) {
    score -= 45;
    advice.push(["Replace it", "This looks like a common password or a common password with predictable changes."]);
  }
  if (hasSequence(password)) {
    score -= 20;
    advice.push(["Remove sequences", "Attackers try alphabet runs, keyboard walks, and number ladders early."]);
  }
  if (/(.)\1{3,}/.test(password)) {
    score -= 15;
    advice.push(["Reduce repetition", "Repeated characters add less protection than fresh words or random symbols."]);
  }
  if (hasPredictableSubstitutions(password)) {
    score -= 15;
    advice.push(["Avoid substitutions", "Swapping letters for symbols is widely guessed by cracking tools."]);
  }

  score = clamp(score, 0, 100);
  const rating = score >= 85 ? "Strong" : score >= 65 ? "Good" : score >= 40 ? "Fair" : "Weak";
  const summary = summaryFor(score);
  if (!advice.length) {
    advice.push(["Store it safely", "Save this in a password manager and avoid reusing it across accounts."]);
    advice.push(["Add MFA", "Use multi-factor authentication for email, banking, cloud, and admin accounts."]);
  }

  return {
    score,
    entropy,
    rating,
    crackTime: crackTime(entropy),
    summary,
    advice
  };
}

function renderChecklist(password) {
  const list = $("checklist");
  const template = $("checkTemplate");
  list.innerHTML = "";

  checks.forEach((check) => {
    const passed = password ? check.test(password) : false;
    const node = template.content.cloneNode(true);
    const item = node.querySelector(".check-item");
    item.dataset.passed = String(passed);
    node.querySelector("span").textContent = passed ? "OK" : "!";
    node.querySelector("strong").textContent = check.label;
    node.querySelector("small").textContent = check.detail;
    list.appendChild(node);
  });
}

function renderAdvice(items) {
  $("adviceList").innerHTML = items.map(([title, detail]) => `
    <article>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `).join("");
}

function renderMfa() {
  const list = $("mfaList");
  const template = $("mfaTemplate");
  list.innerHTML = "";

  mfaAccounts.forEach((account) => {
    const current = mfaState[account.id];
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".mfa-card");
    const toggle = node.querySelector("input");
    const methodSelect = node.querySelector("select");
    const method = current.enabled ? current.method : "none";

    card.dataset.status = current.enabled ? methodStatus(method) : "missing";
    node.querySelector("strong").textContent = account.name;
    node.querySelector("small").textContent = account.detail;
    node.querySelector("p").textContent = current.enabled ? methodGuidance(method, account.guidance) : account.guidance;
    toggle.checked = current.enabled;
    toggle.setAttribute("aria-label", `${account.name} MFA enabled`);
    methodSelect.disabled = !current.enabled;

    mfaMethods.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      methodSelect.appendChild(option);
    });
    methodSelect.value = method;

    toggle.addEventListener("change", (event) => {
      current.enabled = event.target.checked;
      if (current.enabled && current.method === "none") current.method = "app";
      if (!current.enabled) current.method = "none";
      renderMfa();
    });

    methodSelect.addEventListener("change", (event) => {
      current.method = event.target.value;
      current.enabled = current.method !== "none";
      renderMfa();
    });

    list.appendChild(node);
  });

  updateMfaSummary();
}

function updateMfaSummary() {
  const protectedCount = mfaAccounts.filter((account) => mfaState[account.id].enabled).length;
  const score = Math.round(mfaAccounts.reduce((sum, account) => {
    const state = mfaState[account.id];
    return sum + (state.enabled ? methodWeight(state.method) : 0);
  }, 0));
  const cappedScore = clamp(score, 0, 100);
  const allProtected = protectedCount === mfaAccounts.length;

  $("mfaScore").textContent = cappedScore;
  $("mfaValue").textContent = `${protectedCount}/4`;
  $("mfaBadge").textContent = `${protectedCount} protected`;
  $("mfaBadge").className = `verdict ${allProtected ? "safe" : protectedCount ? "warning" : "danger"}`;
  $("mfaSummary").textContent = mfaSummaryFor(protectedCount, cappedScore);
}

function methodWeight(method) {
  return mfaMethods.find((item) => item.value === method)?.weight || 0;
}

function methodStatus(method) {
  return method === "key" || method === "push" || method === "app" ? "protected" : "partial";
}

function methodGuidance(method, fallback) {
  if (method === "key") return "Why it helps: a security key proves you have a physical device and resists fake sign-in pages. Keep one backup key in a separate safe place.";
  if (method === "app") return "Why it helps: an authenticator app creates short-lived codes on your device. Store recovery codes outside the account itself.";
  if (method === "push") return "Why it helps: number matching makes random approval prompts easier to reject. Only approve sign-ins you started.";
  if (method === "sms") return "Why it helps: SMS adds a second step, but phone numbers can be transferred. Upgrade to an app or key when you can.";
  if (method === "email") return "Why it helps: email codes are better than password-only, but they depend on your email account being protected first.";
  return fallback;
}

function mfaSummaryFor(protectedCount, score) {
  if (protectedCount === 0) return "Start with email, then banking, cloud, and admin accounts. Prefer security keys or authenticator apps over SMS where possible.";
  if (protectedCount < 4) return "Good start. Finish the remaining priority accounts, then save recovery codes and review trusted devices.";
  if (score >= 85) return "Excellent MFA coverage. Keep recovery codes offline and maintain at least one backup method.";
  return "Coverage is complete. Upgrade SMS or email codes to authenticator apps, number-matching push, or security keys when available.";
}

async function checkPwned() {
  const password = $("passwordInput").value;
  if (!password) {
    setBreachState("neutral", "Idle", 0, "Enter a password before running the breach check.", "Not checked online");
    return;
  }

  try {
    setBreachState("neutral", "Checking", 0, "Hashing locally and checking the pwned range.", "Checking hash prefix");
    const hash = await sha1(password);
    if (hash === lastPwnedHash) return;
    lastPwnedHash = hash;
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(`${PWNED_API}${prefix}`, {
      headers: { "Add-Padding": "true" }
    });
    if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);

    const text = await response.text();
    const match = text.split(/\r?\n/).find((line) => line.startsWith(suffix));
    const count = match ? Number(match.split(":")[1]) : 0;

    if (count > 0) {
      setBreachState("danger", "Exposed", count, `This password appears in known breaches ${count.toLocaleString()} time(s). Change it anywhere it is used.`, "Hash prefix checked");
    } else {
      setBreachState("safe", "Not found", 0, "This password was not found in the pwned password corpus. Keep using the strength guidance too.", "Hash prefix checked");
    }
  } catch {
    setBreachState("warning", "Unavailable", 0, "The online breach lookup could not be reached. Strength checks still ran locally.", "Lookup unavailable");
  }
}

function resetPwned() {
  setBreachState("neutral", "Idle", 0, "Use the breach check when you are ready. The browser hashes the password first and sends only the first 5 hash characters to the lookup service.", "Not checked online");
}

function setBreachState(status, label, count, message, privacy) {
  $("breachBadge").textContent = label;
  $("breachBadge").className = `verdict ${status}`;
  $("breachCount").textContent = count > 999 ? `${Math.round(count / 1000)}k` : String(count);
  $("pwnedValue").textContent = status === "neutral" ? "-" : count > 0 ? "Yes" : "No";
  $("breachMessage").textContent = message;
  $("privacyBadge").textContent = privacy;
}

function toggleVisibility() {
  const input = $("passwordInput");
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  $("toggleVisibility").textContent = visible ? "Show" : "Hide";
  $("toggleVisibility").setAttribute("aria-label", visible ? "Show password" : "Hide password");
  $("toggleVisibility").title = visible ? "Show password" : "Hide password";
}

async function copyPassword() {
  const password = $("passwordInput").value;
  if (!password || !navigator.clipboard) return;
  await navigator.clipboard.writeText(password);
  $("privacyBadge").textContent = "Copied locally";
}

function clearPassword() {
  $("passwordInput").value = "";
  lastPwnedHash = "";
  resetPwned();
  updateStrength();
}

function setGeneratedPassword(password) {
  $("passwordInput").value = password;
  lastPwnedHash = "";
  resetPwned();
  updateStrength();
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";
  const bytes = crypto.getRandomValues(new Uint32Array(20));
  return [...bytes].map((value) => chars[value % chars.length]).join("");
}

function generatePassphrase() {
  const bytes = crypto.getRandomValues(new Uint32Array(5));
  const words = [...bytes].map((value) => dictionaryWords[value % dictionaryWords.length]);
  const number = crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10;
  return `${words.join("-")}-${number}`;
}

async function sha1(value) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function estimateEntropy(password) {
  const pool = poolSize(password);
  const raw = Math.log2(pool) * password.length;
  const duplicatePenalty = Math.max(0, password.length - new Set(password).size) * 1.5;
  const wordPenalty = /[a-z]{5,}/i.test(password) ? 8 : 0;
  return Math.max(0, raw - duplicatePenalty - wordPenalty);
}

function poolSize(password) {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 33;
  return Math.max(pool, 1);
}

function characterClasses(password) {
  return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
}

function isCommonPassword(password) {
  const normalized = normalizePassword(password);
  return commonPasswords.has(normalized) || commonPasswords.has(normalized.replace(/\d+$/g, ""));
}

function normalizePassword(password) {
  return password
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[$5]/g, "s")
    .replace(/[3]/g, "e")
    .replace(/[7]/g, "t");
}

function hasPredictableSubstitutions(password) {
  const normalized = normalizePassword(password);
  return normalized.includes("password") || normalized.includes("welcome") || normalized.includes("admin");
}

function hasSequence(password) {
  const value = password.toLowerCase();
  const sequences = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  return sequences.some((sequence) => {
    for (let index = 0; index <= sequence.length - 4; index += 1) {
      const chunk = sequence.slice(index, index + 4);
      if (value.includes(chunk) || value.includes([...chunk].reverse().join(""))) return true;
    }
    return false;
  });
}

function crackTime(entropy) {
  const guessesPerSecond = 10000000000;
  const seconds = Math.pow(2, entropy) / guessesPerSecond;
  if (seconds < 1) return "instant";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;
  if (seconds < 31536000000) return `${Math.round(seconds / 31536000)} years`;
  return "centuries";
}

function summaryFor(score) {
  if (score >= 85) return "Strong password. It has enough length and unpredictability for normal account use.";
  if (score >= 65) return "Good password. A little more length or randomness would make it stronger.";
  if (score >= 40) return "Fair password. Improve it before using it for an important account.";
  return "Weak password. Use a generated password or a longer passphrase instead.";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

init();
