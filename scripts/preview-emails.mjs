import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { ScoutEmailTemplates } from "../packages/adapters/dist/notifications/public.js";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(values.out ?? join(root, "dist/email-previews"));
const templates = new ScoutEmailTemplates("https://app.scoutalert.example");
const checkedAt = "2026-11-09T09:30:00Z";
const design = {
  id: "preview-design",
  kind: "job",
  title: "Senior Product Designer",
  company: "Northstar Studio",
  location: "Remote · Worldwide",
  url: "https://example.com/careers/product-designer",
  checkedAt,
  scouts: ["My next design role"],
  reasons: [
    "Product design and design systems are central to this role.",
    "The posting explicitly welcomes remote applicants worldwide.",
  ],
  uncertainties: ["The salary range is not stated in the posting."],
  availability: { status: "available", checkedAt },
};
const project = {
  ...design,
  id: "preview-project",
  kind: "client_request",
  title: "A thoughtful website for a growing studio",
  company: "Fieldwork Collective",
  location: "Remote · Project work",
  url: "https://example.com/projects/studio-website",
  scouts: ["Remote web projects"],
  reasons: [
    "The client is seeking a designer and developer for a five-page website.",
    "The brief specifies remote delivery and a six-week project window.",
  ],
  uncertainties: ["Confirm the budget and the final scope with the client."],
};
const prompt = {
  ...project,
  id: "preview-prompt",
  title: "Design a customer onboarding experience",
  company: "Common Ground",
  url: "https://example.com/projects/onboarding-design",
  scouts: ["Remote product design projects"],
  reasons: [
    "The brief requests the onboarding and product design skills you specified.",
    "Remote delivery, applicant location and the project budget match your confirmed brief.",
  ],
  uncertainties: [],
};
const samples = [
  {
    id: "sign-in",
    name: "Sign-in code",
    description: "Account access",
    ...templates.signInCode({ code: "482916", expiresInMinutes: 10 }),
  },
  {
    id: "digest",
    name: "Opportunity digest",
    description: "Daily and weekly alerts",
    ...templates.opportunities({
      kind: "digest",
      opportunities: [design, project],
    }),
  },
  {
    id: "prompt",
    name: "Prompt match alert",
    description: "A closer match to a brief",
    ...templates.opportunities({ kind: "prompt", opportunities: [prompt] }),
  },
  {
    id: "connection",
    name: "Delivery test",
    description: "Email setup verification",
    ...templates.connectionCheck(),
  },
];

await mkdir(directory, { recursive: true });
for (const sample of samples) {
  await writeFile(join(directory, `${sample.id}.html`), sample.html);
  await writeFile(join(directory, `${sample.id}.txt`), sample.text);
}

const data = JSON.stringify(samples).replaceAll("<", "\\u003c");
const gallery = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ScoutAlert email studio</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef0f2;color:#191c22;font-family:Arial,Helvetica,sans-serif}header{padding:28px 36px;border-bottom:1px solid #dde1e6;background:white;display:flex;align-items:center;justify-content:space-between;gap:24px}header strong{font-size:24px;letter-spacing:-1px}header span{font-size:13px;color:#52606f}.studio{display:grid;grid-template-columns:250px 1fr;min-height:calc(100vh - 87px)}aside{padding:30px 20px;background:white;border-right:1px solid #dde1e6}h1{font-size:14px;margin:0 12px 20px;font-weight:700}nav{display:grid;gap:8px}button{font:inherit;cursor:pointer}nav button{border:1px solid transparent;background:white;border-radius:10px;padding:15px 12px;text-align:left;font-size:14px;color:#191c22}nav button[aria-pressed=true]{background:#f1f5df;border-color:#d4dfa7}nav small{display:block;margin-top:5px;color:#52606f;font-size:12px}aside p{font-size:12px;line-height:19px;color:#52606f;margin:26px 12px}main{min-width:0;padding:28px 32px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:850px;margin:0 auto 22px}.sizes{display:flex;gap:4px;padding:4px;background:#dde1e6;border-radius:8px}.sizes button{font-size:12px;padding:8px 12px;border:0;background:transparent;border-radius:5px}.sizes button[aria-pressed=true]{background:white}.files{display:flex;gap:16px;flex-wrap:wrap}.files a{color:#394657;font-size:12px;text-underline-offset:3px}.envelope{max-width:850px;margin:auto}.meta{background:white;padding:18px 22px;border:1px solid #dde1e6;border-radius:12px 12px 0 0;font-size:13px;line-height:22px}.meta span{color:#52606f;margin-right:12px}.meta p{margin:0}.viewport{margin:auto;background:#f6f7f8;border:1px solid #dde1e6;border-top:0;transition:width .2s;max-width:100%;width:100%;border-radius:0 0 12px 12px;overflow:hidden}iframe{border:0;display:block;width:100%;height:1000px;background:#f6f7f8}button:focus-visible,a:focus-visible{outline:2px solid #476126;outline-offset:4px}@media(max-width:780px){header{padding:22px}header span{display:none}.studio{display:block}aside{padding:20px;border-right:0;border-bottom:1px solid #dde1e6}h1,aside p{display:none}nav{grid-template-columns:1fr 1fr}main{padding:20px 12px}.toolbar{align-items:flex-start}.files{justify-content:flex-end;gap:10px}}@media(prefers-reduced-motion:reduce){.viewport{transition:none}}
</style></head><body><header><strong>ScoutAlert<span style="color:#6c822d;font-size:24px;">.</span></strong><span>Email studio / Transactional collection</span></header><div class="studio"><aside><h1>Email templates</h1><nav aria-label="Choose an email"></nav><p>These previews use the same templates as the API and worker. All opportunities and codes shown here are fictional.</p><p>Both HTML and plain-text versions are included. No emails are sent by this preview.</p></aside><main><div class="toolbar"><div class="sizes" aria-label="Preview width"><button data-width="100%" aria-pressed="true">Desktop</button><button data-width="375px" aria-pressed="false">Mobile</button></div><div class="files"><a id="html" target="_blank" rel="noopener">Open HTML</a><a id="text" target="_blank" rel="noopener">Plain text</a></div></div><div class="envelope"><div class="meta"><p><span>From</span>ScoutAlert</p><p><span>Subject</span><strong id="subject"></strong></p></div><div class="viewport"><iframe title="ScoutAlert email preview" sandbox="allow-same-origin"></iframe></div></div></main></div><script>
const samples=${data};const frame=document.querySelector('iframe');const nav=document.querySelector('nav');
function resize(){frame.style.height='0px';frame.style.height=(frame.contentDocument?.body?.scrollHeight||1000)+'px'}
function select(index){const sample=samples[index];frame.srcdoc=sample.html;document.querySelector('#subject').textContent=sample.subject;document.querySelector('#html').href=sample.id+'.html';document.querySelector('#text').href=sample.id+'.txt';nav.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)))}
samples.forEach((sample,index)=>{const button=document.createElement('button');const name=document.createElement('strong');const description=document.createElement('small');name.textContent=sample.name;description.textContent=sample.description;button.append(name,description);button.addEventListener('click',()=>select(index));nav.append(button)});
document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.viewport').style.width=button.dataset.width;document.querySelectorAll('[data-width]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));setTimeout(resize,250)}));frame.addEventListener('load',resize);window.addEventListener('resize',resize);select(0);
</script></body></html>`;
await writeFile(join(directory, "index.html"), gallery);
console.log(
  `Email previews written to ${join(directory, "index.html")}. No email sent.`,
);
