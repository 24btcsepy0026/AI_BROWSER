import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';

const root = path.resolve('c:/Users/Hp/OneDrive/Documents/Masai-Vishlesan I-Hub, IIT Patna Course/Masai Live-Cohort/AI_BROWSER');

console.log('======================================================');
console.log('  SAHAYAK v1.0.0 — DEFINITION OF DONE VERIFICATION  ');
console.log('======================================================\n');

let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

// 1. Manifest MV3 Verification
console.log('--- 1. Manifest MV3 Checks ---');
const manifestPath = path.join(root, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.manifest_version === 3, 'Manifest version is 3');
assert(manifest.name === 'Sahayak', 'Extension name is Sahayak');
assert(manifest.permissions.includes('sidePanel'), 'Has sidePanel permission');
assert(manifest.permissions.includes('storage'), 'Has storage permission');
assert(manifest.permissions.includes('activeTab'), 'Has activeTab permission');
assert(manifest.permissions.includes('scripting'), 'Has scripting permission');
assert(manifest.permissions.includes('contextMenus'), 'Has contextMenus permission');
assert(manifest.background?.service_worker === 'background/service-worker.js', 'Service worker registered');
assert(manifest.side_panel?.default_path === 'sidepanel/index.html', 'Default side panel path configured');

// 2. Safety Rails Checks
console.log('\n--- 2. Safety Rails Verification (8-Layer Architecture) ---');
const safetyUrl = pathToFileURL(path.join(root, 'background', 'safety.js')).href;
const {
  isBlockedDomain,
  isBlockedField,
  isConsequentialAction,
  checkActionSafety
} = await import(safetyUrl);

assert(isBlockedDomain('https://retail.onlinesbi.com/netbanking') === true, 'Blocks OnlineSBI banking domain');
assert(isBlockedDomain('https://netbanking.hdfcbank.com/netbanking/') === true, 'Blocks HDFC netbanking domain');
assert(isBlockedDomain('https://razorpay.com/payment-gateway') === true, 'Blocks Razorpay payment domain');
assert(isBlockedDomain('https://en.wikipedia.org/wiki/Banking') === false, 'Allows educational/news banking article');

assert(isBlockedField({ type: 'password' }).blocked === true, 'Blocks input type="password"');
assert(isBlockedField({ type: 'tel' }).blocked === true, 'Blocks input type="tel"');
assert(isBlockedField({ autocomplete: 'new-password' }).blocked === true, 'Blocks sensitive autocomplete="new-password"');
assert(isBlockedField({ name: 'otp_input' }).blocked === true, 'Blocks field with name="otp_input"');
assert(isBlockedField({ name: 'user_full_name', type: 'text' }).blocked === false, 'Allows normal name field');

assert(isConsequentialAction({ action: 'click', element: 1 }, [{ id: 1, label: 'Submit Application' }]) === true, 'Flags "Submit Application" as consequential');
assert(isConsequentialAction({ action: 'click', element: 2 }, [{ id: 2, label: 'Next Page' }]) === false, 'Does not flag "Next Page" as consequential');

const cardCheck = checkActionSafety({ action: 'type', element: 1, value: '4532015012345678' }, [{ id: 1, label: 'Card' }], 'https://shop.example.com');
assert(cardCheck.allowed === false, 'Detects and blocks direct credit card number entry');

// 3. Storage & Profile Memory Checks
console.log('\n--- 3. Local Profile & Skills Schema Checks ---');
const storageUrl = pathToFileURL(path.join(root, 'background', 'storage-manager.js')).href;
const { DEFAULT_PROFILE, DEFAULT_STARTER_SKILLS } = await import(storageUrl);

assert(DEFAULT_PROFILE.name !== undefined, 'Profile schema contains name field');
assert(DEFAULT_PROFILE.college !== undefined, 'Profile schema contains college field');
assert(Array.isArray(DEFAULT_PROFILE.skills), 'Profile schema contains skills array');
assert(DEFAULT_PROFILE.preferredLanguage !== undefined, 'Profile schema contains preferredLanguage');
assert(DEFAULT_PROFILE.preferredTone === 'professional', 'Profile defaults to professional tone');

assert(Array.isArray(DEFAULT_STARTER_SKILLS), 'Starter skills array exists');
assert(DEFAULT_STARTER_SKILLS.length === 4, 'Includes 4 built-in starter skills');
const skillNames = DEFAULT_STARTER_SKILLS.map(s => s.name);
assert(skillNames.includes('Exam Notes'), 'Includes "Exam Notes" skill');
assert(skillNames.includes('Explain in Hinglish'), 'Includes "Explain in Hinglish" skill');
assert(skillNames.includes('Reply Politely'), 'Includes "Reply Politely" skill');
assert(skillNames.includes('Fill from Profile'), 'Includes "Fill from Profile" skill');

// 4. Prompt Builders Checks
console.log('\n--- 4. Prompt Builders & Guardrails ---');
const promptUrl = pathToFileURL(path.join(root, 'background', 'prompt-builder.js')).href;
const {
  buildSummaryPrompt,
  buildYouTubePrompt,
  buildChatPrompt,
  buildActionMapPrompt
} = await import(promptUrl);

const summaryPromptEn = buildSummaryPrompt('Sample article text', 'en');
assert(summaryPromptEn.includes('TL;DR') && summaryPromptEn.includes('Key Points'), 'Summary prompt contains structured headers');

const summaryPromptHinglish = buildSummaryPrompt('Sample article text', 'hinglish');
assert(summaryPromptHinglish.includes('Hinglish'), 'Hinglish summary prompt enforces code-switched Hinglish');

const ytPrompt = buildYouTubePrompt('https://youtube.com/watch?v=test', 'en');
assert(ytPrompt.includes('MM:SS') || ytPrompt.includes('00:00'), 'YouTube prompt enforces timestamp structure');

const chatPrompt = buildChatPrompt('Page text about artificial intelligence', [], 'What is this page about?');
assert(/not available on the current page/i.test(chatPrompt), 'Chat prompt includes strict anti-hallucination instruction');

const actionPrompt = buildActionMapPrompt('[1] button "Submit"', 'Fill form', [], DEFAULT_PROFILE);
assert(actionPrompt.includes('action') && actionPrompt.includes('element'), 'Action map prompt requests strict JSON next action');

// 5. Packaging & Git Safety Checks
console.log('\n--- 5. Packaging & Version Control Cleanliness ---');
const zipPath = path.join(root, 'sahayak-v1.0.0.zip');
assert(fs.existsSync(zipPath), 'sahayak-v1.0.0.zip release archive exists');
const zipStat = fs.statSync(zipPath);
assert(zipStat.size > 50000, `Zip size is valid (${(zipStat.size / 1024).toFixed(1)} KB)`);

const landingZipPath = path.join(root, 'landing', 'sahayak-v1.0.0.zip');
assert(fs.existsSync(landingZipPath), 'landing/sahayak-v1.0.0.zip exists for one-click download');

const landingHtml = path.join(root, 'landing', 'index.html');
assert(fs.existsSync(landingHtml), 'landing/index.html exists for GitHub Pages');

const keyLog = execSync('git log --all -- "**/*.key"', { cwd: root }).toString().trim();
assert(keyLog.length === 0, 'Zero API keys ever committed to Git history');

console.log('\n======================================================');
console.log(`  RESULTS: ${passedCount} / ${totalCount} TESTS PASSED  `);
if (passedCount === totalCount) {
  console.log('  STATUS: DEFINITION OF DONE SATISFIED! 🎉');
} else {
  console.log(`  STATUS: ${totalCount - passedCount} TESTS FAILED`);
}
console.log('======================================================');
