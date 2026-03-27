const fs = require('fs');

function setOutput(name, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const issuePath = process.env.GITHUB_EVENT_PATH;
if (!issuePath) {
  fail('找不到 GITHUB_EVENT_PATH');
}

const event = JSON.parse(fs.readFileSync(issuePath, 'utf8'));
const issue = event.issue;

if (!issue) {
  fail('找不到 issue payload');
}

const body = issue.body || '';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(bodyText, label, nextLabels = []) {
  const normalized = bodyText.replace(/\r\n/g, '\n');
  const nextSectionPattern = nextLabels.length
    ? `(?=\\n###\\s*(?:${nextLabels.map(escapeRegExp).join('|')})\\s*\\n|$)`
    : '(?=$)';
  const pattern = new RegExp(
    `###\\s*${escapeRegExp(label)}\\s*\\n([\\s\\S]*?)${nextSectionPattern}`
  );
  const match = normalized.match(pattern);
  return match ? match[1].trim() : '';
}

const content = extractSection(body, '文章內容 / Article Content', [
  '參考資料 / Sources',
]);

if (!content) {
  fail('找不到「文章內容 / Article Content」欄位');
}

if (!content || content === '_No response_') {
  fail('「文章內容 / Article Content」欄位是空的');
}

const categoryRaw =
  extractSection(body, '分類 / Category', ['文章內容 / Article Content']) ||
  'uncategorized';

// "History (歷史)" -> "History"
const category = categoryRaw.replace(/\s*\(.*?\)\s*$/, '').trim();

// 產生 slug
const slugBase = (issue.title || `article-${issue.number}`)
  .replace(/^\[Article\]\s*/i, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const slug = slugBase || `article-${issue.number}`;

// 指定目錄
const dir = `knowledge/${category.toLowerCase()}`;
const filename = `${slug}.md`;
const filepath = `${dir}/${filename}`;
const branch = `content/issue-${issue.number}-${slug}`;

setOutput('content', content);
setOutput('category', category);
setOutput('dir', dir);
setOutput('filename', filename);
setOutput('filepath', filepath);
setOutput('branch', branch);
